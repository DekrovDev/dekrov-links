const cards = Array.from(document.querySelectorAll('.link-card'));
const stage = document.querySelector('#orbit-stage');
const navigation = document.querySelector('#orbit-links');
const identity = stage.querySelector('.identity');
const motion = matchMedia('(prefers-reduced-motion: reduce)');

// Upgrade .link-action icons to inline SVG so the arrow lights immediately while the square traces end-to-end in 0.3s
(function initActionIcons() {
  const actions = document.querySelectorAll('.link-action');
  if (!actions.length) return;
  const boxPath = 'M18 10L18 16C18 16.53 17.79 17.04 17.41 17.41C17.04 17.79 16.53 18 16 18L2 18C1.47 18 0.96 17.79 0.59 17.41C0.21 17.04 0 16.53 0 16L0 2C0 1.47 0.21 0.96 0.59 0.59C0.96 0.21 1.47 0 2 0L8 0';
  const tipPath = 'M18 0L9 9M12 0L18 0L18 6';
  actions.forEach((el, idx) => {
    const gradId = `arrow-metal-${idx}`;
    el.innerHTML = `<svg class="link-action-svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#b7bdc8"/>
          <stop offset="28%" stop-color="#ffffff"/>
          <stop offset="52%" stop-color="#8d93a1"/>
          <stop offset="76%" stop-color="#f2f5fa"/>
          <stop offset="100%" stop-color="#aeb5c2"/>
        </linearGradient>
      </defs>
      <g transform="translate(3,3)" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path class="arrow-base-box" d="${boxPath}"/>
        <path class="arrow-base-tip" d="${tipPath}"/>
        <path class="arrow-lit-box" pathLength="100" d="${boxPath}" stroke="url(#${gradId})"/>
        <path class="arrow-lit-tip" d="${tipPath}" stroke="url(#${gradId})"/>
      </g>
    </svg>`;
  });
})();

// Scroll-linked smooth opacity fade (both directions, natural page scroll)
(function initScrollFade() {
  const intro = document.querySelector('.intro');
  const heading = document.querySelector('.directory-heading');
  const fadeTargets = [heading, ...cards].filter(Boolean);
  if (!intro || !fadeTargets.length) return;

  let raf = 0;
  function updateFade() {
    raf = 0;
    if (motion.matches) {
      intro.style.opacity = '';
      for (const el of fadeTargets) el.style.opacity = '';
      return;
    }

    const vh = window.innerHeight || 800;
    const introFadeEnd = Math.max(260, intro.offsetHeight * 0.62);
    const introAlpha = Math.max(0, Math.min(1, 1 - window.scrollY / introFadeEnd));
    intro.style.opacity = introAlpha.toFixed(3);

    const enterStart = vh * 0.96;
    const enterFull = vh * 0.68;
    const span = Math.max(60, enterStart - enterFull);

    for (const el of fadeTargets) {
      const top = el.getBoundingClientRect().top;
      const alpha = Math.max(0, Math.min(1, (enterStart - top) / span));
      el.style.opacity = alpha.toFixed(3);
    }
  }

  function onScroll() {
    if (!raf) raf = requestAnimationFrame(updateFade);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  motion.addEventListener('change', updateFade);
  updateFade();
})();

const orbitSettings = {
  orbitPeriod: 32000, spreadDuration: 26000, springDecay: 0.0026,
  springFrequency: 0.0036, returnDuration: 4800, throwGain: 1.75,
  throwCap: 2.1, radiusX: 600, radiusY: 380, ringGap: 0.78, depth: 0,
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

function nearestOrbitProgress(bubble, candidatePoint) {
  const { points: track, length: trackLength } = bubble.track;
  if (trackLength === 0) return bubble.progress;
  // Project the drop point onto each segment of this icon's ellipse.
  const x = candidatePoint ? candidatePoint.x : bubble.x;
  const y = candidatePoint ? candidatePoint.y : bubble.y;
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

function getViewportBounds() {
  const rect = stage.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + window.scrollY + rect.height / 2;
  const intro = stage.closest('.intro');
  const heroBottom = intro ? intro.offsetHeight : Math.max(window.innerHeight, rect.height);
  const pad = Math.max(28, hitRadius + 10);
  return {
    minX: pad - centerX,
    maxX: document.documentElement.clientWidth - pad - centerX,
    minY: pad - centerY,
    maxY: heroBottom - pad - centerY,
  };
}

function springPeak(targetCoord, p0, s, w, d) {
  const denom = w * p0 + d * s;
  const numer = w * s - d * p0;
  let theta = Math.atan2(numer, denom);
  if (theta < 0) theta += Math.PI;
  const t = theta / w;
  return targetCoord + Math.exp(-d * t) * (p0 * Math.cos(w * t) + s * Math.sin(w * t));
}

function rejoin(bubble, target, releaseVelocity, customPhysics) {
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
  const springDecay = customPhysics?.springDecay ?? orbitSettings.springDecay;
  const springFrequency = customPhysics?.springFrequency ?? orbitSettings.springFrequency;
  const returnDuration = customPhysics?.returnDuration ?? orbitSettings.returnDuration;
  let swingX = (vx + springDecay * x) / springFrequency;
  let swingY = (vy + springDecay * y) / springFrequency;

  if (releaseVelocity) {
    const bounds = getViewportBounds();
    const fits = (scale) => {
      const px = springPeak(target.x, x, swingX * scale, springFrequency, springDecay);
      const py = springPeak(target.y, y, swingY * scale, springFrequency, springDecay);
      return px >= bounds.minX && px <= bounds.maxX && py >= bounds.minY && py <= bounds.maxY;
    };
    if (!fits(1)) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) * 0.5;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      swingX *= lo;
      swingY *= lo;
    }
  }

  bubble.returning = {
    x, y, time: 0, springDecay, springFrequency, returnDuration,
    swingX, swingY,
  };
}

const driftSpring = {
  springFrequency: 0.0030, // 3.0 rad/s: smooth, fluid floating drift
  springDecay: 0.0022,     // 2.2 1/s: natural damping
  returnDuration: 2800,    // 2.8s smooth return window
};

const collisionCooldowns = new Map();

function triggerBump(bubble) {
  bubble.link.classList.remove('is-bounced');
  void bubble.link.offsetWidth;
  bubble.link.classList.add('is-bounced');
  setTimeout(() => bubble.link.classList.remove('is-bounced'), 400);
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
    x: 0, y: 0, avoidX: 0, avoidY: 0, pointer: null, returning: null,
    held: false, blockClick: false, pointerInside: false, releasedAt: 0, avoidSides: new Map(), boostPair: null, slowPair: null,
  };
  link.addEventListener('pointerenter', () => {
    bubble.pointerInside = true;
  });
  link.addEventListener('pointerleave', () => {
    bubble.pointerInside = false;
  });
  link.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary || bubble.pointer) return;
    if (!event.target.closest('.link-icon')) return; // Drag ONLY via icon, not preview popup
    bubble.blockClick = false;
    bubble.returning = null;
    bubble.avoidX = 0;
    bubble.avoidY = 0;
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

    const bounds = getViewportBounds();
    const x = Math.max(bounds.minX, Math.min(bounds.maxX, bubble.x + dx));
    const y = Math.max(bounds.minY, Math.min(bounds.maxY, bubble.y + dy));
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

    bubble.releasedAt = performance.now();
    bubble.progress = nearestOrbitProgress(bubble);
    bubble.held = false;
    const target = destination(bubble);
    if (motion.matches) {
      Object.assign(bubble, target);
      render(bubble);
    } else {
      const age = Math.max(0, event.timeStamp - pointer.time);
      const speed = Math.hypot(pointer.vx, pointer.vy);
      const carry = event.type === 'pointerup' && age < 120 && speed > 0
        ? orbitSettings.throwGain * Math.min(orbitSettings.throwCap / speed, Math.exp(-age / 48))
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
  const innerX = Math.min(outerX * 0.85, Math.max(outerX * 0.58, identity.offsetWidth / 2 + hitRadius + 46));
  const innerY = Math.min(outerY * 0.82, Math.max(outerY * 0.58, identity.offsetHeight / 2 + hitRadius + 46));
  for (const bubble of bubbles) {
    const radiusX = Math.max(innerX, outerX - (outerX - innerX) * (1 - bubble.spacing) * orbitSettings.ringGap);
    const radiusY = Math.max(innerY, outerY - (outerY - innerY) * (1 - bubble.spacing) * orbitSettings.ringGap);
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
  const now = performance.now();
  const bounds = getViewportBounds();

  for (const bubble of bubbles) {
    if (bubble.pointer) continue;

    const justThrown = now - bubble.releasedAt < 220;
    const focused = bubble.link.matches(':focus-visible');
    const hovered = orbitSettings.holdOnHover && canHover.matches && (bubble.pointerInside || bubble.link.matches(':hover'));
    if (focused || (hovered && !justThrown)) {
      bubble.held = true;
      bubble.returning = null;
      bubble.avoidX = 0;
      bubble.avoidY = 0;
      continue;
    }
    if (bubble.held) {
      const prevA = destination(bubble, bubble.progress);
      const nextA = destination(bubble, (bubble.progress + 0.01 * orbitSettings.direction + 1) % 1);
      const tx = nextA.x - prevA.x;
      const ty = nextA.y - prevA.y;
      const boostTriggerRadius = Math.max(160, hitRadius * 4.4);
      let closestOther = null;
      let closestDist = boostTriggerRadius;
      for (const other of bubbles) {
        if (other === bubble || other.pointer || other.held) continue;
        if (!other.avoidSides.has(bubble)) continue;
        const dist = Math.hypot(other.x - bubble.x, other.y - bubble.y);
        if (dist < closestDist) {
          closestDist = dist;
          closestOther = other;
        }
      }
      if (closestOther) {
        const alongOrbit = (closestOther.baseX - bubble.x) * tx + (closestOther.baseY - bubble.y) * ty;
        const clearDist = Math.max(210, hitRadius * 5.8);
        const pairMaxTime = 3500;
        if (alongOrbit >= 0) {
          closestOther.boostPair = { partner: bubble, clearDist, time: pairMaxTime };
          closestOther.slowPair = null;
          bubble.slowPair = { partner: closestOther, clearDist, time: pairMaxTime };
          bubble.boostPair = null;
        } else {
          bubble.boostPair = { partner: closestOther, clearDist, time: pairMaxTime };
          bubble.slowPair = null;
          closestOther.slowPair = { partner: bubble, clearDist, time: pairMaxTime };
          closestOther.boostPair = null;
        }
      }
    }
    let speedMult = 1;
    if (bubble.boostPair) {
      const { partner, clearDist } = bubble.boostPair;
      const d = Math.hypot(bubble.x - partner.x, bubble.y - partner.y);
      bubble.boostPair.time -= elapsed;
      if (d >= clearDist || bubble.boostPair.time <= 0 || partner.pointer) {
        bubble.boostPair = null;
      } else {
        const k = Math.max(0, Math.min(1, (clearDist - d) / clearDist + 0.35));
        speedMult = 1 + 1.1 * k;
      }
    } else if (bubble.slowPair) {
      const { partner, clearDist } = bubble.slowPair;
      const d = Math.hypot(bubble.x - partner.x, bubble.y - partner.y);
      bubble.slowPair.time -= elapsed;
      if (d >= clearDist || bubble.slowPair.time <= 0 || partner.pointer) {
        bubble.slowPair = null;
      } else {
        const k = Math.max(0, Math.min(1, (clearDist - d) / clearDist + 0.35));
        speedMult = 1 - 0.55 * k;
      }
    }
    const spacing = spreadStep(bubble, elapsed);
    bubble.progress = (bubble.progress + elapsed * speedMult * orbitSettings.direction / orbitSettings.orbitPeriod + spacing + 1) % 1;
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
      bubble.baseX = target.x + decay * (flight.x * cos + flight.swingX * sin);
      bubble.baseY = target.y + decay * (flight.y * cos + flight.swingY * sin);
      if (flight.time >= flight.returnDuration) {
        bubble.returning = null;
        bubble.baseX = target.x;
        bubble.baseY = target.y;
      }
    } else {
      bubble.baseX = target.x;
      bubble.baseY = target.y;
    }
    bubble.baseX = Math.max(bounds.minX, Math.min(bounds.maxX, bubble.baseX));
    bubble.baseY = Math.max(bounds.minY, Math.min(bounds.maxY, bubble.baseY));
  }

  // Smooth sticky-side swim-around when passing near a hovered/focused icon
  const avoidRadius = Math.max(160, hitRadius * 4.4);
  const minClearance = Math.max(100, hitRadius * 2.85);
  const avoidBlend = elapsed > 0 ? 1 - Math.exp(-elapsed / 120) : 1;
  const idHalfW = identity.offsetWidth / 2 + hitRadius + 4;
  const idHalfH = identity.offsetHeight / 2 + hitRadius + 4;

  for (const bubble of bubbles) {
    if (bubble.pointer || bubble.held) {
      bubble.avoidSides.clear();
      continue;
    }
    let targetAvoidX = 0;
    let targetAvoidY = 0;

    for (const [heldRef] of bubble.avoidSides) {
      if (heldRef.pointer || Math.hypot(bubble.baseX - heldRef.x, bubble.baseY - heldRef.y) > avoidRadius * 1.15) {
        bubble.avoidSides.delete(heldRef);
      }
    }

    for (const held of bubbles) {
      if (held === bubble || held.pointer) continue;
      if (!held.held && !bubble.avoidSides.has(held)) continue;
      const dx = bubble.baseX - held.x;
      const dy = bubble.baseY - held.y;
      const dist = Math.hypot(dx, dy);
      if (dist < avoidRadius) {
        const rLen = Math.hypot(bubble.baseX, bubble.baseY) || 1;
        const rx = bubble.baseX / rLen;
        const ry = bubble.baseY / rLen;

        let side = bubble.avoidSides.get(held);
        if (side === undefined) {
          const outX = held.x + rx * minClearance;
          const outY = held.y + ry * minClearance;
          const inX = held.x - rx * minClearance;
          const inY = held.y - ry * minClearance;
          const outOk = outX >= bounds.minX && outX <= bounds.maxX && outY >= bounds.minY && outY <= bounds.maxY;
          const inOk = Math.abs(inX) >= idHalfW || Math.abs(inY) >= idHalfH;

          if (!outOk && inOk) side = -1;
          else if (outOk && !inOk) side = 1;
          else {
            const rHeld = Math.hypot(held.x, held.y);
            side = rLen >= rHeld - 10 ? 1 : -1;
          }
          bubble.avoidSides.set(held, side);
        }

        const radialOffset = dx * (rx * side) + dy * (ry * side);
        const needed = Math.max(0, minClearance - radialOffset);
        const u = 1 - dist / avoidRadius;
        const smooth = u * u * (3 - 2 * u);
        const push = smooth * needed;
        targetAvoidX += rx * side * push;
        targetAvoidY += ry * side * push;
      }
    }
    bubble.avoidX += (targetAvoidX - bubble.avoidX) * avoidBlend;
    bubble.avoidY += (targetAvoidY - bubble.avoidY) * avoidBlend;
    bubble.x = Math.max(bounds.minX, Math.min(bounds.maxX, bubble.baseX + bubble.avoidX));
    bubble.y = Math.max(bounds.minY, Math.min(bounds.maxY, bubble.baseY + bubble.avoidY));
  }

  // Pairwise collision: floating drift in opposite directions with smooth inertia
  const collisionRadius = Math.max(54, hitRadius * 2);
  for (let i = 0; i < bubbles.length; i++) {
    for (let j = i + 1; j < bubbles.length; j++) {
      const a = bubbles[i];
      const b = bubbles[j];
      if (a.pointer || b.pointer) continue;

      const aHovered = a.held || (canHover.matches && (a.link.matches(':hover') || a.link.matches(':focus-visible')));
      const bHovered = b.held || (canHover.matches && (b.link.matches(':hover') || b.link.matches(':focus-visible')));
      if (aHovered || bHovered || a.avoidSides.has(b) || b.avoidSides.has(a)) continue;

      const pairKey = `${i}-${j}`;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < collisionRadius && dist > 0.001) {
        const lastCollision = collisionCooldowns.get(pairKey) || 0;
        if (now - lastCollision < 450) continue;
        collisionCooldowns.set(pairKey, now);

        const nx = dx / dist;
        const ny = dy / dist;

        // Soft separation without instant teleportation
        const overlap = collisionRadius - dist;
        const softSep = Math.min(overlap * 0.2, 3);
        a.x -= nx * softSep;
        a.y -= ny * softSep;
        b.x += nx * softSep;
        b.y += ny * softSep;

        const vxA = a.vx || 0;
        const vyA = a.vy || 0;
        const vxB = b.vx || 0;
        const vyB = b.vy || 0;
        const normalVel = (vxB - vxA) * nx + (vyB - vyA) * ny;

        // Smooth drift speed along collision line
        const driftSpeed = Math.max(0.4, Math.min(0.9, Math.abs(normalVel) * 0.6 + 0.3));

        triggerBump(a);
        triggerBump(b);

        // SHIFT BOTH A AND B'S ORBIT SLOTS AWAY IN OPPOSITE DIRECTIONS!
        a.progress = nearestOrbitProgress(a, { x: a.x - nx * 85, y: a.y - ny * 85 });
        b.progress = nearestOrbitProgress(b, { x: b.x + nx * 85, y: b.y + ny * 85 });
        const targetA = destination(a);
        const targetB = destination(b);

        // A floats in -nx, -ny; B floats in +nx, +ny (OPPOSITE DIRECTIONS)
        rejoin(a, targetA, { x: vxA - nx * driftSpeed, y: vyA - ny * driftSpeed }, driftSpring);
        rejoin(b, targetB, { x: vxB + nx * driftSpeed, y: vyB + ny * driftSpeed }, driftSpring);
        spreadPending = true;
      }
    }
  }

  // Continuous gentle angular spacing so icons always spread evenly around the orbit
  if (elapsed > 0 && bubbles.length > 1) {
    const idealGap = 1 / bubbles.length;
    const rate = elapsed * 0.00045;
    for (let i = 0; i < bubbles.length; i++) {
      const a = bubbles[i];
      if (a.pointer || a.held || a.boostPair || a.slowPair || a.avoidSides.size > 0) continue;
      for (let j = i + 1; j < bubbles.length; j++) {
        const b = bubbles[j];
        if (b.pointer || b.held || b.boostPair || b.slowPair || b.avoidSides.size > 0) continue;
        const d = (b.progress - a.progress + 1.5) % 1 - 0.5;
        const absD = Math.abs(d);
        if (absD < idealGap) {
          const push = (idealGap - absD) * rate;
          const sign = absD > 0.0001 ? (d >= 0 ? 1 : -1) : (i < j ? -1 : 1);
          a.progress = (a.progress - sign * push + 1) % 1;
          b.progress = (b.progress + sign * push + 1) % 1;
        }
      }
    }
  }

  for (const bubble of bubbles) {
    if (elapsed > 0 && bubble.prevX !== undefined) {
      bubble.vx = (bubble.x - bubble.prevX) / elapsed;
      bubble.vy = (bubble.y - bubble.prevY) / elapsed;
    } else {
      bubble.vx = bubble.vy = 0;
    }
    bubble.prevX = bubble.x;
    bubble.prevY = bubble.y;
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


// Settings can be tuned dynamically via custom event
window.addEventListener('dekrov:orbit-settings', ({ detail }) => {
  if (!detail) return;
  const previousSpread = orbitSettings.spreadDuration;
  if (detail.physics) Object.assign(orbitSettings, detail.physics);
  if (previousSpread !== orbitSettings.spreadDuration) {
    for (const bubble of bubbles) {
      if (bubble.spread) bubble.spread.time *= orbitSettings.spreadDuration / previousSpread;
    }
  }
  if (detail.layout) measure();
});
window.orbitSettings = orbitSettings;

// Periodic silky-smooth light, glass & wave variations across the center DK avatar
(function initAvatarRays() {
  const avatar = document.querySelector('.avatar');
  const avatarImg = document.querySelector('.avatar-img');
  const rayA = document.querySelector('.avatar-ray-a');
  const waveDisp = document.querySelector('#dk-wave-disp');
  const waveTurb = document.querySelector('#dk-wave-turb');
  if (!avatar || !avatarImg || !rayA) return;

  const orbBg = (rgba = '255,255,255') =>
    `radial-gradient(circle at 50% 50%, rgba(${rgba},1) 0%, rgba(${rgba},0.42) 32%, transparent 68%)`;
  const ringBg = (rgba = '255,255,255') =>
    `radial-gradient(circle at 50% 50%, transparent 24%, rgba(${rgba},0.28) 42%, rgba(${rgba},0.9) 50%, rgba(${rgba},0.22) 58%, transparent 72%)`;
  const washBg = (rgba = '255,255,255') =>
    `linear-gradient(90deg, transparent 0%, rgba(${rgba},0.12) 32%, rgba(${rgba},1) 50%, rgba(${rgba},0.12) 68%, transparent 100%)`;

  function runIconWave(duration = 2500, peakScale = 9.5, stretch = 0.028) {
    if (!waveDisp || !waveTurb) return;
    avatarImg.style.filter = 'url(#dk-wave-filter)';
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const env = Math.sin(t * Math.PI);
      const freqShift = 0.02 + 0.015 * Math.sin(t * Math.PI * 2);
      waveTurb.setAttribute('baseFrequency', `${freqShift.toFixed(4)} ${(freqShift * 1.7).toFixed(4)}`);
      waveDisp.setAttribute('scale', (env * peakScale).toFixed(2));
      const sx = 1 + stretch * Math.sin(t * Math.PI * 2);
      const sy = 1 - stretch * 0.85 * Math.sin(t * Math.PI * 2);
      avatarImg.style.setProperty('--wave-sx', sx.toFixed(4));
      avatarImg.style.setProperty('--wave-sy', sy.toFixed(4));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        waveDisp.setAttribute('scale', '0');
        avatarImg.style.filter = '';
        avatarImg.style.removeProperty('--wave-sx');
        avatarImg.style.removeProperty('--wave-sy');
      }
    }
    requestAnimationFrame(step);
  }

  const variations = [
    // Kept #2 (old): Corner glow drifting diagonally across
    () => {
      rayA.style.background = orbBg('255,255,255');
      rayA.animate(
        [
          { transform: 'translate(-45%, -45%) scale(0.85)', opacity: 0 },
          { transform: 'translate(-22%, -22%) scale(1.0)', opacity: 0.22, offset: 0.3 },
          { transform: 'translate(22%, 22%) scale(1.05)', opacity: 0.19, offset: 0.7 },
          { transform: 'translate(48%, 48%) scale(0.85)', opacity: 0 },
        ],
        { duration: 2700, easing: 'ease-in-out', fill: 'none' }
      );
    },
    // Kept #4 (old): Liquid wave warping DK icon + soft expanding ring
    () => {
      runIconWave(2500, 9.5, 0.028);
      rayA.style.background = ringBg('225,238,255');
      rayA.animate(
        [
          { transform: 'scale(0.22)', opacity: 0 },
          { transform: 'scale(0.58)', opacity: 0.22, offset: 0.35 },
          { transform: 'scale(1.18)', opacity: 0 },
        ],
        { duration: 2500, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'none' }
      );
    },
    // Kept #5 (old): Soft horizon glow rising bottom-to-top
    () => {
      rayA.style.background = washBg('255,255,255');
      rayA.animate(
        [
          { transform: 'rotate(90deg) translateX(75%)', opacity: 0 },
          { transform: 'rotate(90deg) translateX(20%)', opacity: 0.17, offset: 0.35 },
          { transform: 'rotate(90deg) translateX(-20%)', opacity: 0.17, offset: 0.65 },
          { transform: 'rotate(90deg) translateX(-75%)', opacity: 0 },
        ],
        { duration: 2600, easing: 'ease-in-out', fill: 'none' }
      );
    },
    // Kept #6 (old): Slow wide liquid-chrome shimmer
    () => {
      rayA.style.background = washBg('230,240,255');
      rayA.animate(
        [
          { transform: 'rotate(22deg) translateX(-95%)', opacity: 0 },
          { transform: 'rotate(22deg) translateX(-20%)', opacity: 0.16, offset: 0.35 },
          { transform: 'rotate(22deg) translateX(25%)', opacity: 0.16, offset: 0.65 },
          { transform: 'rotate(22deg) translateX(95%)', opacity: 0 },
        ],
        { duration: 3100, easing: 'ease-in-out', fill: 'none' }
      );
    },
    // New #2: Glass refraction lens sweeping diagonally across DK
    () => {
      runIconWave(2700, 6.5, 0.015);
      rayA.style.background = washBg('240,248,255');
      rayA.animate(
        [
          { transform: 'rotate(-32deg) translateX(-95%) scaleX(0.45)', opacity: 0 },
          { transform: 'rotate(-32deg) translateX(0%) scaleX(0.55)', opacity: 0.16, offset: 0.5 },
          { transform: 'rotate(-32deg) translateX(95%) scaleX(0.45)', opacity: 0 },
        ],
        { duration: 2700, easing: 'ease-in-out', fill: 'none' }
      );
    },
    // New #4: Liquid chrome breathing (subtle internal luminosity swell without popping forward)
    () => {
      avatarImg.animate(
        [
          { filter: 'brightness(1) contrast(1)' },
          { filter: 'brightness(1.16) contrast(1.06)', offset: 0.45 },
          { filter: 'brightness(1) contrast(1)' },
        ],
        { duration: 3100, easing: 'ease-in-out', fill: 'none' }
      );
    },
  ];

  let timer = 0;

  function scheduleNext(first = false) {
    clearTimeout(timer);
    const wait = first ? 1500 : 4500 + Math.random() * 2000;
    timer = setTimeout(() => {
      if (!document.hidden && !motion.matches) {
        const idx = Math.floor(Math.random() * variations.length);
        variations[idx]();
      }
      scheduleNext(false);
    }, wait);
  }

  scheduleNext(true);
  window.avatarRayVariationsCount = variations.length;

  // 1 + 2: Liquid Glass 3D tilt + live cursor spotlight + deep parallax letters
  const avatarWrap = document.querySelector('.avatar-wrap');
  const pageTitle = document.querySelector('#page-title');
  if (avatarWrap && canHover.matches) {
    const updateTilt = (event) => {
      if (motion.matches) return;
      const rect = avatarWrap.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const nx = Math.max(-1, Math.min(1, (x / rect.width - 0.5) * 2));
      const ny = Math.max(-1, Math.min(1, (y / rect.height - 0.5) * 2));

      avatar.classList.add('is-tilting');
      avatar.style.setProperty('--tilt-x', `${(-ny * 11).toFixed(2)}deg`);
      avatar.style.setProperty('--tilt-y', `${(nx * 11).toFixed(2)}deg`);
      avatar.style.setProperty('--pull-x', `${(nx * 4.5).toFixed(2)}px`);
      avatar.style.setProperty('--pull-y', `${(ny * 4.5).toFixed(2)}px`);
      avatar.style.setProperty('--av-scale', '1.055');
      avatar.style.setProperty('--spot-x', `${x.toFixed(1)}px`);
      avatar.style.setProperty('--spot-y', `${y.toFixed(1)}px`);
      avatar.style.setProperty('--shadow-x', `${(-nx * 9).toFixed(1)}px`);
      avatar.style.setProperty('--shadow-y', `${(14 - ny * 7).toFixed(1)}px`);

      avatarImg.style.setProperty('--img-x', `${(-nx * 4).toFixed(2)}px`);
      avatarImg.style.setProperty('--img-y', `${(-ny * 4).toFixed(2)}px`);
      avatarImg.style.setProperty('--img-scale', '0.94');

      if (pageTitle) {
        pageTitle.style.setProperty('--title-x', `${(nx * 1.5).toFixed(2)}px`);
        pageTitle.style.setProperty('--title-y', `${(ny * 1.5).toFixed(2)}px`);
        pageTitle.style.setProperty('--title-glow', '1');
      }
    };

    const resetTilt = () => {
      avatar.classList.remove('is-tilting');
      for (const prop of ['--tilt-x', '--tilt-y', '--pull-x', '--pull-y', '--av-scale', '--shadow-x', '--shadow-y']) {
        avatar.style.removeProperty(prop);
      }
      for (const prop of ['--img-x', '--img-y', '--img-scale']) {
        avatarImg.style.removeProperty(prop);
      }
      if (pageTitle) {
        for (const prop of ['--title-x', '--title-y', '--title-glow']) {
          pageTitle.style.removeProperty(prop);
        }
      }
    };

    avatarWrap.addEventListener('pointerenter', updateTilt);
    avatarWrap.addEventListener('pointermove', updateTilt);
    avatarWrap.addEventListener('pointerleave', resetTilt);
    avatarWrap.addEventListener('pointercancel', resetTilt);
  }
})();
