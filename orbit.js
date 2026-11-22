const cards = Array.from(document.querySelectorAll('.link-card'));
const stage = document.querySelector('#orbit-stage');
const navigation = document.querySelector('#orbit-links');
const motion = matchMedia('(prefers-reduced-motion: reduce)');

if ('IntersectionObserver' in window && !motion.matches) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, { rootMargin: '0px 0px -28px 0px', threshold: 0.12 });

  for (const card of cards) {
    card.classList.add('reveal-item');
    observer.observe(card);
  }
}

const orbitPeriod = 32000;
const springRate = 0.011;
const canHover = matchMedia('(any-hover: hover)');
const size = { width: 0, height: 0, radiusY: 0, hitRadius: 0 };
let track = [];
let trackLength = 0;


function makeTrack() {
  const radiusX = Math.max(0, Math.min(323, size.width / 2 - size.hitRadius - 6));
  size.radiusY = Math.max(0, Math.min(220, size.height / 2 - size.hitRadius - 10));
  trackLength = 0;
  track = [];
  for (let step = 0; step <= 180; step++) {
    const angle = 2 * Math.PI * step / 180 - Math.PI / 2;
    const x = radiusX * Math.cos(angle);
    const y = size.radiusY * Math.sin(angle);
    const previous = track[step - 1];
    if (previous) trackLength += Math.hypot(x - previous.x, y - previous.y);
    track.push({ x, y, distance: trackLength });
  }
}

function destination(bubble) {
  if (bubble.placement) {
    const { x, y, angle } = bubble.placement;
    const a = angle + bubble.progress * Math.PI * 2;
    const radiusX = 13 + 1.8 * bubble.index;
    const radiusY = 9 + 1.2 * bubble.index;
    return {
      x: x + radiusX * (Math.cos(a) - Math.cos(angle)),
      y: y + radiusY * (Math.sin(a) - Math.sin(angle)),
    };
  }
  const distance = ((bubble.progress + bubble.phase) % 1) * trackLength;
  let left = 0;
  let right = track.length - 1;
  while (right - left > 1) {
    const middle = (left + right) >> 1;
    if (track[middle].distance < distance) left = middle;
    else right = middle;
  }
  const from = track[left];
  const to = track[right];
  const amount = (distance - from.distance) / (to.distance - from.distance || 1);
  return {
    x: (from.x + (to.x - from.x) * amount) * bubble.radius,
    y: (from.y + (to.y - from.y) * amount) * bubble.radius,
  };
}

function render(bubble) {
  const { link, x, y } = bubble;
  link.style.setProperty('--x', `${x.toFixed(2)}px`);
  link.style.setProperty('--y', `${y.toFixed(2)}px`);
  const depth = Math.max(-1, Math.min(1, y / (size.radiusY || 1)));
  link.style.setProperty('--orbit-depth', motion.matches ? '1' : String(0.97 + 0.03 * depth));
  const limit = Math.max(0, (size.width - bubble.labelWidth) / 2);
  const labelX = Math.max(-limit, Math.min(limit, x));
  link.style.setProperty('--label-shift', `${(labelX - x).toFixed(2)}px`);
}

function offsetAt(offset, velocity, time) {
  // Critically damped spring around the moving point, with the release velocity as its initial condition.
  return (offset + (velocity + springRate * offset) * time) * Math.exp(-springRate * time);
}

function choosePlacement(bubble) {
  const clearance = Math.max(36, size.hitRadius * 1.65);
  const free = (x, y) => bubbles.every(other => other === bubble ||
    Math.hypot(x - other.x, y - other.y) >= clearance);
  const inside = (x, y) => Math.abs(x) <= size.width / 2 && Math.abs(y) <= size.height / 2;
  const atDrop = { x: bubble.x, y: bubble.y, angle: bubble.x < 0 ? Math.PI : 0 };
  if (free(atDrop.x, atDrop.y)) return atDrop;

  // Look just around the drop point if another link already occupies it.
  for (const radius of [clearance / 2, clearance]) {
    for (let direction = 0; direction < 8; direction++) {
      const a = direction * Math.PI / 4;
      const x = atDrop.x + radius * Math.cos(a);
      const y = atDrop.y + radius * Math.sin(a);
      if (free(x, y) && (!inside(atDrop.x, atDrop.y) || inside(x, y))) {
        return { x, y, angle: x < 0 ? Math.PI : 0 };
      }
    }
  }
  return atDrop;
}

function rejoin(bubble, target, vx = 0, vy = 0) {
  bubble.returning = { x: bubble.x - target.x, y: bubble.y - target.y, vx, vy, time: 0 };
}

const bubbles = cards.map((card, index) => {
  const link = document.createElement('a');
  link.className = 'orbit-link';
  for (const attribute of ['href', 'target', 'rel', 'aria-label']) {
    if (card.hasAttribute(attribute)) link.setAttribute(attribute, card.getAttribute(attribute));
  }
  link.draggable = false;

  const label = document.createElement('span');
  label.className = 'orbit-label';
  label.setAttribute('aria-hidden', 'true');
  label.textContent = card.querySelector('strong').textContent;
  link.append(card.querySelector('.link-icon').cloneNode(true), label);
  navigation.append(link);

  const bubble = {
    link, label, index, phase: index / cards.length, progress: 0,
    radius: 0.89 + 0.11 * index / Math.max(cards.length - 1, 1), placement: null,
    x: 0, y: 0, pointer: null, returning: null, held: false, blockClick: false,
  };
  link.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary || bubble.pointer) return;
    bubble.blockClick = false;
    bubble.returning = null;
    bubble.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
      time: event.timeStamp, vx: 0, vy: 0, moved: false };
    link.setPointerCapture(event.pointerId);
  });
  link.addEventListener('pointermove', (event) => {
    const pointer = bubble.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;

    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.moved) {
      if (Math.hypot(dx, dy) < 7) return;
      pointer.moved = true;
      bubble.blockClick = true;
      link.classList.add('is-dragging');
    }

    const x = bubble.x + dx;
    const y = bubble.y + dy;
    const elapsed = Math.max(12, event.timeStamp - pointer.time);
    pointer.vx = Math.max(-0.65, Math.min(0.65, (x - bubble.x) / elapsed));
    pointer.vy = Math.max(-0.65, Math.min(0.65, (y - bubble.y) / elapsed));
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.time = event.timeStamp;
    Object.assign(bubble, { x, y });
    render(bubble);
  });

  function release(event) {
    const pointer = bubble.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    bubble.pointer = null;
    link.classList.remove('is-dragging');
    if (pointer.moved) {
      bubble.placement = choosePlacement(bubble);
      bubble.progress = 0;
      bubble.held = false;
    }
    const target = destination(bubble);
    const flick = event.type === 'pointerup' && pointer.moved && event.timeStamp - pointer.time < 85;
    if (motion.matches) {
      Object.assign(bubble, target);
      render(bubble);
    } else if (pointer.moved) {
      rejoin(bubble, target, flick ? pointer.vx : 0, flick ? pointer.vy : 0);
    } else {
      bubble.held = true;
    }
  }

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) link.addEventListener(type, release);
  link.addEventListener('click', (event) => {
    if (bubble.blockClick && event.detail !== 0) event.preventDefault();
  });
  link.addEventListener('dragstart', (event) => event.preventDefault());
  return bubble;
});

function measure() {
  const previousWidth = size.width;
  const previousHeight = size.height;
  size.width = stage.clientWidth;
  size.height = stage.clientHeight;
  size.hitRadius = (bubbles[0]?.link.offsetWidth || 0) / 2;
  makeTrack();
  for (const bubble of bubbles) {
    bubble.labelWidth = bubble.label.offsetWidth;
    if (!bubble.pointer) {
      if (bubble.placement && previousWidth && previousHeight) {
        bubble.placement.x *= size.width / previousWidth;
        bubble.placement.y *= size.height / previousHeight;
      }
      bubble.returning = null;
      Object.assign(bubble, destination(bubble));
    }
    render(bubble);
  }
}

navigation.hidden = false;
measure();
window.addEventListener('resize', measure);
document.fonts?.ready.then(measure);

let visible = true;
let animationFrame = 0;
let previousTime = 0;

function animate(time) {
  animationFrame = 0;
  const elapsed = previousTime ? Math.min(50, time - previousTime) : 0;
  previousTime = time;

  for (const bubble of bubbles) {
    if (bubble.pointer) continue;

    const focused = bubble.link.matches(':focus-visible');
    const hovered = canHover.matches && bubble.link.matches(':hover');
    if (!bubble.returning && (focused || hovered)) {
      bubble.held = true;
      bubble.returning = null;
      continue;
    }
    const period = bubble.placement ? 4200 + 260 * bubble.index : orbitPeriod;
    bubble.progress = (bubble.progress + elapsed / period) % 1;
    const target = destination(bubble);
    if (bubble.held && !bubble.returning) rejoin(bubble, target);
    bubble.held = false;

    if (bubble.returning) {
      const flight = bubble.returning;
      flight.time += elapsed;
      bubble.x = target.x + offsetAt(flight.x, flight.vx, flight.time);
      bubble.y = target.y + offsetAt(flight.y, flight.vy, flight.time);
      if (flight.time >= 1000) {
        bubble.returning = null;
        Object.assign(bubble, target);
      }
    } else {
      Object.assign(bubble, target);
    }
    render(bubble);
  }

  syncAnimation();
}

function syncAnimation() {
  if (visible && !motion.matches && !document.hidden) {
    if (!animationFrame) animationFrame = requestAnimationFrame(animate);
  } else {
    cancelAnimationFrame(animationFrame);
    animationFrame = previousTime = 0;
  }
}

if ('IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncAnimation();
  }).observe(stage);
}
motion.addEventListener('change', () => {
  if (motion.matches) measure();
  syncAnimation();
});
document.addEventListener('visibilitychange', syncAnimation);
syncAnimation();
