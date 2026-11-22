const groups = [
  ['Бросок и возврат', [
    ['throwGain', 'Инерция броска', 1.16, 0, 3, .01, '×'],
    ['throwCap', 'Предел скорости броска', 1.55, .25, 3, .05, 'пкс/мс'],
    ['springFrequency', 'Скорость пружины', 5.8, 2, 13, .1, 'рад/с'],
    ['springDecay', 'Затухание пружины', 4.6, 2, 12, .1, '1/с'],
    ['returnDuration', 'Длительность возврата', 1.8, .6, 4, .1, 'с'],
    ['spreadDuration', 'Плавное расхождение', 26, 2, 70, 1, 'с'],
  ]],
  ['Орбиты', [
    ['orbitPeriod', 'Время полного круга', 32, 8, 100, 1, 'с'],
    ['radiusX', 'Радиус по горизонтали', 385, 100, 650, 5, 'пкс'],
    ['radiusY', 'Радиус по вертикали', 248, 70, 380, 1, 'пкс'],
    ['ringGap', 'Разница радиусов', 1, 0, 1.6, .05, '×'],
    ['depth', 'Разница масштаба по высоте', 6, 0, 35, 1, '%'],
    ['reverse', 'Обратное направление', false],
    ['holdOnHover', 'Пауза иконки при наведении', true],
  ]],
  ['Фон и логотип', [
    ['background', 'Фон', '#090909'],
    ['textColor', 'Основной текст', '#f0f0ef'],
    ['mutedColor', 'Цвет описаний', '#a4a4a4'],
    ['ambientColor', 'Цвет фонового свечения', '#6574ff'],
    ['ambient', 'Яркость фонового свечения', 0, 0, 75, 1, '%'],
    ['logoScale', 'Размер логотипа', 100, 55, 150, 1, '%'],
    ['logoRadius', 'Скругление логотипа', 24, 0, 50, 1, '%'],
    ['logoGlow', 'Свечение логотипа', 0, 0, 90, 1, 'пкс'],
    ['titleScale', 'Размер заголовка', 100, 55, 145, 1, '%'],
    ['heroHeight', 'Высота первого экрана', 100, 70, 145, 1, '%'],
    ['font', 'Шрифт', 'original', [['original', 'Как на сайте'], ['montserrat', 'Montserrat'], ['system', 'Системный']]],
  ]],
  ['Иконки и наведение', [
    ['iconScale', 'Размер иконок на орбите', 100, 45, 155, 1, '%'],
    ['brightness', 'Яркость серых иконок', 1.65, .5, 3, .05, '×'],
    ['saturation', 'Насыщенность при наведении', 100, 0, 180, 1, '%'],
    ['glowColor', 'Цвет подсветки', '#ffffff'],
    ['iconGlow', 'Свечение иконки', 0, 0, 34, 1, 'пкс'],
    ['hoverGlow', 'Свечение при наведении', 0, 0, 45, 1, 'пкс'],
    ['hoverScale', 'Увеличение при наведении', 100, 70, 150, 1, '%'],
    ['hoverDuration', 'Скорость раскрытия карточки', 290, 40, 850, 10, 'мс'],
    ['previewVisible', 'Показывать карточки при наведении', true],
    ['previewBackground', 'Фон всплывающей карточки', '#252525'],
    ['previewWidth', 'Ширина всплывающей карточки', 198, 100, 280, 1, 'пкс'],
    ['previewRadius', 'Скругление всплывающей карточки', 10, 0, 28, 1, 'пкс'],
    ['previewTitle', 'Размер названия в карточке', 12, 9, 18, 1, 'пкс'],
  ]],
  ['Список ссылок', [
    ['directoryWidth', 'Ширина списка', 650, 360, 1000, 5, 'пкс'],
    ['cardHeight', 'Высота карточек', 81, 55, 145, 1, 'пкс'],
    ['cardGap', 'Интервал между карточками', 9, 0, 32, 1, 'пкс'],
    ['cardRadius', 'Скругление карточек', 12, 0, 42, 1, 'пкс'],
    ['cardBackground', 'Фон карточек', '#151515'],
    ['cardBorder', 'Яркость обводки', 10, 0, 65, 1, '%'],
  ]],
];

const fields = groups.flatMap(([, definitions]) => definitions);
const defaults = Object.fromEntries(fields.map(([key, , value]) => [key, value]));
const controls = document.querySelector('#controls');
const status = document.querySelector('#status');
const preview = document.querySelector('#preview');
const screen = document.querySelector('#screen');
const previewStatus = document.querySelector('#preview-status');
const fileInput = document.querySelector('#file');
const storageKey = 'dekrov-links-lab-v1';
const inputs = new Map();
const outputs = new Map();
let settings = { ...defaults };
let device = 'desktop';
let geometry = '';
let saveTimer;

function normalize(raw) {
  const normalized = { ...defaults };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid preset');
  for (const [key, , fallback, min, max] of fields) {
    const value = raw[key];
    if (typeof fallback === 'number' && typeof value === 'number' && Number.isFinite(value)) {
      normalized[key] = Math.min(max, Math.max(min, value));
    } else if (typeof fallback === 'boolean' && typeof value === 'boolean') {
      normalized[key] = value;
    } else if (Array.isArray(min) && min.some(([option]) => option === value)) {
      normalized[key] = value;
    } else if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
      normalized[key] = value.toLowerCase();
    }
  }
  return normalized;
}

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  settings = normalize(saved.settings || {});
  device = saved.device === 'mobile' ? 'mobile' : 'desktop';
} catch {}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ settings, device }));
    status.textContent = 'Сохранено в этом браузере.';
  } catch {
    status.textContent = 'Браузер не сохранил настройки. Их можно скачать.';
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 140);
}

function makeControl([key, label, fallback, min, max, step, unit]) {
  const row = document.createElement('label');
  row.className = 'control';
  row.htmlFor = key;
  const caption = document.createElement('span');
  caption.textContent = label;
  row.append(caption);
  const input = document.createElement(Array.isArray(min) ? 'select' : 'input');
  input.id = key;
  if (typeof fallback === 'number') {
    const output = document.createElement('output');
    output.setAttribute('for', key);
    row.append(output);
    outputs.set(key, { output, unit });
    Object.assign(input, { type: 'range', min, max, step });
  } else if (typeof fallback === 'boolean') {
    input.type = 'checkbox';
  } else if (Array.isArray(min)) {
    for (const [value, text] of min) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      input.append(option);
    }
  } else {
    input.type = 'color';
  }
  input.addEventListener('input', () => {
    settings[key] = input.type === 'checkbox' ? input.checked :
      input.type === 'range' ? input.valueAsNumber : input.value;
    showValue(key);
    apply();
    scheduleSave();
  });
  inputs.set(key, input);
  row.append(input);
  return row;
}

function showValue(key) {
  const info = outputs.get(key);
  if (info) {
    const value = new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(settings[key]);
    info.output.value = `${value} ${info.unit}`;
  }
}

for (const [index, [label, definitions]] of groups.entries()) {
  const panel = document.createElement('details');
  panel.open = index === 0;
  const summary = document.createElement('summary');
  summary.textContent = label;
  const rows = document.createElement('div');
  rows.className = 'controls';
  rows.append(...definitions.map(makeControl));
  panel.append(summary, rows);
  controls.append(panel);
}

function refreshControls() {
  for (const [key, input] of inputs) {
    if (input.type === 'checkbox') input.checked = settings[key];
    else input.value = settings[key];
    showValue(key);
  }
}

function apply() {
  const doc = preview.contentDocument;
  if (!doc?.querySelector('#orbit-stage')) return;
  const s = settings;
  const rgb = s.ambientColor.slice(1).match(/../g).map(value => parseInt(value, 16)).join(' ');
  const properties = {
    background: s.background,
    text: s.textColor !== defaults.textColor && s.textColor,
    muted: s.mutedColor !== defaults.mutedColor && s.mutedColor,
    ambient: `rgb(${rgb} / ${s.ambient}%)`,
    'logo-scale': s.logoScale / 100,
    'logo-radius': `${s.logoRadius}%`,
    'logo-glow': `${s.logoGlow}px`,
    'title-scale': s.titleScale / 100,
    'hero-height': s.heroHeight / 100,
    font: { original: false, montserrat: 'Montserrat, sans-serif', system: 'system-ui, sans-serif' }[s.font],
    'icon-scale': s.iconScale / 100,
    brightness: s.brightness,
    saturation: s.saturation / 100,
    'glow-color': s.glowColor,
    'icon-glow': `${s.iconGlow}px`,
    'hover-glow': `${s.hoverGlow}px`,
    'hover-scale': s.hoverScale / 100,
    'hover-duration': s.hoverDuration !== defaults.hoverDuration && `${s.hoverDuration}ms`,
    'preview-visibility': s.previewVisible ? 'visible' : 'hidden',
    'preview-background': s.previewBackground !== defaults.previewBackground && s.previewBackground,
    'preview-width': `${s.previewWidth}px`,
    'preview-radius': `${s.previewRadius}px`,
    'preview-title': `${s.previewTitle}px`,
    'directory-width': `${s.directoryWidth}px`,
    'card-height': s.cardHeight !== defaults.cardHeight && `${s.cardHeight}px`,
    'card-gap': `${s.cardGap}px`,
    'card-radius': `${s.cardRadius}px`,
    'card-background': s.cardBackground !== defaults.cardBackground && s.cardBackground,
    'card-border': s.cardBorder !== defaults.cardBorder && `rgb(255 255 255 / ${s.cardBorder}%)`,
  };
  for (const [name, value] of Object.entries(properties)) {
    if (value === false) doc.documentElement.style.removeProperty(`--lab-${name}`);
    else doc.documentElement.style.setProperty(`--lab-${name}`, value);
  }
  const nextGeometry = [s.radiusX, s.radiusY, s.ringGap, s.iconScale, s.logoScale, s.titleScale, s.font, s.heroHeight].join('/');
  const physics = {
    orbitPeriod: s.orbitPeriod * 1000, spreadDuration: s.spreadDuration * 1000,
    springFrequency: s.springFrequency / 1000, springDecay: s.springDecay / 1000,
    returnDuration: s.returnDuration * 1000, throwGain: s.throwGain, throwCap: s.throwCap,
    radiusX: s.radiusX, radiusY: s.radiusY, ringGap: s.ringGap, depth: s.depth / 100,
    direction: s.reverse ? -1 : 1, holdOnHover: s.holdOnHover,
  };
  preview.contentWindow.dispatchEvent(new CustomEvent('dekrov:orbit-settings', { detail: { physics, layout: geometry !== nextGeometry } }));
  geometry = nextGeometry;
}

function showDevice() {
  screen.classList.toggle('mobile', device === 'mobile');
  for (const button of document.querySelectorAll('[data-device]')) {
    button.setAttribute('aria-pressed', String(button.dataset.device === device));
  }
}
for (const button of document.querySelectorAll('[data-device]')) {
  button.addEventListener('click', () => { device = button.dataset.device; showDevice(); scheduleSave(); });
}

document.querySelector('#reset').addEventListener('click', () => {
  settings = { ...defaults };
  refreshControls();
  apply();
  save();
});
document.querySelector('#export').addEventListener('click', () => {
  const contents = JSON.stringify({ version: 1, settings }, null, 2);
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'dekrov-links-settings.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});
document.querySelector('#import').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  try {
    if (file.size > 65536) throw new Error('Too large');
    const preset = JSON.parse(await file.text());
    if (preset?.version !== 1) throw new Error('Unsupported preset');
    settings = normalize(preset.settings);
    refreshControls();
    apply();
    save();
  } catch {
    status.textContent = 'Открой JSON, скачанный из Links Lab.';
  } finally {
    fileInput.value = '';
  }
});

async function loadPreview() {
  try {
    const response = await fetch('../index.html');
    if (!response.ok) throw new Error('Preview source unavailable');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const base = doc.createElement('base');
    base.href = new URL('../', location.href).href;
    doc.head.prepend(base);
    const overrides = doc.createElement('link');
    overrides.rel = 'stylesheet';
    overrides.href = 'lab/preview.css';
    doc.head.append(overrides);
    preview.addEventListener('load', () => {
      const frame = preview.contentDocument;
      if (!frame?.querySelector('#orbit-stage')) return;
      preview.hidden = false;
      previewStatus.hidden = true;
      frame.addEventListener('click', (event) => {
        const anchor = event.target.closest('a');
        if (!anchor) return;
        event.preventDefault();
        if (anchor.getAttribute('href') === '#links') frame.querySelector('#links').scrollIntoView();
      }, true);
      apply();
    });
    preview.srcdoc = '<!doctype html>\n' + doc.documentElement.outerHTML;
  } catch {
    previewStatus.textContent = 'Предпросмотр не загрузился. Обнови страницу.';
  }
}

refreshControls();
showDevice();
loadPreview();
