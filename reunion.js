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
function reunionFields() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  return {
    ciudad: v('cityInput') || 'Ciudad',
    fecha: v('reunionFecha') || '22/06',
    hora: v('reunionHora') || '17:00 h',
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

// Arrastre para reencuadrar la foto en el preview (delegado, sobrevive a re-render)
function bindReunionPan() {
  const scaler = document.getElementById('reunionScaler');
  if (!scaler || scaler._panBound) return;
  scaler._panBound = true;
  let dragging = false, lastX = 0, lastY = 0;
  const down = e => {
    if (!reunionImage || reunionImgZoom <= 1.001) return;
    const photo = e.target.closest('.placa-photo');
    if (!photo || !scaler.contains(photo)) return;
    dragging = true;
    const p = e.touches ? e.touches[0] : e;
    lastX = p.clientX; lastY = p.clientY;
    e.preventDefault();
  };
  const move = e => {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    const placa = document.getElementById('reunionPlaca');
    const scale = (placa && placa.getBoundingClientRect().width / REUNION_W) || 0.33;
    const photo = scaler.querySelector('.placa-photo');
    if (!photo) return;
    // px de pantalla → fracción del rango de pan del propio frame
    const frameW = photo.getBoundingClientRect().width;   // ya escalado
    const frameH = photo.getBoundingClientRect().height;
    const z = reunionImgZoom;
    const rangeX = frameW * (z - 1) / 2;  // px de pantalla de recorrido a cada lado
    const rangeY = frameH * (z - 1) / 2;
    if (rangeX > 0) reunionImgPos.x = Math.max(-1, Math.min(1, reunionImgPos.x + (p.clientX - lastX) / rangeX));
    if (rangeY > 0) reunionImgPos.y = Math.max(-1, Math.min(1, reunionImgPos.y + (p.clientY - lastY) / rangeY));
    lastX = p.clientX; lastY = p.clientY;
    // Reaplicar transform sin re-render completo (más fluido)
    const img = photo.querySelector('img');
    if (img) {
      const m = (z - 1) / (2 * z) * 100;
      img.style.transform = 'scale(' + z + ') translate(' + (reunionImgPos.x * m).toFixed(2) + '%, ' + (reunionImgPos.y * m).toFixed(2) + '%)';
    }
    e.preventDefault();
  };
  const up = () => { if (dragging) { dragging = false; if (typeof scheduleSave === 'function') scheduleSave(); } };
  scaler.addEventListener('mousedown', down);
  scaler.addEventListener('touchstart', down, { passive: false });
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('mouseup', up);
  window.addEventListener('touchend', up);
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

// ─── Export a JPG 1080×1350 (html2canvas a escala real) ───
async function exportReunion() {
  const d = reunionFields();
  if (typeof showLoading === 'function') showLoading('Generando placa 1080×1350...');
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
    const canvas = await html2canvas(placa, { width: REUNION_W, height: REUNION_H, scale: 1, backgroundColor: null, useCORS: true, logging: false });
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', mobile ? 0.9 : 0.95));
    const cityClean = (d.ciudad || 'ciudad').replace(/[^\w áéíóúñ-]/gi, '').trim().replace(/\s+/g, '-');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Reunion-' + cityClean + '.jpg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    if (typeof logActivity === 'function') logActivity('export_reunion', { city: d.ciudad });
    if (typeof showToast === 'function') showToast('✓ Placa lista (1080×1350)', 'success', 3000);
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
  const bind = id => { const el = document.getElementById(id); if (el) el.addEventListener('input', () => { renderReunionPreview(); if (typeof scheduleSave === 'function') scheduleSave(); }); };
  ['reunionFecha', 'reunionHora', 'reunionLugar', 'reunionDireccion'].forEach(bind);
  document.querySelectorAll('input[name="reunionTemplate"]').forEach(r => {
    r.addEventListener('change', () => { renderReunionPreview(); if (typeof scheduleSave === 'function') scheduleSave(); });
  });
  window.addEventListener('resize', () => { if (document.body.classList.contains('mode-reunion')) scaleReunionPreview(); });
  bindReunionPan();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initReunion);
else initReunion();
