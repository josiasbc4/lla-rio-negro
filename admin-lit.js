/* ════════════════════════════════════════════════════════════════
   ADMIN UI — Web Components (Lit)  ·  Opción B / piloto
   ────────────────────────────────────────────────────────────────
   Migración incremental de la UI del panel admin a Web Components.
   La LÓGICA y los DATOS siguen viviendo en app.js (funciones globales:
   getActivityLog, last14DaysCounts, adminDownloadCSV, etc.). Acá solo
   migramos la CAPA DE RENDER, de forma declarativa.

   Decisiones:
   - Light DOM (createRenderRoot → this): el componente NO usa Shadow DOM,
     así reutiliza el CSS global .admin-* que ya existe en styles.css.
   - Sin build step: Lit se importa por ESM desde CDN (igual criterio que
     html2canvas / jsPDF). Queda en el precache del Service Worker.

   Primer componente migrado: <lla-admin-activity> (pestaña Actividad).
   ════════════════════════════════════════════════════════════════ */
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js';

// Iconos SVG (mismo set de trazos feather-style que usa el resto de la UI)
const _icon = (paths) => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" .innerHTML=${paths}></svg>`;
const ACTIVITY_ICONS = {
  login: _icon('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>'),
  export_pdf: _icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
  export_jpg: _icon('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
  share_pdf: _icon('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>'),
  export_instagram: _icon('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>'),
  reset: _icon('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>')
};
const ACTIVITY_ICON_DEFAULT = _icon('<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>');
const ACTIVITY_LABELS = {
  login: 'Inicio de sesión', export_pdf: 'Exportó PDF', export_jpg: 'Exportó JPG',
  share_pdf: 'Compartió documento', export_instagram: 'Exportó Instagram',
  reset: 'Reset del formulario'
};
const EXPORT_ACTIONS = ['export_pdf', 'export_jpg', 'share_pdf', 'export_instagram'];

class LlaAdminActivity extends LitElement {
  // Light DOM: reutiliza el CSS global existente (.admin-*)
  createRenderRoot() { return this; }

  // Permite a app.js refrescar el componente (renderAdminActivity delega acá)
  refresh() { this.requestUpdate(); }

  _log() {
    return (typeof window.getActivityLog === 'function') ? window.getActivityLog() : [];
  }

  _spark(data, color) {
    if (!data || !data.length) return '';
    const max = Math.max(1, ...data);
    const w = 200, h = 28;
    const step = w / (data.length - 1);
    const points = data.map((v, i) => `${i * step},${(h - (v / max) * h).toFixed(1)}`).join(' ');
    const area = `0,${h} ${points} ${w},${h}`;
    return html`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <polygon points="${area}" fill="${color}" opacity="0.18"></polygon>
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round" opacity="0.9"></polyline>
    </svg>`;
  }

  _activityItem(e) {
    const d = new Date(e.ts);
    const isToday = d.toDateString() === new Date().toDateString();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const when = isToday
      ? `hoy ${hh}:${mm}`
      : `${d.toLocaleDateString('es-AR')} ${hh}:${mm}`;
    return html`
      <div class="admin-activity-item">
        <div class="admin-activity-icon">${ACTIVITY_ICONS[e.action] || ACTIVITY_ICON_DEFAULT}</div>
        <div style="flex:1;min-width:0">
          <div class="admin-activity-action">${ACTIVITY_LABELS[e.action] || e.action}</div>
          ${e.city ? html`<div class="admin-activity-meta">Ciudad: ${e.city}</div>` : ''}
        </div>
        <div class="admin-activity-time">${when}</div>
      </div>`;
  }

  render() {
    const log = this._log();
    const exports = log.filter(e => EXPORT_ACTIONS.includes(e.action));
    const today = new Date().toDateString();
    const todayExports = exports.filter(e => new Date(e.ts).toDateString() === today);
    const pdfCount = log.filter(e => e.action === 'export_pdf').length;
    const jpgCount = log.filter(e => e.action === 'export_jpg').length;
    const sparkData = (typeof window.last14DaysCounts === 'function')
      ? window.last14DaysCounts(exports) : [];

    // Top ciudades
    const cityCounts = {};
    exports.forEach(e => { if (e.city) cityCounts[e.city] = (cityCounts[e.city] || 0) + 1; });
    const sortedCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxCount = sortedCities.length ? sortedCities[0][1] : 1;

    // Histórico reciente
    const recent = log.slice().reverse().slice(0, 30);

    return html`
      <div class="admin-stats-grid">
        <div class="admin-stat-card">
          <div class="admin-stat-value">${exports.length}</div>
          <div class="admin-stat-label">Total exportaciones</div>
          <div class="admin-stat-spark">${this._spark(sparkData, '#fcd34d')}</div>
        </div>
        <div class="admin-stat-card accent-green">
          <div class="admin-stat-value">${todayExports.length}</div>
          <div class="admin-stat-label">Hoy</div>
          <div class="admin-stat-spark">${this._spark(sparkData, '#86efac')}</div>
        </div>
        <div class="admin-stat-card accent-pink">
          <div class="admin-stat-value">${pdfCount}</div>
          <div class="admin-stat-label">PDFs</div>
        </div>
        <div class="admin-stat-card accent-blue">
          <div class="admin-stat-value">${jpgCount}</div>
          <div class="admin-stat-label">JPGs</div>
        </div>
      </div>

      <div class="admin-activity-layout">
        <div class="admin-section">
          <div class="admin-section-title"><svg class="ui-icon" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>Top ciudades</div>
          ${sortedCities.length
            ? html`<ul class="admin-top-list">${sortedCities.map(([city, count]) => html`
                <li>
                  <span class="admin-top-name">${city}</span>
                  <span class="admin-top-bar"><span class="admin-top-bar-fill" style="width:${Math.round((count / maxCount) * 100)}%"></span></span>
                  <span class="admin-top-count">${count}</span>
                </li>`)}</ul>`
            : html`<div class="admin-empty">
                <span class="admin-empty-icon">${_icon('<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>')}</span>
                <span>Aún no hay exportaciones</span>
                <span class="admin-empty-hint">Cuando los referentes exporten documentos, las ciudades más activas aparecen acá.</span>
              </div>`}
        </div>

        <div class="admin-section">
          <div class="admin-section-title"><svg class="ui-icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>Histórico reciente</div>
          ${recent.length
            ? html`<div class="admin-activity-list">${recent.map(e => this._activityItem(e))}</div>`
            : html`<div class="admin-empty">
                <span class="admin-empty-icon">${_icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>')}</span>
                <span>No hay actividad registrada todavía</span>
                <span class="admin-empty-hint">Cada login y exportación queda registrado en este historial.</span>
              </div>`}
        </div>
      </div>

      <div class="admin-section">
        <div class="admin-section-title"><svg class="ui-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>Exportar datos</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="admin-btn-ghost" style="flex:1;min-width:200px" @click=${() => window.adminDownloadCSV && window.adminDownloadCSV()}><svg class="ui-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> Descargar CSV (Excel)</button>
          <button class="admin-btn-ghost" style="flex:1;min-width:200px" @click=${() => window.adminSyncAllActivity && window.adminSyncAllActivity()}><svg class="ui-icon" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Sincronizar todo al Sheet</button>
        </div>
        <div style="margin-top:10px;font-size:11px;color:rgba(255,255,255,0.7);line-height:1.5">
          <strong style="color:#fcd34d">CSV:</strong> descarga toda tu actividad local en un archivo Excel-compatible.<br>
          <strong style="color:#fcd34d">Sincronizar:</strong> envía toda la actividad local al Google Sheet (configurá la URL en Mantenimiento).
        </div>
      </div>`;
  }
}

customElements.define('lla-admin-activity', LlaAdminActivity);
