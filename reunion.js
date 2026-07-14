/* ════════════════════════════════════════════════════════════════
   MODO REUNIÓN — Placas de invitación a reuniones locales
   ────────────────────────────────────────────────────────────────
   Tercer tipo de documento (junto a Nota y Comunicado). El referente:
   elige 1 de 3 plantillas, completa ciudad/fecha/hora/lugar/dirección,
   opcionalmente sube una foto, y exporta la placa 1080×1350 (JPG).

   Replica las "Esteticas LLA RN | 1080x1350 px" que hoy se editan a mano
   en Google Slides. Los textos de slogan son FIJOS por plantilla; solo
   cambian los datos del evento y la foto.

   Render: HTML a tamaño real (1080×1350) escalado para preview; export
   con html2canvas (ya cargado en la app) a escala 1 → JPEG.
   ════════════════════════════════════════════════════════════════ */

const REUNION_W = 1080;
const REUNION_H = 1350;
const REUNION_LOGO = 'LLA LOGO.png';   // logo completo (águila + LA LIBERTAD AVANZA, sin "Río Negro")
const REUNION_EAGLE = 'LLA EAGLE.png'; // águila sola (marca de agua de la foto vacía)
let reunionImage = null;               // dataURL de la foto subida (o null → placeholder)
let reunionImgZoom = 1;                // 1..3 (zoom del encuadre)
let reunionImgPos = { x: 0, y: 0 };    // -1..1 en cada eje (pan dentro del margen)

// ─── Helpers ───
function reunionEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
// Formatea el value del <input type=date> (YYYY-MM-DD) a "DD/MM".
// Si el value ya es texto libre (drafts viejos), lo devuelve tal cual.
function reunionFmtFecha(raw) {
  if (!raw) return '22/06';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return m ? (m[3] + '/' + m[2]) : raw;
}
// Formatea el value del <input type=time> (HH:MM) a "HH:MM h" (formato del deck).
function reunionFmtHora(raw) {
  if (!raw) return '17:00 h';
  const m = /^(\d{2}):(\d{2})$/.exec(raw);
  return m ? (m[1] + ':' + m[2] + ' h') : raw;
}

function reunionFields() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  return {
    ciudad: v('cityInput') || 'Ciudad',
    fecha: reunionFmtFecha(v('reunionFecha')),
    hora: reunionFmtHora(v('reunionHora')),
    lugar: v('reunionLugar') || 'Casa de la Libertad',
    direccion: v('reunionDireccion') || 'Dirección 0000',
    template: (document.querySelector('input[name="reunionTemplate"]:checked')?.value) || 't1'
  };
}

// Componente compartido: pill blanco con fecha | hora | (lugar / dirección / ciudad)
function reunionPill(d) {
  return `<div class="placa-pill">
    <span class="placa-pill-date">${reunionEsc(d.fecha)}</span>
    <span class="placa-pill-vsep"></span>
    <span class="placa-pill-time">${reunionEsc(d.hora)}</span>
    <span class="placa-pill-vsep"></span>
    <span class="placa-pill-place"><strong>${reunionEsc(d.lugar)}</strong>${reunionEsc(d.direccion)}<br>${reunionEsc(d.ciudad)}.</span>
  </div>`;
}
// Foto (subida) o placeholder violeta con águila de agua.
// El encuadre (zoom + pan) va como transform inline así el export renderiza idéntico.
// translate se aplica antes que scale (orden derecha→izquierda), así que el
// desplazamiento visual máximo sin dejar huecos es (z−1)/2 del frame:
// tx_max% = (z−1)/(2z)·100 del tamaño del propio img.
function reunionPhoto() {
  if (reunionImage) {
    const z = reunionImgZoom;
    const m = (z - 1) / (2 * z) * 100;
    const tx = (reunionImgPos.x * m).toFixed(2);
    const ty = (reunionImgPos.y * m).toFixed(2);
    const pannable = z > 1.001 ? ' is-pannable' : '';
    return `<div class="placa-photo${pannable}"><img src="${reunionImage}" alt="" style="transform: scale(${z}) translate(${tx}%, ${ty}%)"></div>`;
  }
  return `<div class="placa-photo placa-photo--empty">
    <img class="placa-photo-wm" src="${REUNION_EAGLE}" alt="">
    <span class="placa-photo-hint">Sumá una foto (opcional)</span>
  </div>`;
}
// Logo completo (LA LIBERTAD AVANZA) con la ciudad donde iba "Río Negro"
function reunionBrand(d, boxed) {
  const cls = boxed ? 'placa-brand placa-brand--boxed' : 'placa-brand';
  return `<div class="${cls}"><img class="placa-brand-logo" src="${REUNION_LOGO}" alt="La Libertad Avanza"><span class="placa-brand-city">${reunionEsc(d.ciudad)}</span></div>`;
}

// ─── Las 3 plantillas ───
const REUNION_TEMPLATES = {
  // 1 — "La batalla cultural te necesita" (título arriba, foto al medio con pill superpuesto, águila abajo)
  t1: {
    label: 'Batalla cultural',
    render: d => `
      <div class="placa-inner placa--t1">
        <h1 class="placa-title">La batalla cultural<br><span class="ul">te necesita.</span></h1>
        <p class="placa-sub"><span class="hl">Sumate</span> y construyamos<br>La Libertad Avanza en ${reunionEsc(d.ciudad)}.</p>
        <div class="placa-photo-block">
          ${reunionPhoto()}
          ${reunionPill(d)}
        </div>
        ${reunionBrand(d, false)}
      </div>`
  },
  // 2 — "Reunión" tag arriba, título, pill, foto debajo, logo abajo
  t2: {
    label: 'Reunión',
    render: d => `
      <div class="placa-inner placa--t2">
        <span class="placa-tag">Reunión</span>
        <h1 class="placa-title placa-title--sm">Súmate a dar la<br><span class="hl">batalla cultural</span><br><span class="placa-title-tail">en nuestra ciudad.</span></h1>
        ${reunionPill(d)}
        ${reunionPhoto()}
        ${reunionBrand(d, false)}
      </div>`
  },
  // 3 — Águila en caja arriba-derecha, título a la izquierda, pill, foto grande abajo
  t3: {
    label: 'En nuestra ciudad',
    render: d => `
      <div class="placa-inner placa--t3">
        ${reunionBrand(d, true)}
        <h1 class="placa-title placa-title--sm">Súmate a la<br><span class="hl">batalla cultural</span><br><span class="placa-title-tail">en nuestra ciudad</span></h1>
        ${reunionPill(d)}
        ${reunionPhoto()}
      </div>`
  }
};

// ─── Render del preview (a tamaño real, escalado por CSS transform) ───
function renderReunionPreview() {
  const host = document.getElementById('reunionPlaca');
  if (!host) return;
  const d = reunionFields();
  const tpl = REUNION_TEMPLATES[d.template] || REUNION_TEMPLATES.t1;
  host.className = 'placa';
  host.innerHTML = tpl.render(d);
  scaleReunionPreview();
  // Sincronizar el label de la ciudad en el editor + selector de plantilla activo
  document.querySelectorAll('.reunion-tpl-card').forEach(c => {
    c.classList.toggle('is-selected', c.querySelector('input')?.value === d.template);
  });
  syncReunionImgControls();
}

// Muestra/oculta los controles de encuadre y sincroniza el slider con el estado
function syncReunionImgControls() {
  const ctr = document.getElementById('reunionImgControls');
  if (!ctr) return;
  ctr.style.display = reunionImage ? 'block' : 'none';
  const noFoto = document.querySelector('.reunion-nofoto-hint');
  if (noFoto) noFoto.style.display = reunionImage ? 'none' : 'block';
  const slider = document.getElementById('reunionZoom');
  const val = document.getElementById('reunionZoomVal');
  if (slider) slider.value = Math.round(reunionImgZoom * 100);
  if (val) val.textContent = Math.round(reunionImgZoom * 100) + '%';
}

// Slider de zoom (100..300 → 1..3). Reajusta el pan para no dejar huecos.
function reunionSetZoom(v) {
  reunionImgZoom = Math.max(1, Math.min(3, Number(v) / 100));
  // Al reducir zoom, el rango de pan se achica; clamp a [-1,1] siempre es válido
  reunionImgPos.x = Math.max(-1, Math.min(1, reunionImgPos.x));
  reunionImgPos.y = Math.max(-1, Math.min(1, reunionImgPos.y));
  renderReunionPreview();
  if (typeof scheduleSave === 'function') scheduleSave();
}

// Reaplica el transform de la foto sin re-render completo (más fluido al arrastrar/pellizcar)
function _reunionApplyTransform() {
  const img = document.querySelector('#reunionScaler .placa-photo img');
  if (!img) return;
  const z = reunionImgZoom, m = (z - 1) / (2 * z) * 100;
  img.style.transform = 'scale(' + z + ') translate(' + (reunionImgPos.x * m).toFixed(2) + '%, ' + (reunionImgPos.y * m).toFixed(2) + '%)';
}
function _reunionTouchDist(t) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}

// Encuadre en el preview: arrastrar (mouse/1 dedo) para mover, pellizcar (2 dedos) para zoom.
function bindReunionPan() {
  const scaler = document.getElementById('reunionScaler');
  if (!scaler || scaler._panBound) return;
  scaler._panBound = true;
  let dragging = false, lastX = 0, lastY = 0;
  let pinching = false, pinchStartDist = 0, pinchStartZoom = 1;
  const inPhoto = target => { const p = target && target.closest && target.closest('.placa-photo'); return (p && scaler.contains(p)) ? p : null; };

  const start = e => {
    if (!reunionImage) return;
    if (e.touches && e.touches.length === 2 && inPhoto(e.target)) {
      pinching = true; dragging = false;
      pinchStartDist = _reunionTouchDist(e.touches);
      pinchStartZoom = reunionImgZoom;
      e.preventDefault();
      return;
    }
    if (reunionImgZoom <= 1.001 || !inPhoto(e.target)) return;
    dragging = true;
    const p = e.touches ? e.touches[0] : e;
    lastX = p.clientX; lastY = p.clientY;
    e.preventDefault();
  };
  const move = e => {
    if (pinching && e.touches && e.touches.length === 2) {
      if (pinchStartDist > 0) {
        reunionImgZoom = Math.max(1, Math.min(3, pinchStartZoom * _reunionTouchDist(e.touches) / pinchStartDist));
        reunionImgPos.x = Math.max(-1, Math.min(1, reunionImgPos.x));
        reunionImgPos.y = Math.max(-1, Math.min(1, reunionImgPos.y));
        _reunionApplyTransform();
        syncReunionImgControls();
      }
      e.preventDefault();
      return;
    }
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    const photo = scaler.querySelector('.placa-photo');
    if (!photo) return;
    const r = photo.getBoundingClientRect();
    const z = reunionImgZoom;
    const rangeX = r.width * (z - 1) / 2, rangeY = r.height * (z - 1) / 2;
    if (rangeX > 0) reunionImgPos.x = Math.max(-1, Math.min(1, reunionImgPos.x + (p.clientX - lastX) / rangeX));
    if (rangeY > 0) reunionImgPos.y = Math.max(-1, Math.min(1, reunionImgPos.y + (p.clientY - lastY) / rangeY));
    lastX = p.clientX; lastY = p.clientY;
    _reunionApplyTransform();
    e.preventDefault();
  };
  const end = e => {
    const wasActive = dragging || pinching;
    if (pinching && (!e.touches || e.touches.length < 2)) pinching = false;
    if (dragging && (!e.touches || e.touches.length === 0)) dragging = false;
    if (wasActive && !dragging && !pinching && typeof scheduleSave === 'function') scheduleSave();
  };
  scaler.addEventListener('mousedown', start);
  scaler.addEventListener('touchstart', start, { passive: false });
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('mouseup', end);
  window.addEventListener('touchend', end);
}

// Escala la placa 1080×1350 para que entre en el ancho disponible del preview
function scaleReunionPreview() {
  const wrap = document.getElementById('reunionScaler');
  const host = document.getElementById('reunionPlaca');
  if (!wrap || !host) return;
  const avail = wrap.clientWidth || 360;
  const scale = Math.min(1, avail / REUNION_W);
  host.style.transform = 'scale(' + scale + ')';
  wrap.style.height = (REUNION_H * scale) + 'px';
}

// ─── Subida / cambio de foto (con downscale para no reventar localStorage) ───
function reunionHandleImage(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!/^image\//.test(file.type)) { if (typeof showToast === 'function') showToast('El archivo no es una imagen', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      // downscale a máx 1280px de lado mayor, JPEG 0.85 → placa nítida sin ocupar MB
      const maxSide = 1280;
      let { width, height } = img;
      if (Math.max(width, height) > maxSide) {
        const k = maxSide / Math.max(width, height);
        width = Math.round(width * k); height = Math.round(height * k);
      }
      const cv = document.createElement('canvas');
      cv.width = width; cv.height = height;
      cv.getContext('2d').drawImage(img, 0, 0, width, height);
      reunionImage = cv.toDataURL('image/jpeg', 0.85);
      reunionImgZoom = 1;
      reunionImgPos = { x: 0, y: 0 };
      renderReunionPreview();
      if (typeof scheduleSave === 'function') scheduleSave();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function reunionRemoveImage() {
  reunionImage = null;
  reunionImgZoom = 1;
  reunionImgPos = { x: 0, y: 0 };
  const inp = document.getElementById('reunionImageInput');
  if (inp) inp.value = '';
  renderReunionPreview();
  if (typeof scheduleSave === 'function') scheduleSave();
}
// Volver la foto a su encuadre original (zoom 100%, centrada) sin re-subirla
function reunionResetFraming() {
  reunionImgZoom = 1;
  reunionImgPos = { x: 0, y: 0 };
  renderReunionPreview();
  if (typeof scheduleSave === 'function') scheduleSave();
}

/* ─── Recordar dirección por ciudad ─── */
const REUNION_DIRS_KEY = 'lla_reunion_dirs_v1';
function _reunionGetDirs() {
  try { return JSON.parse(localStorage.getItem(REUNION_DIRS_KEY) || '{}'); } catch { return {}; }
}
// Guarda la dirección tipeada bajo la ciudad actual (ignora el placeholder)
function reunionRememberDir() {
  const city = (document.getElementById('cityInput')?.value || '').trim();
  const dir = (document.getElementById('reunionDireccion')?.value || '').trim();
  if (!city || !dir || dir === 'Dirección 0000') return;
  const dirs = _reunionGetDirs();
  dirs[city] = dir;
  try { localStorage.setItem(REUNION_DIRS_KEY, JSON.stringify(dirs)); } catch {}
}
// Al cambiar de ciudad (selectCity): carga la dirección recordada de esa ciudad,
// o limpia el campo si no hay ninguna (evita arrastrar la dirección de otra ciudad).
function reunionOnCityChange(city) {
  const el = document.getElementById('reunionDireccion');
  if (!el) return;
  const dirs = _reunionGetDirs();
  el.value = dirs[city] || '';
}

// ─── Export a JPG 2160×2700 (2× para HD de WhatsApp) ───
const REUNION_EXPORT_SCALE = 2; // 1080×1350 → 2160×2700
async function exportReunion() {
  const d = reunionFields();
  if (typeof showLoading === 'function') showLoading('Generando placa HD 2160×2700...');
  // Contenedor de render a tamaño REAL, offscreen (sin el transform del preview)
  const stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + REUNION_W + 'px;height:' + REUNION_H + 'px;';
  const placa = document.createElement('div');
  placa.className = 'placa';
  placa.style.cssText = 'width:' + REUNION_W + 'px;height:' + REUNION_H + 'px;transform:none;';
  placa.innerHTML = (REUNION_TEMPLATES[d.template] || REUNION_TEMPLATES.t1).render(d);
  stage.appendChild(placa);
  document.body.appendChild(stage);
  try {
    // Esperar a que la fuente y las imágenes internas carguen
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
    await Promise.all(Array.from(placa.querySelectorAll('img')).map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })));
    const canvas = await html2canvas(placa, { width: REUNION_W, height: REUNION_H, scale: REUNION_EXPORT_SCALE, backgroundColor: null, useCORS: true, logging: false });
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
    const cityClean = (d.ciudad || 'ciudad').replace(/[^\w áéíóúñ-]/gi, '').trim().replace(/\s+/g, '-');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Reunion-' + cityClean + '.jpg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    if (typeof logActivity === 'function') logActivity('export_reunion', { city: d.ciudad });
    if (typeof showToast === 'function') showToast('✓ Placa HD lista (2160×2700)', 'success', 3000);
  } catch (err) {
    console.error('Export placa falló:', err);
    if (typeof showToast === 'function') showToast('No se pudo generar la placa: ' + (err.message || err), 'error', 5000);
  } finally {
    document.body.removeChild(stage);
    if (typeof hideLoading === 'function') hideLoading();
  }
}

// ─── Estado (draft): la foto y su encuadre se guardan aparte de los inputs ───
function getReunionImage() { return reunionImage; }
function setReunionImage(dataUrl) { reunionImage = dataUrl || null; if (!reunionImage) { reunionImgZoom = 1; reunionImgPos = { x: 0, y: 0 }; } }
function getReunionFraming() { return { zoom: reunionImgZoom, x: reunionImgPos.x, y: reunionImgPos.y }; }
function setReunionFraming(f) {
  if (f && typeof f === 'object') {
    reunionImgZoom = Math.max(1, Math.min(3, f.zoom || 1));
    reunionImgPos = { x: Math.max(-1, Math.min(1, f.x || 0)), y: Math.max(-1, Math.min(1, f.y || 0)) };
  } else { reunionImgZoom = 1; reunionImgPos = { x: 0, y: 0 }; }
}

// ─── Init ───
function initReunion() {
  const bind = id => {
    const el = document.getElementById(id);
    if (el) {
      // date/time disparan 'change'; text 'input' — escuchamos ambos
      const h = () => { renderReunionPreview(); if (typeof scheduleSave === 'function') scheduleSave(); };
      el.addEventListener('input', h);
      el.addEventListener('change', h);
    }
  };
  ['reunionFecha', 'reunionHora', 'reunionLugar', 'reunionDireccion'].forEach(bind);
  // Recordar la dirección por ciudad al tipear
  const dirEl = document.getElementById('reunionDireccion');
  if (dirEl) dirEl.addEventListener('input', reunionRememberDir);
  document.querySelectorAll('input[name="reunionTemplate"]').forEach(r => {
    r.addEventListener('change', () => { renderReunionPreview(); if (typeof scheduleSave === 'function') scheduleSave(); });
  });
  window.addEventListener('resize', () => { if (document.body.classList.contains('mode-reunion')) scaleReunionPreview(); });
  bindReunionPan();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initReunion);
else initReunion();
