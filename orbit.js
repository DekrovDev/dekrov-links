const cards = Array.from(document.querySelectorAll('.link-card'));
const stage = document.querySelector('#orbit-stage');
const navigation = document.querySelector('#orbit-links');
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

const orbitSettings = {
  orbitPeriod: 32000, spreadDuration: 26000, springDecay: 0.0046,
  springFrequency: 0.0058, returnDuration: 1800, throwGain: 1.16,
  throwCap: 1.55, radiusX: 385, radiusY: 248, ringGap: 1, depth: 0.06,
  direction: 1, holdOnHover: true,
};
const canHover = matchMedia('(any-hover: hover)');
let hitRadius = 0;
let spreadPending = false;

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
  link.style.setProperty('--orbit-depth', motion.matches ? '1' : String(1 - orbitSettings.depth * (1 - depth) / 2));
  link.classList.toggle('preview-left', x > 0);
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

function rejoin(bubble, target, releaseVelocity) {
  const x = bubble.x - target.x;
  const y = bubble.y - target.y;
  let vx = 0;
  let vy = 0;
  if (releaseVelocity) {
    const sampleTime = 16;
    const next = destination(bubble, (bubble.progress + sampleTime * orbitSettings.direction / orbitSettings.orbitPeriod) % 1);
    // The spring uses coordinates relative to a point that keeps moving along the orbit.
    vx = releaseVelocity.x - (next.x - target.x) / sampleTime;
    vy = releaseVelocity.y - (next.y - target.y) / sampleTime;
  }
  const { springDecay, springFrequency, returnDuration } = orbitSettings;
  bubble.returning = {
    x, y, time: 0, springDecay, springFrequency, returnDuration,
    swingX: (vx + springDecay * x) / springFrequency,
    swingY: (vy + springDecay * y) / springFrequency,
  };
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

  const bubble = {
    link, progress: index / cards.length,
    spacing: index / Math.max(cards.length - 1, 1), spread: null,
    x: 0, y: 0, pointer: null, returning: null, held: false, blockClick: false,
  };
  link.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary || bubble.pointer) return;
    bubble.blockClick = false;
    bubble.returning = null;
    bubble.pointer = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      time: event.timeStamp, vx: 0, vy: 0, moved: false,
    };
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
      bubble.spread = null;
      bubble.blockClick = true;
      link.classList.add('is-dragging');
    }

    const x = bubble.x + dx;
    const y = bubble.y + dy;
    const elapsed = Math.max(10, event.timeStamp - pointer.time);
    const blend = 1 - Math.exp(-elapsed / 27);
    pointer.vx += (dx / elapsed - pointer.vx) * blend;
    pointer.vy += (dy / elapsed - pointer.vy) * blend;
    pointer.time = event.timeStamp;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    Object.assign(bubble, { x, y });
    render(bubble);
  });

  function release(event) {
    const pointer = bubble.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    bubble.pointer = null;
    link.classList.remove('is-dragging');
    if (!pointer.moved) {
      bubble.held = true;
      return;
    }

    bubble.progress = nearestOrbitProgress(bubble);
    bubble.held = false;
    const target = destination(bubble);
    if (motion.matches) {
      Object.assign(bubble, target);
      render(bubble);
    } else {
      const age = Math.max(0, event.timeStamp - pointer.time);
      const speed = Math.hypot(pointer.vx, pointer.vy);
      const carry = event.type === 'pointerup' && age < 100 && speed > 0
        ? orbitSettings.throwGain * Math.min(orbitSettings.throwCap / speed, Math.exp(-age / 40))
        : 0;
      rejoin(bubble, target, { x: pointer.vx * carry, y: pointer.vy * carry });
      spreadPending = true;
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
  const outerX = Math.max(0, Math.min(orbitSettings.radiusX, stage.clientWidth / 2 - hitRadius - 7));
  const outerY = Math.max(0, Math.min(orbitSettings.radiusY, stage.clientHeight / 2 - hitRadius - 8));
  const innerX = Math.min(outerX * 0.85, Math.max(outerX * 0.61, identity.offsetWidth / 2 + hitRadius + 12));
  const innerY = Math.min(outerY * 0.82, Math.max(outerY * 0.58, identity.offsetHeight / 2 + hitRadius + 12));
  for (const bubble of bubbles) {
    const radiusX = outerX - (outerX - innerX) * (1 - bubble.spacing) * orbitSettings.ringGap;
    const radiusY = outerY - (outerY - innerY) * (1 - bubble.spacing) * orbitSettings.ringGap;
    bubble.track = makeTrack(radiusX, radiusY);
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

function spreadOrbits() {
  // Keep the current circular order and move the group as little as possible.
  const ordered = [...bubbles].sort((a, b) => a.progress - b.progress);
  const count = ordered.length;
  const mean = ordered.reduce((sum, bubble, index) => sum + bubble.progress - index / count, 0) / count;
  ordered.forEach((bubble, index) => {
    bubble.spread = { distance: mean + index / count - bubble.progress, time: 0 };
  });
}

function spreadStep(bubble, elapsed) {
  const spread = bubble.spread;
  if (!spread) return 0;
  const { spreadDuration } = orbitSettings;
  const before = Math.min(spread.time / spreadDuration, 1);
  spread.time = Math.min(spread.time + elapsed, spreadDuration);
  const after = spread.time / spreadDuration;
  if (spread.time === spreadDuration) bubble.spread = null;
  const ease = (t) => t * t * (3 - 2 * t);
  return spread.distance * (ease(after) - ease(before));
}

function animate(time) {
  animationFrame = 0;
  const elapsed = previousTime ? Math.min(50, time - previousTime) : 0;
  previousTime = time;

  for (const bubble of bubbles) {
    if (bubble.pointer) continue;

    const focused = bubble.link.matches(':focus-visible');
    const hovered = orbitSettings.holdOnHover && canHover.matches && bubble.link.matches(':hover');
    if (!bubble.returning && (focused || hovered)) {
      bubble.held = true;
      bubble.returning = null;
      continue;
    }
    const spacing = spreadStep(bubble, elapsed);
    bubble.progress = (bubble.progress + elapsed * orbitSettings.direction / orbitSettings.orbitPeriod + spacing + 1) % 1;
    const target = destination(bubble);
    if (bubble.held && !bubble.returning) rejoin(bubble, target);
    bubble.held = false;

    if (bubble.returning) {
      const flight = bubble.returning;
      flight.time += elapsed;
      const phase = flight.springFrequency * flight.time;
      const decay = Math.exp(-flight.springDecay * flight.time);
      const cos = Math.cos(phase);
      const sin = Math.sin(phase);
      bubble.x = target.x + decay * (flight.x * cos + flight.swingX * sin);
      bubble.y = target.y + decay * (flight.y * cos + flight.swingY * sin);
      if (flight.time >= flight.returnDuration) {
        bubble.returning = null;
        Object.assign(bubble, target);
      }
    } else {
      Object.assign(bubble, target);
    }
    render(bubble);
  }

  if (spreadPending && !bubbles.some(bubble => bubble.pointer || bubble.returning)) {
    spreadPending = false;
    spreadOrbits();
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
  if (motion.matches) {
    spreadPending = false;
    for (const bubble of bubbles) bubble.spread = null;
    measure();
  }
  syncAnimation();
});
document.addEventListener('visibilitychange', syncAnimation);
syncAnimation();


// The lab can tune its own embedded copy. A normal page load uses the defaults above.
if (window.parent !== window) {
  window.addEventListener('dekrov:orbit-settings', ({ detail }) => {
    const previousSpread = orbitSettings.spreadDuration;
    Object.assign(orbitSettings, detail.physics);
    if (previousSpread !== orbitSettings.spreadDuration) {
      for (const bubble of bubbles) {
        if (bubble.spread) bubble.spread.time *= orbitSettings.spreadDuration / previousSpread;
      }
    }
    if (detail.layout) measure();
  });
}
