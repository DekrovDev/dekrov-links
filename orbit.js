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
    link, label, phase: Math.PI * (2 * index / cards.length - 0.5),
    x: 0, y: 0, offsetX: 0, offsetY: 0, pointer: null, blockClick: false,
  };
  link.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary || bubble.pointer) return;
    bubble.blockClick = false;
    bubble.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    link.setPointerCapture(event.pointerId);
  });
  link.addEventListener('pointermove', (event) => {
    const pointer = bubble.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;

    const differenceX = event.clientX - pointer.x;
    const differenceY = event.clientY - pointer.y;
    if (!pointer.moved) {
      if (Math.hypot(differenceX, differenceY) < 7) return;
      pointer.moved = true;
      bubble.blockClick = true;
      link.classList.add('is-dragging');
    }

    const maxX = Math.max(0, size.width / 2 - 25);
    const maxY = Math.max(0, size.height / 2 - 18);
    const nextX = Math.max(-maxX, Math.min(maxX, bubble.x + differenceX));
    const nextY = Math.max(-maxY, Math.min(maxY, bubble.y + differenceY));
    bubble.offsetX += nextX - bubble.x;
    bubble.offsetY += nextY - bubble.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    layoutBubble(bubble);
  });

  link.addEventListener('click', (event) => {
    if (bubble.blockClick && event.detail !== 0) event.preventDefault();
  });
  link.addEventListener('dragstart', (event) => event.preventDefault());
  return bubble;
});

const size = { width: stage.clientWidth, height: stage.clientHeight };
let orbitAngle = 0;
const signedPower = (value) => Math.sign(value) * Math.abs(value) ** 0.56;

function layoutBubble(bubble) {
  const radiusX = Math.min(335, size.width / 2 - 35);
  const radiusY = Math.min(230, size.height / 2 - 30);
  const phase = bubble.phase + orbitAngle;
  bubble.x = radiusX * signedPower(Math.cos(phase)) + bubble.offsetX;
  bubble.y = radiusY * signedPower(Math.sin(phase)) + bubble.offsetY;

  bubble.link.style.setProperty('--x', `${bubble.x.toFixed(2)}px`);
  bubble.link.style.setProperty('--y', `${bubble.y.toFixed(2)}px`);
  const limit = Math.max(0, (size.width - bubble.labelWidth) / 2);
  const labelX = Math.max(-limit, Math.min(limit, bubble.x));
  bubble.link.style.setProperty('--label-shift', `${(labelX - bubble.x).toFixed(2)}px`);
}

function measure() {
  size.width = stage.clientWidth;
  size.height = stage.clientHeight;
  for (const bubble of bubbles) {
    bubble.labelWidth = bubble.label.offsetWidth;
    layoutBubble(bubble);
  }
}

function releasePointer(event) {
  for (const bubble of bubbles) {
    if (bubble.pointer?.id !== event.pointerId) continue;
    bubble.pointer = null;
    bubble.link.classList.remove('is-dragging');
    if (motion.matches) {
      bubble.offsetX = 0;
      bubble.offsetY = 0;
      layoutBubble(bubble);
    }
  }
}

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  window.addEventListener(type, releasePointer);
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
  const elapsed = previousTime ? Math.min(40, time - previousTime) : 0;
  previousTime = time;

  const interacting = bubbles.some(({ link, pointer }) => pointer || link.matches(':hover,:focus-visible'));
  if (!interacting) orbitAngle = (orbitAngle + elapsed * 0.00015) % (2 * Math.PI);

  for (const bubble of bubbles) {
    if (bubble.pointer) continue;

    const returning = Math.hypot(bubble.offsetX, bubble.offsetY) > 0.35;
    const progress = returning ? Math.exp(-elapsed / 170) : 0;
    bubble.offsetX *= progress;
    bubble.offsetY *= progress;
    layoutBubble(bubble);
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
    for (const bubble of bubbles) {
      if (bubble.pointer) continue;
      bubble.offsetX = bubble.offsetY = 0;
      layoutBubble(bubble);
    }
  }
  syncAnimation();
});
document.addEventListener('visibilitychange', syncAnimation);
syncAnimation();
