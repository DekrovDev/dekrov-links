const cards = Array.from(document.querySelectorAll('.link-card'));
const stage = document.querySelector('#orbit-stage');
const navigation = document.querySelector('#orbit-links');
const guides = document.querySelector('#orbit-guides');
const identity = stage.querySelector('.identity');
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

const springRate = 0.0058;
const returnDuration = 1600;
const canHover = matchMedia('(any-hover: hover)');
let hitRadius = 0;

function makeTrack(radiusX, radiusY) {
  let length = 0;
  const points = [];
  for (let step = 0; step <= 180; step++) {
    const angle = 2 * Math.PI * step / 180 - Math.PI / 2;
    const x = radiusX * Math.cos(angle);
    const y = radiusY * Math.sin(angle);
    const previous = points[step - 1];
    if (previous) length += Math.hypot(x - previous.x, y - previous.y);
    points.push({ x, y, distance: length });
  }
  return { points, length, radiusY };
}

function destination(bubble, progress = bubble.progress) {
  const { points: track, length: trackLength } = bubble.track;
  const distance = progress * trackLength;
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
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

function render(bubble) {
  const { link, x, y } = bubble;
  link.style.setProperty('--x', `${x.toFixed(2)}px`);
  link.style.setProperty('--y', `${y.toFixed(2)}px`);
  const depth = Math.max(-1, Math.min(1, y / (bubble.track.radiusY || 1)));
  link.style.setProperty('--orbit-depth', motion.matches ? '1' : String(0.97 + 0.03 * depth));
  link.classList.toggle('preview-left', x > 0);
}

function offsetAt(offset, velocity, time) {
  // Critically damped spring around the moving point, with the release velocity as its initial condition.
  return (offset + (velocity + springRate * offset) * time) * Math.exp(-springRate * time);
}

function nearestOrbitProgress(bubble) {
  const { points: track, length: trackLength } = bubble.track;
  if (trackLength === 0) return bubble.progress;
  // Project the drop point onto each segment of this icon's ellipse.
  const { x, y } = bubble;
  let bestDistance = Infinity;
  let bestProgress = bubble.progress;
  for (let i = 1; i < track.length; i++) {
    const from = track[i - 1];
    const to = track[i];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) continue;
    const fraction = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / lengthSquared));
    const distance = Math.hypot(x - from.x - dx * fraction, y - from.y - dy * fraction);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestProgress = (from.distance + fraction * (to.distance - from.distance)) / trackLength;
    }
  }
  bestProgress %= 1;
  const clearance = hitRadius * 1.65;
  const step = Math.min(0.025, 10 / trackLength);
  // If another link occupies the closest point, take the first clear point on either side.
  for (let offset = 0; offset < 0.5; offset += step) {
    const candidates = offset ? [bestProgress + offset, bestProgress - offset] : [bestProgress];
    for (const candidate of candidates) {
      const progress = (candidate + 1) % 1;
      const point = destination(bubble, progress);
      if (bubbles.every(other => other === bubble ||
          Math.hypot(point.x - other.x, point.y - other.y) >= clearance)) return progress;
    }
  }
  return bestProgress;
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

  const preview = document.createElement('span');
  preview.className = 'orbit-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.append(card.querySelector('.link-copy').cloneNode(true));
  link.append(card.querySelector('.link-icon').cloneNode(true), preview);
  navigation.append(link);

  const guide = document.createElement('span');
  guide.className = 'orbit-guide';
  guides.append(guide);

  const bubble = {
    link, guide, progress: index / cards.length,
    spacing: index / Math.max(cards.length - 1, 1), period: 24000 + 3400 * index,
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
      bubble.progress = nearestOrbitProgress(bubble);
      bubble.held = false;
    }
    const target = destination(bubble);
    const flick = event.type === 'pointerup' && pointer.moved && event.timeStamp - pointer.time < 85;
    if (motion.matches) {
      Object.assign(bubble, target);
      render(bubble);
    } else if (pointer.moved) {
      rejoin(bubble, target, flick ? pointer.vx * 0.55 : 0, flick ? pointer.vy * 0.55 : 0);
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
  hitRadius = (bubbles[0]?.link.offsetWidth || 0) / 2;
  const outerX = Math.max(0, Math.min(385, stage.clientWidth / 2 - hitRadius - 7));
  const outerY = Math.max(0, Math.min(248, stage.clientHeight / 2 - hitRadius - 8));
  const innerX = Math.min(outerX * 0.85, Math.max(outerX * 0.61, identity.offsetWidth / 2 + hitRadius + 12));
  const innerY = Math.min(outerY * 0.82, Math.max(outerY * 0.58, identity.offsetHeight / 2 + hitRadius + 12));
  for (const bubble of bubbles) {
    const radiusX = innerX + (outerX - innerX) * bubble.spacing;
    const radiusY = innerY + (outerY - innerY) * bubble.spacing;
    bubble.track = makeTrack(radiusX, radiusY);
    bubble.guide.style.width = `${radiusX * 2}px`;
    bubble.guide.style.height = `${radiusY * 2}px`;
    if (!bubble.pointer) {
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
    bubble.progress = (bubble.progress + elapsed / bubble.period) % 1;
    const target = destination(bubble);
    if (bubble.held && !bubble.returning) rejoin(bubble, target);
    bubble.held = false;

    if (bubble.returning) {
      const flight = bubble.returning;
      flight.time += elapsed;
      bubble.x = target.x + offsetAt(flight.x, flight.vx, flight.time);
      bubble.y = target.y + offsetAt(flight.y, flight.vy, flight.time);
      if (flight.time >= returnDuration) {
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
