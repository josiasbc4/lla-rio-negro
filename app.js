/* ════════════════════════════════════════════════════════════════
   SISTEMA DE AUTENTICACIÓN — Códigos de referente
   ────────────────────────────────────────────────────────────────
   Cada referente tiene un código único hasheado con SHA-256.
   Para agregar un nuevo referente:
     1. Inventá un código siguiendo el formato: LLA-NOMBRE-XXXXXX
        (XXXXXX = 6 chars random alfanuméricos)
     2. Calculá su hash SHA-256 normalizando a MAYÚSCULAS:
        En la consola del browser:
          await sha256("LLA-NOMBRE-XXXXXX")
        O en PowerShell:
          $h = [System.Security.Cryptography.SHA256]::Create().ComputeHash(
            [System.Text.Encoding]::UTF8.GetBytes("LLA-NOMBRE-XXXXXX".ToUpper())
          )
          [System.BitConverter]::ToString($h).Replace("-","").ToLower()
     3. Agregá { name, hash } al array AUTHORIZED_USERS
     4. Mandale el código al referente por canal privado (WhatsApp, Signal, etc.)
   ════════════════════════════════════════════════════════════════ */
// Fallback embebido — se reemplaza al cargar users.json del repo
let AUTHORIZED_USERS = [
  { name: 'Josias Amaya', hash: '6e87d83209d80f113740c333ff30eee50fd146bb46cc9cbac3b137ed738c80ed', role: 'admin' },
  { name: 'Luis Carilao', hash: '5a5655498368e7f4de5df71c62da4a7827bc86415ad3449f25b4b3977be27105' }
];

// Promesa que resuelve cuando users.json terminó de cargar (o falla y usa fallback)
let _usersReadyResolve;
const usersReady = new Promise(r => { _usersReadyResolve = r; });
let _usersLoading = true;  // skeleton loaders en admin mientras se descarga users.json

async function loadUsersFromRepo() {
  try {
    const res = await fetch('users.json?ts=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.users) && data.users.length) {
        AUTHORIZED_USERS = data.users;
      }
      // Guardar adminData encriptado para desencriptar al loguearse
      window._remoteAdminData = data.adminData || {};
      // Config compartida (URL Apps Script, link de vista del Sheet, etc)
      window._sharedConfig = {
        sheetUrl: data.sheetUrl || data.script_url || '',
        sheetViewUrl: data.sheetViewUrl || ''
      };
    }
  } catch (e) { /* silencioso: usa fallback embebido */ }
  _usersLoading = false;
  // Si el drawer de admin está abierto, re-renderizar para reemplazar skeletons por datos reales
  if (document.getElementById('adminDrawer')?.classList.contains('open')) {
    if (typeof renderAdminUsers === 'function') renderAdminUsers();
  }
  _usersReadyResolve();
}
loadUsersFromRepo();

// ─── GitHub API: auto-push de nuevos referentes ───
const GH_REPO = 'josiasbc4/lla-rio-negro';
const GH_USERS_PATH = 'users.json';
const GH_PAT_KEY = 'lla_gh_pat_v1';

function getGitHubPAT() { return localStorage.getItem(GH_PAT_KEY) || ''; }
function setGitHubPAT(token) {
  if (token) localStorage.setItem(GH_PAT_KEY, token);
  else localStorage.removeItem(GH_PAT_KEY);
}

function b64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

async function ghPushUser(user) {
  const token = getGitHubPAT();
  if (!token) throw new Error('Falta configurar el Personal Access Token de GitHub en Mantenimiento → GitHub.');
  const apiUrl = `https://api.github.com/repos/${GH_REPO}/contents/${GH_USERS_PATH}`;
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  // 1. Leer estado actual del archivo
  const getRes = await fetch(apiUrl, { headers });
  if (!getRes.ok) {
    const t = await getRes.text().catch(() => '');
    throw new Error('No se pudo leer users.json del repo (' + getRes.status + '). ' + t.slice(0, 200));
  }
  const fileData = await getRes.json();
  const current = JSON.parse(b64DecodeUtf8(fileData.content));
  if (!Array.isArray(current.users)) current.users = [];
  if (current.users.some(u => u.name.toLowerCase() === user.name.toLowerCase())) {
    throw new Error('Ya existe un referente con ese nombre en el repo.');
  }
  current.users.push(user);
  current.updatedAt = new Date().toISOString();
  current.version = (current.version || 1);
  const newContent = JSON.stringify(current, null, 2) + '\n';
  // 2. Commit
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'admin: agregar referente ' + user.name,
      content: b64EncodeUtf8(newContent),
      sha: fileData.sha
    })
  });
  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({}));
    throw new Error('Push falló: ' + (errData.message || putRes.status));
  }
  return true;
}

async function ghRemoveUser(userOrHash) {
  const token = getGitHubPAT();
  if (!token) throw new Error('Falta configurar el Personal Access Token de GitHub en Mantenimiento → GitHub.');
  const targetHash = (typeof userOrHash === 'string') ? userOrHash : userOrHash.hash;
  const targetName = (typeof userOrHash === 'string') ? null : userOrHash.name;
  const apiUrl = `https://api.github.com/repos/${GH_REPO}/contents/${GH_USERS_PATH}`;
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  // 1. Leer estado actual
  const getRes = await fetch(apiUrl, { headers });
  if (!getRes.ok) {
    const t = await getRes.text().catch(() => '');
    throw new Error('No se pudo leer users.json del repo (' + getRes.status + '). ' + t.slice(0, 200));
  }
  const fileData = await getRes.json();
  const current = JSON.parse(b64DecodeUtf8(fileData.content));
  if (!Array.isArray(current.users)) current.users = [];
  const before = current.users.length;
  current.users = current.users.filter(u => u.hash !== targetHash);
  if (current.users.length === before) {
    // No estaba en el repo (probablemente solo local) — no es error
    return { removed: false, notFound: true };
  }
  current.updatedAt = new Date().toISOString();
  current.version = (current.version || 1);
  const newContent = JSON.stringify(current, null, 2) + '\n';
  // 2. Commit
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'admin: quitar referente ' + (targetName || targetHash.slice(0,8)),
      content: b64EncodeUtf8(newContent),
      sha: fileData.sha
    })
  });
  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({}));
    throw new Error('Push falló: ' + (errData.message || putRes.status));
  }
  return { removed: true };
}

/* ─── Admin Registry Encryption (AES-GCM + PBKDF2) ─── */
async function _adminDeriveKey(adminCode) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(adminCode), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('lla-rn-registry-salt-v1'), iterations: 100000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function _adminEncryptRegistry(adminCode, registry) {
  const key = await _adminDeriveKey(adminCode);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(registry));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const buf = new Uint8Array(12 + enc.byteLength);
  buf.set(iv); buf.set(new Uint8Array(enc), 12);
  return btoa(String.fromCharCode(...buf));
}
async function _adminDecryptRegistry(adminCode, b64) {
  const key = await _adminDeriveKey(adminCode);
  const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
  return JSON.parse(new TextDecoder().decode(dec));
}
async function syncAdminRegistry() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') return;
  const token = getGitHubPAT();
  if (!token) return;
  const adminCode = registryGet(CURRENT_USER.name)?.code;
  if (!adminCode) return;
  try {
    const encrypted = await _adminEncryptRegistry(adminCode, { registry: getRegistry(), pat: getGitHubPAT() });
    const apiUrl = `https://api.github.com/repos/${GH_REPO}/contents/${GH_USERS_PATH}`;
    const headers = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const getRes = await fetch(apiUrl, { headers });
    if (!getRes.ok) return;
    const fileData = await getRes.json();
    const current = JSON.parse(b64DecodeUtf8(fileData.content));
    if (!current.adminData) current.adminData = {};
    current.adminData[CURRENT_USER.hash] = encrypted;
    current.updatedAt = new Date().toISOString();
    await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'admin: sync registry', content: b64EncodeUtf8(JSON.stringify(current, null, 2) + '\n'), sha: fileData.sha })
    });
  } catch (e) { console.warn('syncAdminRegistry:', e.message); }
}

const AUTH_KEY = 'lla_auth_v1';
const AUTH_TTL_DAYS = 30;
let CURRENT_USER = null;

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/[ ​‌‍﻿\s]+/g, '')
    .replace(/[^A-Z0-9\-]/g, '');
}

async function sha256(str) {
  const normalized = normalizeCode(str);
  const buf = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function tryAuthenticate(code) {
  await usersReady; // esperar fetch de users.json
  const h = await sha256(code);
  const user = AUTHORIZED_USERS.find(u => u.hash === h) || null;
  // Si es admin, auto-registramos su propio código en el registry local
  // para que pueda verlo en el panel admin
  if (user && user.role === 'admin') {
    const adminCode = code.trim().toUpperCase();
    try { registrySet(user.name, { code: adminCode, role: 'admin', addedAt: Date.now() }); } catch {}
    // Desencriptar el registry remoto y mergearlo al localStorage
    const remoteBlob = (window._remoteAdminData || {})[user.hash];
    if (remoteBlob) {
      try {
        const decrypted = await _adminDecryptRegistry(adminCode, remoteBlob);
        const remoteReg = decrypted.registry || decrypted;
        const localReg = getRegistry();
        for (const [n, d] of Object.entries(remoteReg)) {
          if (!localReg[n] || (d.addedAt || 0) > (localReg[n].addedAt || 0)) localReg[n] = d;
        }
        setRegistry(localReg);
        if (decrypted.pat && !getGitHubPAT()) setGitHubPAT(decrypted.pat);
      } catch (e) { /* blob de otro dispositivo no compatible, ignorar */ }
    }
  }
  return user;
}

function persistAuth(user, keep) {
  const expiresAt = Date.now() + (keep ? AUTH_TTL_DAYS : 1) * 24 * 3600 * 1000;
  const storage = keep ? localStorage : sessionStorage;
  storage.setItem(AUTH_KEY, JSON.stringify({ name: user.name, expiresAt }));
}

function readPersistedAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.expiresAt && Date.now() > data.expiresAt) {
      localStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(AUTH_KEY);
      return null;
    }
    return AUTHORIZED_USERS.find(u => u.name === data.name) || null;
  } catch { return null; }
}

function showApp(user) {
  CURRENT_USER = user;
  const gate = document.getElementById('loginGate');
  gate.style.transition = 'opacity 0.3s';
  gate.style.opacity = '0';
  setTimeout(() => { gate.style.display = 'none'; }, 300);
  // Pintar el chip de usuario en el topbar
  const chip = document.getElementById('userChip');
  const chipName = document.getElementById('userChipName');
  const chipAvatar = document.getElementById('userChipAvatar');
  if (chip && chipName) {
    chipName.textContent = user.name;
    chipAvatar.textContent = user.name.charAt(0).toUpperCase();
  }
  // Botón admin solo visible si es admin
  if (user.role === 'admin') {
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) adminBtn.classList.add('visible');
  }
  // Registrar evento de login en actividad local
  logActivity('login', { user: user.name });
  // Activar magnetic buttons en el topbar (solo desktop)
  setTimeout(bindMagneticButtons, 500);
  // Re-validación periódica de sesión: si el referente fue removido del repo,
  // cerrar su sesión automáticamente en máximo 2 minutos
  startSessionRevalidation();
  // Bottom nav (mobile)
  document.body.classList.add('has-bottom-nav');
  refreshBottomNavAdminVisibility();
  refreshDraftsBtnCount();
  // Inicializar modo
  if (typeof switchMode === 'function') switchMode(currentMode || 'membrete');
}

/* ════════════════════════════════════════════════════════════════
   PANEL ADMIN — Phase 1 (client-side)
   ════════════════════════════════════════════════════════════════ */
const ACTIVITY_KEY = 'lla_activity_log';
const ACTIVITY_MAX = 200;

function logActivity(action, meta) {
  const entry = {
    action,
    ts: Date.now(),
    user: (CURRENT_USER && CURRENT_USER.name) || 'desconocido',
    ...(meta || {})
  };
  try {
    const log = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]');
    log.push(entry);
    while (log.length > ACTIVITY_MAX) log.shift();
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
  } catch (e) { console.warn('No se pudo loggear actividad:', e); }

  // ─── Sync a Google Sheets si está configurado ───
  // La URL del Apps Script Web App vive en users.json (config compartida)
  // o en localStorage si todavía no fue centralizada
  syncActivityToSheet(entry).catch(() => {});
}

// URL del Apps Script Web App (Google Sheets webhook)
function getSheetWebhookUrl() {
  // Prioridad: config compartida (users.json) → localStorage local
  if (window._sharedConfig && window._sharedConfig.sheetUrl) return window._sharedConfig.sheetUrl;
  return localStorage.getItem('lla_sheet_url_v1') || '';
}

// URL "humana" del Sheet (abrir el log en el navegador, solo admins)
// Prioridad: config compartida (users.json) → fallback hardcodeado
const SHEET_VIEW_URL_FALLBACK = 'https://docs.google.com/spreadsheets/d/11SCMapEmlRWtyMSgOxXTViZj4O8kT-zJ2rYJ87IM2Hk/edit#gid=0';
function getSheetViewUrl() {
  if (window._sharedConfig && window._sharedConfig.sheetViewUrl) return window._sharedConfig.sheetViewUrl;
  return SHEET_VIEW_URL_FALLBACK;
}

async function syncActivityToSheet(entry) {
  const url = getSheetWebhookUrl();
  if (!url) return;
  try {
    // Apps Script no devuelve CORS headers, así que usamos 'no-cors' (silent fire-and-forget)
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' }, // text/plain evita preflight
      body: JSON.stringify(entry)
    });
  } catch (e) { /* silencioso */ }
}

function getActivityLog() {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]'); }
  catch { return []; }
}

function openAdminDrawer() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') return;
  document.getElementById('adminDrawer').classList.add('open');
  const bd = document.getElementById('adminBackdrop');
  if (bd) bd.classList.add('open');
  renderAdminUsers();
  renderAdminActivity();
  renderAdminInfo();
  refreshAdminHeaderStats();
  // Re-verificar status de los que quedaron pendientes
  resumePendingStatusChecks();
}

function resumePendingStatusChecks() {
  const all = getPublishStatus();
  Object.entries(all).forEach(([hash, info]) => {
    if (info.status === 'pushed' || info.status === 'publishing' || info.status === 'pushed_pending') {
      pollUntilLive(hash, info.name, 15); // 15 intentos × 4s = 1 min
    }
  });
}

function closeAdminDrawer() {
  document.getElementById('adminDrawer').classList.remove('open');
  const bd = document.getElementById('adminBackdrop');
  if (bd) bd.classList.remove('open');
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.admin-pane').forEach(p => p.classList.remove('active'));
  const pane = document.getElementById('pane' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (pane) pane.classList.add('active');
  if (tab === 'actividad') renderAdminActivity();
  if (tab === 'usuarios') renderAdminUsers();
  if (tab === 'mantenimiento') { renderAdminInfo(); adminRefreshGhPatStatus(); adminRefreshSheetStatus(); }
}

/* ─── TAB: USUARIOS ─── */
const REGISTRY_KEY = 'lla_admin_registry_v1';
const PUBLISH_STATUS_KEY = 'lla_publish_status_v1'; // { hashShort: {status, ts, name} }

// Status posibles: 'local' | 'publishing' | 'pushed' | 'live' | 'error'
function getPublishStatus() {
  try { return JSON.parse(localStorage.getItem(PUBLISH_STATUS_KEY) || '{}'); }
  catch { return {}; }
}
function setPublishStatus(hash, data) {
  const all = getPublishStatus();
  all[hash] = { ...all[hash], ...data, ts: Date.now() };
  try { localStorage.setItem(PUBLISH_STATUS_KEY, JSON.stringify(all)); }
  catch {}
}
function userStatus(user) {
  // Si el user es admin o estaba en la lista original (Josias/Luis) → 'live' por default
  const all = getPublishStatus();
  const tracked = all[user.hash];
  if (tracked) return tracked;
  return { status: 'live', name: user.name };
}

// Poll: verifica cada N segundos hasta que el hash YA NO esté en users.json (eliminado)
async function pollUntilGone(hash, name, maxTries = 30) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await fetch('users.json?ts=' + Date.now() + '&r=' + Math.random(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.users && !data.users.some(u => u.hash === hash)) {
          if (typeof showToast === 'function') {
            showToast('🔒 ' + name + ' ya no puede entrar (revocado online)', 'success', 4000);
          }
          return true;
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 4000));
  }
  return false;
}

// Poll: verifica cada N segundos si el hash aparece en el users.json live de GitHub Pages
async function pollUntilLive(hash, name, maxTries = 30) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await fetch('users.json?ts=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.users && data.users.some(u => u.hash === hash)) {
          setPublishStatus(hash, { status: 'live', name });
          // Re-render si el panel está abierto
          if (document.getElementById('adminDrawer')?.classList.contains('open')) {
            renderAdminUsers();
          }
          if (typeof showToast === 'function') {
            showToast('✓ ' + name + ' ya puede entrar', 'success', 4000);
          }
          return true;
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 4000));
  }
  // No apareció después de N intentos → marcar como pushed (no live aún)
  setPublishStatus(hash, { status: 'pushed_pending', name });
  if (document.getElementById('adminDrawer')?.classList.contains('open')) renderAdminUsers();
  return false;
}
let adminDirty = false;
let codeVisibility = {}; // { 'Josias Amaya': true|false } controla ocultar/mostrar código

function getRegistry() {
  try { return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}'); }
  catch { return {}; }
}
function setRegistry(r) {
  try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(r)); }
  catch (e) { console.warn('Registry save fail:', e); }
}
function registrySet(name, data) {
  const r = getRegistry();
  r[name] = { ...(r[name] || {}), ...data };
  setRegistry(r);
}
function registryRemove(name) {
  const r = getRegistry();
  delete r[name];
  setRegistry(r);
}
function registryGet(name) {
  return getRegistry()[name];
}

function markDirty() {
  adminDirty = true;
  const banner = document.getElementById('adminDirtyBanner');
  if (banner) banner.classList.add('show');
}

// ─── Instrucciones de setup del Google Sheets ───
function adminShowSheetSetup(e) {
  if (e) e.preventDefault();
  const script = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSheet();
    // Cabecera si la hoja está vacía
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Fecha', 'Usuario', 'Acción', 'Ciudad', 'Título', 'Extra']);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#371959').setFontColor('#ffffff');
    }
    var ts = data.ts ? new Date(data.ts) : new Date();
    var extra = Object.keys(data)
      .filter(function(k) { return ['action','ts','user','city','titulo'].indexOf(k) === -1; })
      .map(function(k) { return k + '=' + data[k]; })
      .join(' | ');
    sheet.appendRow([ts, data.user || '', data.action || '', data.city || '', data.titulo || '', extra]);
    return ContentService.createTextOutput(JSON.stringify({ok:true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error:err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;
  const escScript = script.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const html = `
    <div style="max-width:680px;line-height:1.7;font-size:13px;color:rgba(255,255,255,0.85)">
      <h3 style="color:#fcd34d;margin-bottom:14px;font-size:16px">📋 Setup Google Sheets (5 min)</h3>

      <ol style="padding-left:20px;display:flex;flex-direction:column;gap:14px">
        <li><strong>Crear Google Sheet</strong><br>
          Andá a <a href="https://sheets.new" target="_blank" rel="noopener" style="color:#a66dd4">sheets.new</a> → ponele un nombre (ej: "LLA Actividad").<br>
          <strong style="color:#fcd34d">Compartilo solo con las personas que quieras</strong> (botón Compartir arriba a la derecha).
        </li>

        <li><strong>Abrir Apps Script</strong><br>
          En el Sheet, menú <strong>Extensiones → Apps Script</strong>.
        </li>

        <li><strong>Pegar el script</strong><br>
          Borrá lo que está y pegá esto:<br>
          <button onclick="navigator.clipboard.writeText(document.getElementById('appsScriptCode').textContent); this.textContent='✓ Copiado'" style="margin:6px 0;padding:4px 10px;background:rgba(166,109,212,0.2);border:1px solid rgba(166,109,212,0.5);color:#d4b3f0;border-radius:6px;cursor:pointer;font-size:11px">📋 Copiar código</button>
          <pre id="appsScriptCode" style="background:#08040f;padding:12px;border-radius:8px;font-size:10px;overflow-x:auto;border:1px solid rgba(166,109,212,0.3);max-height:200px;color:#d4c5ee">${escScript}</pre>
        </li>

        <li><strong>Guardar y desplegar</strong><br>
          Click en el ícono 💾 (Guardar) → después <strong>Implementar → Nueva implementación</strong>.<br>
          • Tipo: <strong>Aplicación web</strong><br>
          • Ejecutar como: <strong>Yo (tu cuenta)</strong><br>
          • Acceso: <strong>Cualquier usuario</strong> (no te asustes, la URL es secreta)<br>
          Click <strong>Implementar</strong> → autorizá los permisos cuando te pida.
        </li>

        <li><strong>Copiar la URL</strong><br>
          Al final te da una URL tipo <code style="font-size:10px">https://script.google.com/macros/s/AKfy.../exec</code><br>
          Copiala y pegala en el campo de arriba → <strong>Guardar y publicar</strong>.
        </li>

        <li><strong>Test</strong><br>
          Click en <strong>Test ping</strong>. En tu Sheet debería aparecer una fila nueva en ~3 seg con la acción "test".<br>
          A partir de ahí, <strong>cada acción de cualquier referente se sincroniza automáticamente</strong>.
        </li>
      </ol>

      <div style="margin-top:20px;padding:14px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:10px;color:#86efac;font-size:12px">
        💡 <strong>Privacidad:</strong> el Sheet solo lo ven las personas con las que vos lo compartiste. Nadie más (ni los referentes ni nosotros) tiene acceso. La URL del script no expone los datos — solo recibe escrituras.
      </div>
    </div>
  `;
  showAdminModal('Setup Google Sheets', html);
}

// Modal genérico para mostrar contenido HTML en admin
function showAdminModal(title, htmlContent) {
  let modal = document.getElementById('adminGenericModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'adminGenericModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:500;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:20px';
    modal.onclick = function(e) { if (e.target === modal) modal.style.display = 'none'; };
    modal.innerHTML = '<div style="background:linear-gradient(180deg,#1a0d35,#0e0720);border:1px solid rgba(252,211,77,0.3);border-radius:14px;padding:28px;max-width:90vw;max-height:90vh;overflow-y:auto;position:relative"><button id="adminGenericModalClose" style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);width:32px;height:32px;border-radius:8px;color:#fff;font-size:18px;cursor:pointer">×</button><div id="adminGenericModalBody"></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#adminGenericModalClose').onclick = function() { modal.style.display = 'none'; };
  }
  modal.querySelector('#adminGenericModalBody').innerHTML = htmlContent;
  modal.style.display = 'flex';
}

// ─── EXPORT CSV de actividad ───
function adminDownloadCSV() {
  const log = getActivityLog();
  if (!log.length) {
    showToast('No hay actividad para exportar todavía', 'info', 3000);
    return;
  }
  // Headers
  const headers = ['fecha_hora', 'usuario', 'accion', 'ciudad', 'titulo', 'extra'];
  const rows = log.map(e => {
    const d = new Date(e.ts);
    const fecha = d.toISOString().replace('T',' ').slice(0,19);
    const extra = Object.entries(e)
      .filter(([k]) => !['action','ts','user','city','titulo'].includes(k))
      .map(([k,v]) => k+'='+v)
      .join(' | ');
    return [
      fecha,
      e.user || '',
      e.action || '',
      e.city || '',
      e.titulo || '',
      extra
    ];
  });
  // CSV escape
  const csvEscape = v => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const csv = '﻿' + // BOM para que Excel detecte UTF-8
    headers.join(',') + '\n' +
    rows.map(r => r.map(csvEscape).join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const today = new Date().toISOString().slice(0,10);
  a.download = 'lla-actividad-' + today + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('✓ ' + log.length + ' registros exportados a CSV', 'success', 3000);
}

// ─── Google Sheets webhook (Apps Script) ───
async function adminSaveSheetUrl() {
  const input = document.getElementById('adminSheetUrl');
  const status = document.getElementById('adminSheetStatus');
  const url = input.value.trim();
  if (!url) {
    status.innerHTML = '<span style="color:#fca5a5">⚠ Pegá la URL del Apps Script primero</span>';
    return;
  }
  if (!url.startsWith('https://script.google.com/')) {
    status.innerHTML = '<span style="color:#fca5a5">⚠ No parece una URL de Apps Script (debe empezar con <code>https://script.google.com/</code>)</span>';
    return;
  }
  // Guardar localmente primero (fallback)
  localStorage.setItem('lla_sheet_url_v1', url);
  // Y subirla a users.json en GitHub para que todos los referentes la usen
  const token = getGitHubPAT();
  if (!token) {
    status.innerHTML = '<span style="color:#fcd34d">✓ Guardada localmente, pero sin PAT no se puede compartir con el resto de los referentes.</span>';
    if (window._sharedConfig) window._sharedConfig.sheetUrl = url;
    return;
  }
  try {
    status.innerHTML = '<span style="color:#c7d2fe">⏳ Publicando configuración en GitHub…</span>';
    await ghUpdateSharedConfig({ sheetUrl: url });
    if (window._sharedConfig) window._sharedConfig.sheetUrl = url;
    status.innerHTML = '<span style="color:#86efac">✓ URL guardada y publicada. Toda la actividad de los referentes va a empezar a sincronizar al Sheet automáticamente.</span>';
  } catch (e) {
    status.innerHTML = '<span style="color:#fca5a5">✗ ' + escapeHtml(e.message) + '</span>';
  }
}

async function adminTestSheetUrl() {
  const status = document.getElementById('adminSheetStatus');
  const url = (document.getElementById('adminSheetUrl').value.trim()) || getSheetWebhookUrl();
  if (!url) {
    status.innerHTML = '<span style="color:#fca5a5">⚠ Pegá una URL primero</span>';
    return;
  }
  status.innerHTML = '<span style="color:#c7d2fe">⏳ Enviando registro de prueba al Sheet…</span>';
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'test',
        ts: Date.now(),
        user: (CURRENT_USER && CURRENT_USER.name) || 'admin_test',
        note: 'Test desde panel admin'
      })
    });
    status.innerHTML = '<span style="color:#86efac">✓ Enviado. Revisá tu Google Sheet — debería aparecer una fila nueva (puede tardar 2-3 seg).</span>';
  } catch (e) {
    status.innerHTML = '<span style="color:#fca5a5">✗ ' + escapeHtml(e.message) + '</span>';
  }
}

async function adminSyncAllActivity() {
  const url = getSheetWebhookUrl();
  if (!url) {
    showToast('Configurá primero la URL del Sheet en Mantenimiento → Google Sheets', 'error', 4000);
    return;
  }
  const log = getActivityLog();
  if (!log.length) {
    showToast('No hay actividad local para sincronizar', 'info', 3000);
    return;
  }
  if (!confirm('¿Enviar ' + log.length + ' registros locales al Sheet? Pueden generar duplicados si ya los sincronizaste antes.')) return;
  showToast('⏳ Enviando ' + log.length + ' registros al Sheet…', 'info', 3000);
  let ok = 0;
  for (const entry of log) {
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(entry)
      });
      ok++;
      await new Promise(r => setTimeout(r, 80)); // throttle para no saturar
    } catch {}
  }
  showToast('✓ ' + ok + ' registros enviados al Sheet', 'success', 4000);
}

// Helper: actualizar el users.json en GitHub con campos adicionales (sheetUrl, etc)
async function ghUpdateSharedConfig(patch) {
  const token = getGitHubPAT();
  if (!token) throw new Error('Falta el PAT de GitHub');
  const apiUrl = `https://api.github.com/repos/${GH_REPO}/contents/${GH_USERS_PATH}`;
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  const getRes = await fetch(apiUrl, { headers });
  if (!getRes.ok) throw new Error('No se pudo leer users.json (' + getRes.status + ')');
  const fileData = await getRes.json();
  const current = JSON.parse(b64DecodeUtf8(fileData.content));
  Object.assign(current, patch);
  current.updatedAt = new Date().toISOString();
  const newContent = JSON.stringify(current, null, 2) + '\n';
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'admin: actualizar config compartida (' + Object.keys(patch).join(',') + ')',
      content: b64EncodeUtf8(newContent),
      sha: fileData.sha
    })
  });
  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({}));
    throw new Error(errData.message || 'Push falló (' + putRes.status + ')');
  }
  return true;
}

// ─── Helpers de Activity ───
function last14DaysCounts(events) {
  const counts = new Array(14).fill(0);
  const now = Date.now();
  events.forEach(e => {
    const diffDays = Math.floor((now - e.ts) / (24*3600*1000));
    if (diffDays >= 0 && diffDays < 14) counts[13 - diffDays]++;
  });
  return counts;
}

function renderSparkline(elId, data, color) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!data.length) { el.innerHTML = ''; return; }
  const max = Math.max(1, ...data);
  const w = 200, h = 28;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = h - (v / max) * h;
    return x + ',' + y.toFixed(1);
  }).join(' ');
  // Área debajo de la línea
  const area = '0,' + h + ' ' + points + ' ' + w + ',' + h;
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polygon points="${area}" fill="${color}" opacity="0.18"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  </svg>`;
}

function refreshAdminHeaderStats(totalExports, todayExports) {
  const usersEl = document.getElementById('hdrStatUsers');
  const expEl = document.getElementById('hdrStatExports');
  const hoyEl = document.getElementById('hdrStatHoy');
  if (usersEl) usersEl.textContent = AUTHORIZED_USERS.length;
  if (expEl) expEl.textContent = totalExports != null ? totalExports : (getActivityLog().filter(e => e.action && e.action.startsWith('export_')).length);
  if (hoyEl) {
    if (todayExports != null) hoyEl.textContent = todayExports;
    else {
      const today = new Date().toDateString();
      hoyEl.textContent = getActivityLog().filter(e => e.action && e.action.startsWith('export_') && new Date(e.ts).toDateString() === today).length;
    }
  }
}

let _adminUserFilter = 'all';
function adminSetFilter(f) {
  _adminUserFilter = f;
  document.querySelectorAll('.admin-filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === f);
  });
  renderAdminUsers();
}

function renderAdminUsers() {
  const list = document.getElementById('adminUsersList');
  const count = document.getElementById('adminUserCount');
  if (!list) return;
  // Skeleton mientras se descarga users.json desde GitHub
  if (_usersLoading) {
    count.textContent = '…';
    list.innerHTML = Array.from({ length: 4 }, () =>
      '<div class="admin-user-card skeleton-card">' +
        '<div class="skel-avatar"></div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="skel-line" style="width:60%"></div>' +
          '<div class="skel-line skel-line-sm" style="width:35%;margin-top:8px;"></div>' +
          '<div class="skel-line skel-line-sm" style="width:80%;margin-top:6px;"></div>' +
        '</div>' +
      '</div>'
    ).join('');
    return;
  }
  count.textContent = AUTHORIZED_USERS.length;
  const registry = getRegistry();

  // Aplicar búsqueda + filtro
  const searchEl = document.getElementById('adminUserSearch');
  const q = (searchEl ? searchEl.value : '').trim().toLowerCase();
  let filtered = AUTHORIZED_USERS.slice();
  if (q) filtered = filtered.filter(u => u.name.toLowerCase().includes(q));
  if (_adminUserFilter === 'admin') filtered = filtered.filter(u => u.role === 'admin');
  else if (_adminUserFilter === 'active') {
    filtered = filtered.filter(u => {
      const st = userStatus(u);
      return st.status === 'live';
    });
  } else if (_adminUserFilter === 'pending') {
    filtered = filtered.filter(u => {
      const st = userStatus(u);
      return st.status === 'publishing' || st.status === 'pushed' || st.status === 'pushed_pending' || st.status === 'local' || st.status === 'error';
    });
  }

  if (!filtered.length) {
    list.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:rgba(255,255,255,0.4);font-size:12px;font-style:italic">Sin resultados con ese criterio.</div>';
    return;
  }

  list.innerHTML = filtered.map((u, idx) => {
    const isAdmin = u.role === 'admin';
    const isSelf = CURRENT_USER && u.name === CURRENT_USER.name;
    const initial = u.name.charAt(0).toUpperCase();
    const hashShort = u.hash.substring(0, 12);
    const reg = registry[u.name];
    const hasCode = reg && reg.code;
    const isVisible = codeVisibility[u.name] === true;
    const nameEsc = u.name.replace(/'/g, "\\'");

    let codeBlock;
    if (hasCode) {
      codeBlock = `<div class="admin-user-code-area ${isVisible?'':'hidden-code'}">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${isVisible ? reg.code : '•••••••••••••••'}</span>
        <div class="admin-user-code-actions">
          <button class="admin-icon-btn" title="${isVisible?'Ocultar':'Mostrar'} código" onclick="toggleCodeVisibility('${nameEsc}')">${isVisible?'🙈':'👁'}</button>
          <button class="admin-icon-btn" title="Copiar código" onclick="copyToClipboard('${reg.code}', this)">📋</button>
        </div>
      </div>`;
    } else {
      codeBlock = `<div class="admin-user-code-area empty">
        <span>Código no registrado en este dispositivo</span>
        <button class="admin-icon-btn gold" title="Registrar código manualmente" onclick="adminRegisterCode('${nameEsc}')">+</button>
      </div>`;
    }

    const adminToggleLabel = isAdmin ? '👤 Quitar admin' : '👑 Hacer admin';
    const adminToggleClass = isAdmin ? '' : 'gold';

    const st = userStatus(u);
    const statusChip = renderStatusChip(st);

    return `<div class="admin-user-card ${isAdmin?'is-admin':''} ${isSelf?'is-self':''}">
      <div class="admin-user-top">
        <div class="admin-user-avatar">${initial}</div>
        <div style="flex:1;min-width:0">
          <div class="admin-user-name" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span>${u.name}</span>
            ${isSelf?'<span style="font-size:9px;color:rgba(166,109,212,0.8);font-weight:600">(vos)</span>':''}
            ${statusChip}
          </div>
          <div class="admin-user-hash">${hashShort}...</div>
        </div>
        ${isAdmin?'<span class="admin-user-role">Admin</span>':''}
      </div>
      ${codeBlock}
      <div class="admin-user-actions">
        <button class="admin-action-pill ${adminToggleClass}" onclick="adminToggleRole('${nameEsc}')" ${isSelf?'disabled title="No podés quitarte el rol de admin a vos mismo" style="opacity:0.4;cursor:not-allowed"':''}>${adminToggleLabel}</button>
        <button class="admin-action-pill" onclick="adminRegenCode('${nameEsc}')">🔄 Regenerar</button>
        <button class="admin-action-pill danger" onclick="adminRemoveUser('${nameEsc}')" ${isSelf?'disabled title="No podés eliminarte a vos mismo" style="opacity:0.4;cursor:not-allowed"':''}>🗑 Quitar acceso</button>
      </div>
    </div>`;
  }).join('');
  applyStagger(list, { delay: 35, max: 20 });
}

function renderStatusChip(st) {
  if (!st) return '';
  const map = {
    'live':     { label: 'Activo',       cls: 'live',    icon: 'check' },
    'publishing': { label: 'Publicando', cls: 'publishing', icon: 'spinner' },
    'pushed':   { label: 'Esperando',    cls: 'pushed',  icon: 'spinner' },
    'pushed_pending': { label: 'Demorado', cls: 'pushed', icon: 'clock' },
    'local':    { label: 'Solo local',   cls: 'local',   icon: 'warning' },
    'error':    { label: 'Error',        cls: 'error',   icon: 'x' }
  };
  const cfg = map[st.status] || map.live;
  const iconSvg = {
    check:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    spinner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" class="chip-spin"/></svg>',
    clock:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    x:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  };
  return `<span class="user-status-chip user-status-${cfg.cls}" title="${cfg.label}">${iconSvg[cfg.icon]}<span>${cfg.label}</span></span>`;
}

function toggleCodeVisibility(name) {
  codeVisibility[name] = !codeVisibility[name];
  renderAdminUsers();
}

async function adminRegisterCode(name) {
  const code = prompt('Ingresá el código de acceso de ' + name + ' (formato LLA-NOMBRE-XXXXXX):');
  if (!code) return;
  const codeClean = code.trim().toUpperCase();
  const hash = await sha256(codeClean);
  const user = AUTHORIZED_USERS.find(u => u.name === name);
  if (!user) { showToast('Usuario no encontrado', 'error'); return; }
  if (user.hash !== hash) {
    showToast('El código no coincide con el hash registrado', 'error', 5000);
    return;
  }
  registrySet(name, { code: codeClean, addedAt: Date.now(), source: 'manual' });
  codeVisibility[name] = true;
  renderAdminUsers();
  showToast('✓ Código de ' + name + ' registrado correctamente', 'success');
}

function adminToggleRole(name) {
  const user = AUTHORIZED_USERS.find(u => u.name === name);
  if (!user) return;
  if (user.role === 'admin') {
    // Bloquear si es el último admin
    const otherAdmins = AUTHORIZED_USERS.filter(u => u.role === 'admin' && u.name !== name).length;
    if (otherAdmins === 0) {
      showToast('No se puede quitar el último admin', 'error', 5000);
      return;
    }
    delete user.role;
    showToast('👤 ' + name + ' ya no es admin', 'info');
  } else {
    user.role = 'admin';
    showToast('👑 ' + name + ' ahora es admin', 'success');
  }
  // Actualizar registry también
  const reg = registryGet(name);
  if (reg) registrySet(name, { ...reg, role: user.role });
  markDirty();
  renderAdminUsers();
}

async function adminRegenCode(name) {
  const user = AUTHORIZED_USERS.find(u => u.name === name);
  if (!user) return;
  const hasPAT = !!getGitHubPAT();
  const warn = hasPAT
    ? '¿Generar un nuevo código para ' + name + '?\n\nSe va a publicar en GitHub. El código anterior dejará de funcionar en ~30 seg.'
    : '⚠ Sin PAT configurado: el nuevo código solo va a funcionar localmente. El anterior seguirá vigente online.\n\n¿Continuar igualmente?';
  if (!confirm(warn)) return;

  const oldHash = user.hash;
  const primer = name.split(/\s+/)[0].toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ]/g, '');
  const newCode = 'LLA-' + primer + '-' + randomSuffix(6);
  const newHash = await sha256(newCode);
  user.hash = newHash;
  registrySet(name, { code: newCode, role: user.role, addedAt: Date.now(), source: 'regen' });
  codeVisibility[name] = true;
  if (hasPAT) {
    setPublishStatus(newHash, { status: 'publishing', name });
    // Limpiar el status del hash viejo
    const all = getPublishStatus();
    delete all[oldHash];
    try { localStorage.setItem(PUBLISH_STATUS_KEY, JSON.stringify(all)); } catch {}
  }
  renderAdminUsers();
  // Copiar el nuevo código al clipboard automáticamente
  try { await navigator.clipboard.writeText(newCode); } catch {}

  if (hasPAT) {
    showToast('⏳ Actualizando en GitHub…', 'info', 2500);
    try {
      // Quitar el hash viejo y agregar el nuevo (operación atómica vía un solo commit sería ideal,
      // pero hacemos remove + add — dos commits — para no duplicar la lógica de la API)
      await ghRemoveUser({ hash: oldHash, name });
      await ghPushUser({ name, hash: newHash });
      setPublishStatus(newHash, { status: 'pushed', name });
      renderAdminUsers();
      showToast('🔄 Nuevo código generado y publicado. Copiado al portapapeles.', 'success', 5000);
      pollUntilLive(newHash, name);
      syncAdminRegistry();
    } catch (e) {
      setPublishStatus(newHash, { status: 'error', name, error: e.message });
      renderAdminUsers();
      showToast('✗ Error al publicar el nuevo código: ' + e.message, 'error', 5000);
    }
  } else {
    showToast('🔄 Nuevo código generado y copiado (solo local — el anterior sigue activo online)', 'info', 5000);
  }
}

async function adminRemoveUser(name) {
  const user = AUTHORIZED_USERS.find(u => u.name === name);
  if (!user) return;
  const hasPAT = !!getGitHubPAT();
  const warn = hasPAT
    ? '¿Quitar acceso a ' + name + '?\n\nSe va a publicar el cambio en GitHub. En ~30 seg dejará de poder entrar.'
    : '⚠ ATENCIÓN: NO tenés configurado el PAT de GitHub.\n\nSi quitás a ' + name + ' ahora, solo se va a eliminar de la lista LOCAL pero su código seguirá funcionando online.\n\nMejor configurá el PAT primero en Mantenimiento → GitHub.\n\n¿Continuar igualmente (solo borrado local)?';
  if (!confirm(warn)) return;

  const targetHash = user.hash;

  // 1. Quitar de memoria + registry local
  const idx = AUTHORIZED_USERS.findIndex(u => u.name === name);
  if (idx !== -1) AUTHORIZED_USERS.splice(idx, 1);
  registryRemove(name);
  delete codeVisibility[name];

  // 2. Marcar status como "removing" mientras hacemos el push
  if (hasPAT) {
    setPublishStatus(targetHash, { status: 'publishing', name, action: 'remove' });
  }
  renderAdminUsers();

  // 3. Push a GitHub si hay PAT
  if (hasPAT) {
    showToast('⏳ Quitando a ' + name + ' del repo…', 'info', 3000);
    try {
      const result = await ghRemoveUser({ hash: targetHash, name });
      if (result.notFound) {
        showToast('✓ ' + name + ' eliminado (no estaba en el repo)', 'success', 3500);
      } else {
        showToast('✓ ' + name + ' eliminado del repo. En ~30 seg deja de poder entrar.', 'success', 4500);
        // Confirmar la baja: poll hasta que NO aparezca más en users.json
        pollUntilGone(targetHash, name);
      }
      // Limpiar el status guardado (ya no existe el usuario)
      const all = getPublishStatus();
      delete all[targetHash];
      try { localStorage.setItem(PUBLISH_STATUS_KEY, JSON.stringify(all)); } catch {}
      syncAdminRegistry();
    } catch (e) {
      showToast('✗ Error al quitar de GitHub: ' + e.message, 'error', 5000);
      // Re-agregar localmente para que se vea que no se eliminó realmente
      AUTHORIZED_USERS.push(user);
      setPublishStatus(targetHash, { status: 'error', name, error: e.message });
      renderAdminUsers();
    }
  } else {
    showToast('🗑 ' + name + ' eliminado solo localmente (sin PAT no se pudo quitar de GitHub)', 'info', 5000);
  }
}

function adminCopyFullSnippet() {
  const lines = AUTHORIZED_USERS.map(u => {
    const role = u.role ? `, role: '${u.role}'` : '';
    return `  { name: '${u.name.replace(/'/g, "\\'")}', hash: '${u.hash}'${role} }`;
  });
  const snippet = 'const AUTHORIZED_USERS = [\n' + lines.join(',\n') + '\n];';
  navigator.clipboard.writeText(snippet).then(() => {
    showToast('✓ Snippet completo copiado — pegálo en index.html', 'success', 4500);
  }).catch(() => {
    // Fallback: mostrar en modal
    alert('Copiá manualmente:\n\n' + snippet);
  });
}

function randomSuffix(n) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function adminGenerateCode() {
  const name = document.getElementById('adminNewName').value.trim();
  let code = document.getElementById('adminNewCustomCode').value.trim().toUpperCase();
  const out = document.getElementById('adminGenOutput');
  if (!name) {
    out.innerHTML = '<div class="admin-output" style="border-color:rgba(248,113,113,0.4);color:#fca5a5">⚠ Ingresá el nombre del referente</div>';
    return;
  }
  // Validar duplicado
  if (AUTHORIZED_USERS.some(u => u.name.toLowerCase() === name.toLowerCase())) {
    out.innerHTML = '<div class="admin-output" style="border-color:rgba(248,113,113,0.4);color:#fca5a5">⚠ Ya existe un referente con ese nombre</div>';
    return;
  }
  if (!code) {
    const primer = name.split(/\s+/)[0].toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ]/g, '');
    code = 'LLA-' + primer + '-' + randomSuffix(6);
  }
  const hash = await sha256(code);
  const userObj = { name, hash };
  // Agregar a memoria + registry
  AUTHORIZED_USERS.push(userObj);
  registrySet(name, { code, addedAt: Date.now(), source: 'admin_panel' });
  codeVisibility[name] = true;
  // Estado inicial: local (todavía no se sabe si va a haber push)
  const willPush = !!getGitHubPAT();
  setPublishStatus(hash, { status: willPush ? 'publishing' : 'local', name });
  renderAdminUsers();
  // Limpiar inputs
  document.getElementById('adminNewName').value = '';
  document.getElementById('adminNewCustomCode').value = '';

  const msgWA = `Hola ${name.split(' ')[0]}, te paso tu código de acceso a la Herramienta Partidaria LLA:\n\n🔐 ${code}\n\nAcceso: ${location.origin}${location.pathname === '/' ? '' : location.pathname}\n\nCada código es personal e intransferible — el uso queda registrado. Guardalo en lugar seguro y no lo compartas.`;
  const escMsgWA = msgWA.replace(/`/g,'\\`').replace(/\$/g,'\\$');

  // Render preliminar con el código + estado "pushing"
  const hasPAT = !!getGitHubPAT();
  out.innerHTML = `
    <div class="admin-output" style="border-color:rgba(34,197,94,0.4)">
      <strong style="color:#86efac">✓ ${name} — código generado</strong><br><br>
      <strong>Código (mandar al referente):</strong><br>
      <span style="font-family:monospace;font-size:14px;color:#fcd34d">${code}</span>
      <button class="admin-btn-ghost" style="margin-top:6px" onclick="copyToClipboard('${code}', this)">📋 Copiar código</button>
    </div>
    <div id="adminPushStatus" style="margin-top:10px;padding:10px 12px;border-radius:8px;font-size:11px;line-height:1.5;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.35);color:#c7d2fe">
      ${hasPAT ? '⏳ Publicando en GitHub…' : '⚠ No hay PAT de GitHub configurado. Andá a <strong>Mantenimiento → GitHub</strong> para configurarlo y poder publicar automáticamente.'}
    </div>
    <button class="admin-btn-primary" style="margin-top:10px" onclick="copyToClipboard(\`${escMsgWA}\`, this, 'Mensaje WhatsApp copiado')">💬 Copiar mensaje WhatsApp para enviar</button>
  `;

  // Si hay PAT, intentamos pushear en background
  if (hasPAT) {
    const statusEl = document.getElementById('adminPushStatus');
    try {
      await ghPushUser(userObj);
      setPublishStatus(hash, { status: 'pushed', name });
      renderAdminUsers();
      statusEl.style.background = 'rgba(34,197,94,0.12)';
      statusEl.style.borderColor = 'rgba(34,197,94,0.4)';
      statusEl.style.color = '#86efac';
      statusEl.innerHTML = '✓ <strong>Publicado en GitHub.</strong> Estamos verificando cuándo queda activo…';
      // Polling en background
      pollUntilLive(hash, name).then(isLive => {
        if (isLive && document.getElementById('adminPushStatus') === statusEl) {
          statusEl.innerHTML = '✓ <strong>Activo en el sitio.</strong> ' + name + ' ya puede entrar.';
        }
      });
      syncAdminRegistry();
    } catch (e) {
      setPublishStatus(hash, { status: 'error', name, error: e.message });
      renderAdminUsers();
      statusEl.style.background = 'rgba(248,113,113,0.12)';
      statusEl.style.borderColor = 'rgba(248,113,113,0.4)';
      statusEl.style.color = '#fca5a5';
      statusEl.innerHTML = '✗ <strong>No se pudo publicar:</strong> ' + escapeHtml(e.message);
    }
  }
}

function copyToClipboard(text, btn, customMsg) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = customMsg || '✓ Copiado';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }).catch(e => {
    showToast('No se pudo copiar: ' + e.message, 'error');
  });
}

/* ─── TAB: ACTIVIDAD ─── */
// La UI de esta pestaña fue migrada al Web Component <lla-admin-activity> (admin-lit.js).
// renderAdminActivity() ahora solo delega: refresca el componente (que lee getActivityLog()
// de forma declarativa) y actualiza las stats del header, que viven FUERA del componente.
function renderAdminActivity() {
  const el = document.querySelector('lla-admin-activity');
  if (el && typeof el.refresh === 'function') el.refresh();
  refreshAdminHeaderStats();
}

/* ─── TAB: MANTENIMIENTO ─── */
function renderAdminInfo() {
  document.getElementById('infoUser').textContent = (CURRENT_USER && CURRENT_USER.name) || '—';
  document.getElementById('infoRole').textContent = (CURRENT_USER && CURRENT_USER.role) || 'referente';
  try {
    const raw = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const exp = new Date(d.expiresAt);
      document.getElementById('infoSince').textContent = 'Expira: ' + exp.toLocaleDateString('es-AR') + ' ' + String(exp.getHours()).padStart(2,'0') + ':' + String(exp.getMinutes()).padStart(2,'0');
    }
  } catch {}
  document.getElementById('infoDevice').textContent = navigator.userAgent.match(/(iPhone|iPad|Android|Windows|Macintosh|Linux)/i)?.[0] || 'Desconocido';
}

function adminExportConfig() {
  const config = {
    exportedAt: new Date().toISOString(),
    user: CURRENT_USER && CURRENT_USER.name,
    draft: localStorage.getItem(STORAGE_KEY),
    activity: localStorage.getItem(ACTIVITY_KEY)
  };
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lla-config-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  showToast('✓ Configuración exportada', 'success');
}

function adminImportConfig(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const config = JSON.parse(e.target.result);
      if (config.draft) localStorage.setItem(STORAGE_KEY, config.draft);
      if (config.activity) localStorage.setItem(ACTIVITY_KEY, config.activity);
      showToast('✓ Configuración importada — recargando...', 'success');
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      showToast('Error al importar: archivo inválido', 'error');
    }
  };
  reader.readAsText(file);
}

function adminClearActivity() {
  if (!confirm('¿Borrar todo el histórico de actividad local? Esta acción no se puede deshacer.')) return;
  localStorage.removeItem(ACTIVITY_KEY);
  renderAdminActivity();
  showToast('✓ Histórico de actividad limpiado', 'info');
}

// ─── GitHub PAT management ───
function adminSaveGhPat() {
  const input = document.getElementById('adminGhPat');
  const status = document.getElementById('adminGhPatStatus');
  const token = input.value.trim();
  if (!token) {
    status.innerHTML = '<span style="color:#fca5a5">⚠ Pegá un token primero</span>';
    return;
  }
  if (!token.match(/^(ghp_|github_pat_)/)) {
    status.innerHTML = '<span style="color:#fca5a5">⚠ No parece un token válido (debe empezar con <code>ghp_</code> o <code>github_pat_</code>)</span>';
    return;
  }
  setGitHubPAT(token);
  input.value = '';
  status.innerHTML = '<span style="color:#86efac">✓ Token guardado en este navegador. Probá con "🔍 Probar" para verificar permisos.</span>';
}

async function adminTestGhPat() {
  const status = document.getElementById('adminGhPatStatus');
  const token = getGitHubPAT();
  if (!token) {
    status.innerHTML = '<span style="color:#fca5a5">⚠ No hay token guardado. Pegá uno y tocá Guardar.</span>';
    return;
  }
  status.innerHTML = '<span style="color:#c7d2fe">⏳ Probando…</span>';
  try {
    const res = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_USERS_PATH}`, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json'
      }
    });
    if (res.ok) {
      const data = await res.json();
      const decoded = JSON.parse(b64DecodeUtf8(data.content));
      const count = (decoded.users || []).length;
      status.innerHTML = `<span style="color:#86efac">✓ Token funciona. ${count} referentes en el repo.</span>`;
    } else {
      const t = await res.text().catch(() => '');
      status.innerHTML = `<span style="color:#fca5a5">✗ ${res.status} — ${escapeHtml(t.slice(0,150))}</span>`;
    }
  } catch (e) {
    status.innerHTML = `<span style="color:#fca5a5">✗ ${escapeHtml(e.message)}</span>`;
  }
}

function adminClearGhPat() {
  if (!confirm('¿Eliminar el Personal Access Token guardado?')) return;
  setGitHubPAT('');
  const status = document.getElementById('adminGhPatStatus');
  if (status) status.innerHTML = '<span style="color:rgba(255,255,255,0.55)">Token eliminado.</span>';
}

function adminRefreshSheetStatus() {
  const input = document.getElementById('adminSheetUrl');
  const status = document.getElementById('adminSheetStatus');
  const current = getSheetWebhookUrl();
  if (input) input.value = current || '';
  if (!status) return;
  if (current) {
    const shared = window._sharedConfig && window._sharedConfig.sheetUrl;
    if (shared && shared === current) {
      status.innerHTML = '<span style="color:#86efac">✓ URL activa y publicada — todos los referentes están sincronizando al Sheet.</span>';
    } else {
      status.innerHTML = '<span style="color:#fcd34d">✓ Guardada localmente. Tocá <strong>Guardar y publicar</strong> para que la usen el resto de referentes también.</span>';
    }
  } else {
    status.innerHTML = '<span style="color:rgba(255,255,255,0.5)">Sin URL configurada.</span>';
  }
}

function adminRefreshGhPatStatus() {
  const status = document.getElementById('adminGhPatStatus');
  if (!status) return;
  const has = !!getGitHubPAT();
  status.innerHTML = has
    ? '<span style="color:#86efac">✓ Hay un token guardado en este navegador.</span>'
    : '<span style="color:rgba(255,255,255,0.55)">Sin token configurado.</span>';
}

function adminWipeAll() {
  if (!confirm('⚠ ATENCIÓN: vas a borrar TODO (borrador actual, histórico, sesión). La próxima vez tendrás que ingresar tu código de acceso de nuevo. ¿Continuar?')) return;
  localStorage.clear();
  sessionStorage.clear();
  location.reload();
}

function logout() {
  if (!confirm('¿Cerrar sesión? Vas a tener que ingresar el código nuevamente.')) return;
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_KEY);
  location.reload();
}

// Forzar logout sin confirmación (por revocación de acceso)
function forceLogout(reason) {
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_KEY);
  if (reason) {
    try { alert(reason); } catch {}
  }
  location.reload();
}

// Re-valida que el usuario actual sigue en users.json del repo cada 2 min.
// Si fue removido → forzar logout.
let _sessionRevalInterval = null;
function startSessionRevalidation() {
  if (_sessionRevalInterval) clearInterval(_sessionRevalInterval);
  // Admin no se auto-loguea (no queremos que se kickee a sí mismo si está editando)
  if (CURRENT_USER && CURRENT_USER.role === 'admin') return;
  _sessionRevalInterval = setInterval(async () => {
    if (!CURRENT_USER) return;
    try {
      const res = await fetch('users.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data.users)) return;
      const stillExists = data.users.some(u => u.name === CURRENT_USER.name);
      if (!stillExists) {
        clearInterval(_sessionRevalInterval);
        forceLogout('Tu acceso fue revocado por un administrador.\n\nSi creés que es un error, contactá a tu coordinador.');
      } else {
        // Refrescar lista en memoria con la última versión del repo
        AUTHORIZED_USERS = data.users;
      }
    } catch {}
  }, 120 * 1000); // cada 2 minutos
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('codeInput');
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  const keep = document.getElementById('keepLogin').checked;
  const code = input.value.trim();
  if (!code) return;
  btn.disabled = true; btn.textContent = 'Verificando...';
  err.classList.remove('show');
  await new Promise(r => setTimeout(r, 250)); // feedback visual
  try {
    const user = await tryAuthenticate(code);
    if (user) {
      persistAuth(user, keep);
      showApp(user);
    } else {
      err.classList.add('show');
      input.value = '';
      input.focus();
    }
  } catch (ex) {
    console.error('Auth error:', ex);
    err.textContent = 'Error al validar. Probá de nuevo.';
    err.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = 'Acceder';
  }
}

// Bootstrap: si ya hay sesión persistida, saltar el login
(function bootstrapAuth() {
  document.addEventListener('DOMContentLoaded', async () => {
    await usersReady; // esperar a que users.json cargue antes de validar sesión
    const persisted = readPersistedAuth();
    if (persisted) {
      showApp(persisted);
    } else {
      const form = document.getElementById('loginForm');
      const input = document.getElementById('codeInput');
      form.addEventListener('submit', handleLoginSubmit);
      // Normalizar la entrada en tiempo real
      input.addEventListener('input', () => {
        input.value = normalizeCode(input.value);
      });
      setTimeout(() => input.focus(), 300);
    }
  });
})();

const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const RIO_NEGRO_CIUDADES = [
  'Allen','Aguada Cecilio','Aguada de Guerra','Aguada Guzmán',
  'Bariloche','Catriel','Cervantes','Chelforo','Chichinales','Chimpay',
  'Choele Choel','Cinco Saltos','Cipolletti','Clemente Onelli','Comallo',
  'Cona Niyeu','Contralmirante Cordero','Coronel Cornejo','Darwin','Dina Huapi',
  'El Bolsón','El Cóndor','El Cuy','El Foyel','El Juncal',
  'Fernández Oro','General Conesa','General Enrique Godoy','General Roca',
  'Guardia Mitre','Ingeniero Huergo','Ingeniero Jacobacci','La Lobería',
  'Lamarque','Las Grutas','Los Menucos','Luis Beltrán','Mainqué','Maquinchao',
  'Mencué','Ministro Ramos Mexía','Nahuel Niyeu','Ñorquinco','Pichi Mahuida',
  'Pilcaniyeu','Pomona','Prahuaniyeu','Ramos Mexía','Río Colorado',
  'San Antonio Oeste','San Carlos de Bariloche','San Javier',
  'Sierra Grande','Valcheta','Valle Azul','Viedma','Villa Manzano','Villa Regina'
].sort((a,b) => a.localeCompare(b, 'es'));

/* ─── Ciudades favoritas (localStorage por dispositivo) ─── */
const FAVORITES_KEY = 'lla_favorite_cities_v1';
function getFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function isFavorite(city) { return getFavorites().includes(city); }
function toggleFavorite(city, ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  const favs = getFavorites();
  const idx = favs.indexOf(city);
  if (idx >= 0) {
    favs.splice(idx, 1);
    showToast && showToast('☆ ' + city + ' quitada de favoritas', 'info', 2000);
  } else {
    favs.push(city);
    showToast && showToast('⭐ ' + city + ' agregada a favoritas', 'success', 2000);
  }
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs)); } catch {}
  renderCityList();
}

function renderCityOption(city, currentCity, highlightTerm) {
  const isActive = city === currentCity;
  const fav = isFavorite(city);
  const cityEsc = city.replace(/'/g,"\\'");
  let display = city;
  if (highlightTerm) {
    const safe = highlightTerm.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    display = city.replace(new RegExp('('+safe+')','gi'),'<strong>$1</strong>');
  }
  return `<div class="drawer-option ${isActive?'active':''}" onclick="selectCity('${cityEsc}')">
    <span class="drawer-option-text">${display}</span>
    <button class="drawer-fav-btn ${fav?'is-fav':''}" onclick="toggleFavorite('${cityEsc}', event)" aria-label="${fav?'Quitar de':'Agregar a'} favoritas" title="${fav?'Quitar de':'Marcar como'} favorita">${fav?'★':'☆'}</button>
  </div>`;
}

function renderCityList() {
  const list = document.getElementById('cityList');
  const term = (document.getElementById('drawerSearch').value||'').toLowerCase().trim();
  const currentCity = document.getElementById('cityInput').value;
  const matches = term ? RIO_NEGRO_CIUDADES.filter(c => c.toLowerCase().includes(term)) : RIO_NEGRO_CIUDADES;
  if (!matches.length) {
    list.innerHTML = '<div class="drawer-empty">Sin resultados para "' + term + '"</div>';
    return;
  }

  let html = '';
  const favs = getFavorites().filter(c => RIO_NEGRO_CIUDADES.includes(c));

  if (!term) {
    // Sin búsqueda: sección Favoritas + secciones A-Z
    if (favs.length) {
      const sortedFavs = favs.slice().sort((a,b) => a.localeCompare(b,'es'));
      html += `<div class="drawer-section fav-section">★ Favoritas (${favs.length})</div>`;
      html += sortedFavs.map(c => renderCityOption(c, currentCity)).join('');
    }
    // Agrupar el resto por letra
    const groups = {};
    matches.forEach(c => {
      const letter = c.charAt(0).toUpperCase();
      (groups[letter] = groups[letter] || []).push(c);
    });
    html += Object.keys(groups).sort().map(letter => {
      const items = groups[letter].map(c => renderCityOption(c, currentCity)).join('');
      return `<div class="drawer-section">${letter}</div>${items}`;
    }).join('');
  } else {
    // Con búsqueda: lista plana con highlight
    html = matches.map(c => renderCityOption(c, currentCity, term)).join('');
  }
  list.innerHTML = html;
  // Stagger entrance — solo los primeros 25 items para no demorar
  applyStagger(list, { delay: 15, max: 25 });
}

function openCityDrawer() {
  document.getElementById('drawerSearch').value = '';
  renderCityList();
  document.getElementById('cityDrawer').classList.add('open');
  document.getElementById('drawerBackdrop').classList.add('open');
  setTimeout(() => document.getElementById('drawerSearch').focus(), 320);
}

function closeCityDrawer() {
  document.getElementById('cityDrawer').classList.remove('open');
  document.getElementById('drawerBackdrop').classList.remove('open');
}

function selectCity(city) {
  document.getElementById('cityInput').value = city;
  document.getElementById('cityBtnCurrent').textContent = city;
  closeCityDrawer();
  updatePreview();
  // Pulse animation en el nombre de ciudad del documento
  const docCity = document.getElementById('docCityName');
  if (docCity) {
    docCity.classList.remove('flash');
    void docCity.offsetWidth; // forzar reflow
    docCity.classList.add('flash');
  }
  scheduleSave();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeCityDrawer(); closeAdminDrawer(); closeDraftsDrawer(); }
});

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return DIAS[dt.getDay()] + ' ' + d + ' de ' + MESES[m-1] + ' de ' + y;
}

// Parser de markdown mínimo: **negrita**, _cursiva_, <u>subrayado</u>
function markdownToHTML(text) {
  // 1. Reservar tokens de <u>...</u> antes de escapar
  const uPlaceholders = [];
  text = text.replace(/<u>([\s\S]*?)<\/u>/gi, (m, inner) => {
    uPlaceholders.push(inner);
    return 'U' + (uPlaceholders.length - 1) + '';
  });
  // 2. Escapar HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // 3. Bold con **
  html = html.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  // 4. Italic con _ (evitar conflicto con palabras que tienen _)
  html = html.replace(/(^|[\s(¿¡])_([^_\n]+?)_(?=[\s.,;:!?)¡¿]|$)/g, '$1<em>$2</em>');
  // 5. Restaurar <u>
  html = html.replace(/U(\d+)/g, (m, i) => {
    const inner = uPlaceholders[+i]
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return '<u>' + inner + '</u>';
  });
  return html;
}

// Inverso: extraer markdown desde HTML (para sync desde edición inline)
function htmlToMarkdown(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const inner = Array.from(node.childNodes).map(walk).join('');
    const tag = node.tagName;
    if (tag === 'STRONG' || tag === 'B') return '**' + inner + '**';
    if (tag === 'EM' || tag === 'I') return '_' + inner + '_';
    if (tag === 'U') return '<u>' + inner + '</u>';
    if (tag === 'BR') return '\n';
    if (tag === 'DIV' || tag === 'P') return inner + '\n\n';
    return inner;
  }
  return walk(tmp).replace(/\n{3,}/g, '\n\n').trim();
}

function renderBodyBlocks(text, city) {
  const container = document.getElementById('docBodyBlocks');
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  container.innerHTML = paragraphs.map(p => {
    const withCity = p.trim().replace(/\[CIUDAD\]/g, city);
    const html = markdownToHTML(withCity);
    return `<div class="doc-text-block">${html}</div>`;
  }).join('');
}

// Aplicar formato a la selección actual del textarea (B/I/U)
function applyFormat(type) {
  const ta = document.getElementById('bodyText');
  if (!ta) return;
  ta.focus();
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = ta.value.substring(start, end);
  if (!selected) {
    showToast && showToast('Seleccioná primero el texto a formatear', 'info', 2200);
    return;
  }
  let open, close;
  if (type === 'bold') { open = '**'; close = '**'; }
  else if (type === 'italic') { open = '_'; close = '_'; }
  else if (type === 'underline') { open = '<u>'; close = '</u>'; }
  else return;
  // Toggle: si la selección ya está envuelta, quitarla
  const before = ta.value.substring(0, start);
  const after = ta.value.substring(end);
  let wrapped, newStart, newEnd;
  if (selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length) {
    wrapped = selected.substring(open.length, selected.length - close.length);
    newStart = start;
    newEnd = start + wrapped.length;
  } else {
    wrapped = open + selected + close;
    newStart = start;
    newEnd = start + wrapped.length;
  }
  ta.value = before + wrapped + after;
  ta.setSelectionRange(newStart, newEnd);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function isActive(id) { return document.activeElement && document.activeElement.id === id; }

/* ════════════════════════════════════════════════════════════════
   ANIMACIONES PREMIUM
   ════════════════════════════════════════════════════════════════ */

// Secciones colapsables del panel izquierdo
function toggleSection(header) {
  const section = header.closest('.panel-section');
  section.classList.toggle('collapsed');
}

// ═══════════════ MODO COMUNICADO DE PRENSA ═══════════════
let currentMode = 'membrete';

function switchMode(mode) {
  const previous = currentMode;
  if (previous === mode) {
    // Idempotente — solo asegurar clases
    document.body.classList.toggle('mode-membrete', mode === 'membrete');
    document.body.classList.toggle('mode-comunicado', mode === 'comunicado');
    document.getElementById('modeTabMembrete').classList.toggle('active', mode === 'membrete');
    document.getElementById('modeTabComunicado').classList.toggle('active', mode === 'comunicado');
    if (mode === 'comunicado') updateComunicadoPreview(); else updatePreview();
    if (typeof updateFloatingEditorBar === 'function') updateFloatingEditorBar();
    return;
  }
  currentMode = mode;

  const preview = document.getElementById('document-preview');
  const editor = document.querySelector('.editor-panel');
  const direction = mode === 'comunicado' ? 'forward' : 'backward'; // nota → comunicado = forward (slide left)

  // 1. Animar SALIDA del modo anterior
  if (preview) {
    preview.classList.add('mode-switching-out');
    preview.dataset.direction = direction;
  }
  if (editor) {
    editor.classList.add('editor-mode-switching');
  }

  setTimeout(() => {
    // 2. Cambiar las clases del body + tabs en el "punto medio"
    document.body.classList.toggle('mode-membrete', mode === 'membrete');
    document.body.classList.toggle('mode-comunicado', mode === 'comunicado');
    document.getElementById('modeTabMembrete').classList.toggle('active', mode === 'membrete');
    document.getElementById('modeTabComunicado').classList.toggle('active', mode === 'comunicado');
    if (mode === 'comunicado') updateComunicadoPreview(); else updatePreview();
    if (typeof updateFloatingEditorBar === 'function') updateFloatingEditorBar();

    // 3. Animar ENTRADA del nuevo modo
    if (preview) {
      preview.classList.remove('mode-switching-out');
      preview.classList.add('mode-switching-in');
      setTimeout(() => {
        preview.classList.remove('mode-switching-in');
        delete preview.dataset.direction;
      }, 380);
    }
    if (editor) {
      setTimeout(() => editor.classList.remove('editor-mode-switching'), 200);
    }
  }, 180);
}

/* ════════════════════════════════════════════════════════════════
   TEXT SIZE EDITOR — selectores de tamaño (Chico/Normal/Grande)
   por sección. Persistido en draft state como _textSizes.
   ════════════════════════════════════════════════════════════════ */
const TEXT_SIZE_DEFAULTS = {
  notaBody: 12,
  comTitulo: 16,
  comBody: 13
};
const TEXT_SIZE_CSS_VAR = {
  notaBody:  '--nota-body-size',
  comTitulo: '--com-title-size',
  comBody:   '--com-body-size'
};
let currentTextSizes = { ...TEXT_SIZE_DEFAULTS };

function applyTextSizes() {
  Object.entries(currentTextSizes).forEach(([key, size]) => {
    document.documentElement.style.setProperty(TEXT_SIZE_CSS_VAR[key], size + 'px');
    const badge = document.getElementById('badge' + key.charAt(0).toUpperCase() + key.slice(1));
    if (badge) badge.textContent = size + 'pt';
    document.querySelectorAll(`[data-size-target="${key}"] .size-btn`).forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.size) === size);
    });
  });
}

function setTextSize(key, size) {
  if (!(key in TEXT_SIZE_DEFAULTS)) return;
  currentTextSizes[key] = size;
  applyTextSizes();
  // Re-render preview en vivo
  if (key === 'notaBody') {
    if (typeof updatePreview === 'function') updatePreview();
  } else if (typeof updateComunicadoPreview === 'function') {
    updateComunicadoPreview();
  }
  // Sincronizar toolbar flotante
  if (typeof updateFloatingEditorBar === 'function') updateFloatingEditorBar();
  if (typeof scheduleSave === 'function') scheduleSave();
}

function getCurrentTextSizes() { return { ...currentTextSizes }; }
function restoreTextSizes(sizes) {
  if (sizes && typeof sizes === 'object') {
    currentTextSizes = { ...TEXT_SIZE_DEFAULTS, ...sizes };
  } else {
    currentTextSizes = { ...TEXT_SIZE_DEFAULTS };
  }
  applyTextSizes();
  if (typeof updateFloatingEditorBar === 'function') updateFloatingEditorBar();
}

/* ════════════════════════════════════════════════════════════════
   FLOATING EDITOR BAR (estilo Word/Docs)
   ════════════════════════════════════════════════════════════════ */
function bindFloatingEditorBar() {
  const bar = document.getElementById('floatingEditorBar');
  if (!bar || bar._bound) return;
  bar._bound = true;

  // Format buttons (B/I/U) — solo para nota body (contenteditable)
  bar.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault()); // no robar focus
    btn.addEventListener('click', () => {
      if (typeof applyFormat === 'function') applyFormat(btn.dataset.cmd);
      updateFloatingEditorBar();
    });
  });

  // Body size
  bar.querySelectorAll('[data-target="body"]').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => {
      const isCom = currentMode === 'comunicado';
      const size = parseFloat(isCom ? btn.dataset.sizeCom : btn.dataset.sizeNota);
      setTextSize(isCom ? 'comBody' : 'notaBody', size);
    });
  });

  // Título comunicado
  bar.querySelectorAll('[data-target="comTitulo"]').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => setTextSize('comTitulo', parseFloat(btn.dataset.size)));
  });

  // Listener en cuerpo del comunicado para actualizar IG fit en tiempo real (debounced)
  ['comunicadoCuerpo', 'comunicadoTitulo', 'comunicadoSubtitulo', 'comunicadoLinkLabel', 'comunicadoLinkUrl'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      clearTimeout(bar._igTimer);
      bar._igTimer = setTimeout(updateFloatingEditorBar, 220);
    });
  });

  updateFloatingEditorBar();
}

function updateFloatingEditorBar() {
  const bar = document.getElementById('floatingEditorBar');
  if (!bar) return;
  const isCom = currentMode === 'comunicado';
  const bodySize = isCom ? currentTextSizes.comBody : currentTextSizes.notaBody;
  const titleSize = currentTextSizes.comTitulo;

  // Active state body
  bar.querySelectorAll('[data-target="body"]').forEach(btn => {
    const expected = parseFloat(isCom ? btn.dataset.sizeCom : btn.dataset.sizeNota);
    btn.classList.toggle('active', expected === bodySize);
  });
  // Active state título
  bar.querySelectorAll('[data-target="comTitulo"]').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.size) === titleSize);
  });

  // Active state B/I/U
  if (typeof document.queryCommandState === 'function') {
    bar.querySelectorAll('[data-cmd]').forEach(btn => {
      try { btn.classList.toggle('active', document.queryCommandState(btn.dataset.cmd)); }
      catch { /* ignore */ }
    });
  }

  // Live IG chip: cuántas imágenes (slides del carrusel) va a generar
  if (isCom) {
    const { slideCount } = predictIGSlides();
    const chipSize = document.getElementById('febIgSize');
    const chip = document.getElementById('febIgChip');
    if (chipSize) chipSize.textContent = slideCount === 1 ? '1 imagen' : (slideCount + ' imágenes');
    if (chip) {
      chip.classList.remove('shrink', 'shrink-hard');
      if (slideCount === 1) {
        chip.title = '✓ Entra en 1 imagen 1080×1350 al tamaño normal';
      } else {
        chip.classList.add('shrink'); // ámbar informativo: carrusel, no es error
        chip.title = 'El comunicado se exporta como carrusel de ' + slideCount + ' imágenes (fuente legible, sin achicar)';
      }
    }
  }
}

// ─── Dimensiones de export para redes (verificado mayo 2026) ───
// Instagram feed: 4:5 = 1080×1350 (recomendado, no se recorta en el feed).
// Antes usábamos 1080×1440 (3:4, el ratio del grid) → IG recortaba arriba/abajo.
const IG_W = 1080;
const IG_H = 1350;
const IG_BANNER_H = 200;
const IG_FOOTER_H = 175;
const IG_BASE_BODY = 28;   // tamaño base del cuerpo (subido de 26 → 28, refs oficiales usan fuente más grande)
// (predictIGSlides() y renderIGNative() viven más abajo, junto a computeIGSlides)

// Factor pt→px en el preview: A4 = 210mm = 794px → 3.781 px/mm; 1pt = 0.3528mm.
const COM_PX_PER_MM = 794 / 210;
const ptToPxPreview = pt => pt * 0.3528 * COM_PX_PER_MM;   // ≈ pt * 1.334

function updateComunicadoPreview() {
  const city = (document.getElementById('cityInput').value || 'RÍO NEGRO');
  const titulo = document.getElementById('comunicadoTitulo').value.trim();
  const subtitulo = (document.getElementById('comunicadoSubtitulo')?.value || '').trim();
  const cuerpo = document.getElementById('comunicadoCuerpo').value.trim();
  const linkLabel = document.getElementById('comunicadoLinkLabel').value.trim();
  const linkUrl = document.getElementById('comunicadoLinkUrl').value.trim();

  buildComunicadoPages({ city, titulo, subtitulo, cuerpo, linkLabel, linkUrl });
  scaleDocument();
}

// Construye el preview del comunicado como hojas A4 apiladas (banner+cuerpo+pie por hoja),
// paginando por párrafo igual que el PDF. Actualiza el indicador "N páginas".
function buildComunicadoPages(d) {
  const container = document.getElementById('comPages');
  if (!container) return;

  // Tamaños en px equivalentes a los pt del PDF (para que el corte coincida con lo impreso)
  const titlePx = ptToPxPreview(currentTextSizes.comTitulo || 16);
  const bodyPx  = ptToPxPreview(currentTextSizes.comBody || 13);
  const subPx   = ptToPxPreview(13);
  const paraGapPx = bodyPx * 1.55 * 0.65;
  const rs = document.documentElement.style;
  rs.setProperty('--com-title-px', titlePx.toFixed(1) + 'px');
  rs.setProperty('--com-sub-px', subPx.toFixed(1) + 'px');
  rs.setProperty('--com-body-px', bodyPx.toFixed(1) + 'px');
  rs.setProperty('--com-para-gap', paraGapPx.toFixed(1) + 'px');

  // Geometría de página (px), espejo del PDF: banner 28mm, pie 28mm, body de 40mm a 269mm
  const BODY_W = 794 - 2 * Math.round(18 * COM_PX_PER_MM);     // ancho útil ≈ 658
  const USABLE = (269 - 40) * COM_PX_PER_MM - 14;               // alto útil del cuerpo ≈ 852 (con margen seguridad)

  // Medidor offscreen (reutilizable) con el mismo ancho de cuerpo
  let m = document.getElementById('comMeasure');
  if (!m) { m = document.createElement('div'); m.id = 'comMeasure'; document.body.appendChild(m); }
  m.style.width = BODY_W + 'px';
  const measure = (cls, html) => { m.innerHTML = '<div class="' + cls + '">' + html + '</div>'; return m.firstChild.offsetHeight; };

  const tituloTxt = (d.titulo && d.titulo.trim()) ? d.titulo : 'Título del comunicado';

  const titleH = measure('com-page-title', escapeHtml(tituloTxt)) + 8;       // + margin-bottom
  const subH = d.subtitulo ? (measure('com-page-subtitle', escapeHtml(d.subtitulo)) + 14) : 0;

  const paras = d.cuerpo ? d.cuerpo.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean) : [];
  const paraH = paras.map(p => measure('com-page-para', escapeHtml(p)));     // offsetHeight (sin margin)

  const hasLinks = !!(d.linkLabel || d.linkUrl);
  let linksH = 0;
  if (hasLinks) {
    let lh = '';
    if (d.linkLabel) lh += '<strong>' + escapeHtml(d.linkLabel) + '</strong><br>';
    if (d.linkUrl) lh += '<a>' + escapeHtml(d.linkUrl) + '</a>';
    linksH = measure('com-page-links', lh) + 16;
  }

  // Paginación por párrafo (corte limpio, sin partir párrafos)
  const pages = [[]];
  let pi = 0;
  let used = titleH + subH;          // la página 0 arranca con título + subtítulo
  paras.forEach((p, idx) => {
    const need = paraH[idx] + (pages[pi].length > 0 || pi === 0 ? paraGapPx : 0);
    if (used + need > USABLE && pages[pi].length > 0) {
      pages.push([]); pi++; used = 0;
    }
    pages[pi].push(idx);
    used += need;
  });
  // Links: en la última página si entran; si no, nueva página
  let linksPage = pi;
  if (hasLinks && used + linksH > USABLE && pages[pi].length > 0) {
    pages.push([]); pi++; linksPage = pi; used = 0;
  }

  // Construir el DOM de las hojas
  const cityUp = escapeHtml((d.city || '').toUpperCase());
  const bannerHTML = '<div class="com-page-banner">'
    + '<div class="com-page-banner-label">COMUNICADO<br>OFICIAL</div>'
    + '<div class="com-page-brand"><img src="LLA BLANCO.png" alt=""><div class="com-page-city">' + cityUp + '</div></div>'
    + '</div>';
  const footerHTML = '<div class="com-page-footer"><img src="LLA VIOLETA.png" alt=""></div>';

  let linksHTML = '';
  if (hasLinks) {
    linksHTML = '<div class="com-page-links">'
      + (d.linkLabel ? '<strong>' + escapeHtml(d.linkLabel) + '</strong><br>' : '')
      + (d.linkUrl ? '<a href="' + escapeHtml(d.linkUrl) + '" target="_blank" rel="noopener">' + escapeHtml(d.linkUrl) + '</a>' : '')
      + '</div>';
  }

  let html = '';
  for (let p = 0; p < pages.length; p++) {
    html += '<div class="com-page">' + bannerHTML + '<div class="com-page-body">';
    if (p === 0) {
      html += '<div class="com-page-title">' + escapeHtml(tituloTxt) + '</div>';
      if (d.subtitulo) html += '<div class="com-page-subtitle">' + escapeHtml(d.subtitulo) + '</div>';
    }
    pages[p].forEach(idx => { html += '<div class="com-page-para">' + escapeHtml(paras[idx]) + '</div>'; });
    if (hasLinks && p === linksPage) html += linksHTML;
    html += '</div>' + footerHTML + '</div>';
  }
  container.innerHTML = html;

  // Indicador de páginas
  const ind = document.getElementById('pageIndicator');
  if (ind) {
    if (pages.length > 1) { ind.textContent = '📄 ' + pages.length + ' páginas'; ind.classList.add('show'); }
    else ind.classList.remove('show');
  }
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function autosizeComunicado(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// Magnetic buttons — el botón sigue al cursor cuando está cerca
function makeMagnetic(el, opts) {
  opts = opts || {};
  const strength = opts.strength || 0.28;
  const radius = opts.radius || 90; // px de "campo magnético" alrededor del botón
  let inField = false;
  el.classList.add('magnetic');
  function onMove(e) {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const maxDist = Math.max(rect.width, rect.height) / 2 + radius;
    if (dist < maxDist) {
      const force = 1 - (dist / maxDist);
      el.style.transform = 'translate(' + (dx * strength * force).toFixed(2) + 'px, ' + (dy * strength * force).toFixed(2) + 'px)';
      inField = true;
    } else if (inField) {
      el.style.transform = '';
      inField = false;
    }
  }
  function onLeave() {
    el.style.transform = '';
    inField = false;
  }
  document.addEventListener('mousemove', onMove);
  el.addEventListener('mouseleave', onLeave);
}

function bindMagneticButtons() {
  // Solo en desktop (no en touch devices donde el efecto no aplica)
  if (window.matchMedia('(hover: none)').matches) return;
  ['exportPDF', 'exportJPG', 'shareBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) makeMagnetic(el, { strength: 0.25, radius: 60 });
  });
  // También para los 2 botones principales del topbar buscando por texto
  document.querySelectorAll('.btn.btn-primary, .btn.btn-glass').forEach(b => {
    if (!b.id || !['exportPDF', 'exportJPG', 'shareBtn'].includes(b.id)) {
      makeMagnetic(b, { strength: 0.22, radius: 50 });
    }
  });
}

// Animar un número de A → B con easing
function animateCounter(el, to, duration) {
  if (!el) return;
  duration = duration || 800;
  const from = parseInt(el.textContent.replace(/\D/g, ''), 10) || 0;
  if (from === to) { el.textContent = to; return; }
  const start = performance.now();
  function tick(now) {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = to;
  }
  requestAnimationFrame(tick);
}

// Aplicar stagger animation a los hijos directos de un container
function applyStagger(container, opts) {
  if (!container) return;
  opts = opts || {};
  const delay = opts.delay || 18;          // ms entre items
  const max = opts.max || 30;              // máximo de items a animar
  const items = Array.from(container.children).slice(0, max);
  items.forEach((item, i) => {
    item.classList.add('stagger-in');
    item.style.animationDelay = (i * delay) + 'ms';
    // Limpiar al terminar para no afectar futuras manipulaciones
    item.addEventListener('animationend', function handler() {
      item.classList.remove('stagger-in');
      item.style.animationDelay = '';
      item.removeEventListener('animationend', handler);
    });
  });
}

/* ════════════════════════════════════════════════════════════════
   TOAST DE NOTIFICACIÓN
   ════════════════════════════════════════════════════════════════ */
function showToast(message, type, duration, onClick) {
  type = type || 'success';
  duration = duration || 3500;
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  if (onClick) t.style.cursor = 'pointer';
  const icons = { success: '✓', info: 'i', error: '!' };
  t.innerHTML =
    '<div class="toast-icon">' + (icons[type] || '✓') + '</div>' +
    '<div class="toast-body">' + message + '</div>' +
    '<button class="toast-close" aria-label="Cerrar">×</button>';
  container.appendChild(t);
  const remove = () => {
    t.classList.add('exit');
    setTimeout(() => t.remove(), 300);
  };
  t.querySelector('.toast-close').addEventListener('click', (e) => { e.stopPropagation(); remove(); });
  if (onClick) {
    t.addEventListener('click', () => { onClick(); remove(); });
  }
  setTimeout(remove, duration);
}

/* ════════════════════════════════════════════════════════════════
   AUTOSIZE TEXTAREA + CONTADOR
   ════════════════════════════════════════════════════════════════ */
function autosizeBody(el) {
  if (!el) el = document.getElementById('bodyText');
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight + 4, 600) + 'px';
}

function updateBodyCounter() {
  const txt = (document.getElementById('bodyText').value || '');
  const chars = txt.length;
  const words = (txt.trim().match(/\S+/g) || []).length;
  document.getElementById('bodyChars').textContent = chars;
  document.getElementById('bodyWords').textContent = words;
  const hint = document.getElementById('bodyHint');
  if (chars < 50) hint.textContent = 'Texto muy breve';
  else if (chars > 2000) hint.textContent = 'Texto extenso';
  else hint.textContent = 'Longitud adecuada';
}

/* ════════════════════════════════════════════════════════════════
   ZOOM MANUAL DEL PREVIEW
   ════════════════════════════════════════════════════════════════ */
let zoomMode = 'fit'; // 'fit' | número (porcentaje)
function applyZoom() {
  const wrapper = document.getElementById('docScaleWrapper');
  const doc = document.getElementById('document-preview');
  if (!wrapper || !doc) return;
  let scale;
  if (zoomMode === 'fit') {
    const area = document.querySelector('.preview-area');
    const cs = window.getComputedStyle(area);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const available = area.clientWidth - pad;
    scale = available < 794 ? Math.max(available / 794, 0.25) : 1;
  } else {
    scale = zoomMode / 100;
  }
  wrapper.style.transform = 'scale(' + scale + ')';
  wrapper.style.width = '794px';
  wrapper.style.height = (doc.offsetHeight * scale) + 'px';
  wrapper.style.marginBottom = '24px';
  // En mobile (scale < 1) la combinación flex align-items:center + wrapper 794px
  // produce un left negativo que recorta el borde izquierdo del documento.
  // Solución: anclar al borde izquierdo con transform-origin top left.
  if (scale < 1) {
    wrapper.style.transformOrigin = 'top left';
    wrapper.style.alignSelf = 'flex-start';
  } else {
    wrapper.style.transformOrigin = 'top center';
    wrapper.style.alignSelf = '';
  }
  const lvl = document.getElementById('zoomLevel');
  if (lvl) lvl.textContent = Math.round(scale * 100) + '%';
}
function zoomIn() {
  const current = zoomMode === 'fit' ? Math.round((parseFloat(document.getElementById('docScaleWrapper').style.transform.match(/[\d.]+/)?.[0] || 1)) * 100) : zoomMode;
  zoomMode = Math.min(current + 15, 200);
  applyZoom();
}
function zoomOut() {
  const current = zoomMode === 'fit' ? Math.round((parseFloat(document.getElementById('docScaleWrapper').style.transform.match(/[\d.]+/)?.[0] || 1)) * 100) : zoomMode;
  zoomMode = Math.max(current - 15, 30);
  applyZoom();
}
function zoomFit() { zoomMode = 'fit'; applyZoom(); }

// Detecta URLs en el cuerpo del comunicado y ofrece moverlas al campo Links.
// Se muestra una sola vez por URL detectada (acumula en un Set para no spamear).
function bindCuerpoUrlHint() {
  const cuerpo = document.getElementById('comunicadoCuerpo');
  if (!cuerpo || cuerpo._urlHintBound) return;
  cuerpo._urlHintBound = true;
  const URL_RE = /\bhttps?:\/\/[^\s)]+/i;
  const dismissed = new Set();
  let toastTimer = null;
  let activeToast = null;
  const check = () => {
    const linkField = document.getElementById('comunicadoLinkUrl');
    if (!linkField || linkField.value.trim()) return;
    const match = cuerpo.value.match(URL_RE);
    if (!match) return;
    const url = match[0].replace(/[.,;:!?]+$/, '');
    if (dismissed.has(url) || activeToast) return;
    activeToast = showToastWithAction(
      '🔗 Detecté un link en el cuerpo: <strong>' + escapeHtml(url.length > 38 ? url.slice(0, 38) + '…' : url) + '</strong>',
      'Mover al campo Links',
      () => {
        linkField.value = url;
        cuerpo.value = cuerpo.value.replace(url, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        if (typeof updateComunicadoPreview === 'function') updateComunicadoPreview();
        if (typeof saveState === 'function') saveState();
        showToast('✓ Link movido al campo Links', 'success', 2000);
      },
      () => { dismissed.add(url); }
    );
  };
  const schedule = () => {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(check, 800);
  };
  cuerpo.addEventListener('input', schedule);
  cuerpo.addEventListener('paste', schedule);
}

// Pequeño helper para mostrar un toast con un botón de acción + dismiss.
// Devuelve un objeto que se setea a null automáticamente al cerrarse.
function showToastWithAction(htmlMessage, actionLabel, onAction, onDismiss) {
  const container = document.getElementById('toastContainer');
  if (!container) return null;
  const t = document.createElement('div');
  t.className = 'toast info';
  t.innerHTML =
    '<div class="toast-icon">🔗</div>' +
    '<div class="toast-body">' + htmlMessage +
      '<div style="margin-top:8px;display:flex;gap:6px;">' +
        '<button class="toast-action-btn" data-act="ok">' + escapeHtml(actionLabel) + '</button>' +
        '<button class="toast-action-btn" data-act="no">Ignorar</button>' +
      '</div>' +
    '</div>' +
    '<button class="toast-close" aria-label="Cerrar">×</button>';
  container.appendChild(t);
  const ref = { el: t };
  const close = () => {
    t.classList.add('exit');
    setTimeout(() => { t.remove(); ref.el = null; }, 300);
  };
  t.querySelector('[data-act="ok"]').addEventListener('click', () => { onAction && onAction(); close(); });
  t.querySelector('[data-act="no"]').addEventListener('click', () => { onDismiss && onDismiss(); close(); });
  t.querySelector('.toast-close').addEventListener('click', () => { onDismiss && onDismiss(); close(); });
  // Auto-cierre a los 12s si el usuario no interactúa
  setTimeout(() => { if (ref.el) { onDismiss && onDismiss(); close(); } }, 12000);
  return ref;
}

// Zoom con Ctrl/Cmd + scroll en el preview-area (estilo Figma).
// Debounced para evitar saltos bruscos cuando el trackpad emite muchos eventos.
function bindCtrlScrollZoom() {
  const area = document.querySelector('.preview-area');
  if (!area || area._ctrlZoomBound) return;
  area._ctrlZoomBound = true;
  let pending = 0;
  let rafId = null;
  area.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    pending += e.deltaY;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const dy = pending;
      pending = 0;
      if (Math.abs(dy) < 1) return;
      // Convertir delta acumulado a step de zoom (~10% por "tick")
      const steps = Math.max(1, Math.min(4, Math.round(Math.abs(dy) / 60)));
      for (let i = 0; i < steps; i++) {
        if (dy < 0) zoomIn(); else zoomOut();
      }
    });
  }, { passive: false });
}

/* ════════════════════════════════════════════════════════════════
   RESET / EMPEZAR DE CERO
   ════════════════════════════════════════════════════════════════ */
function confirmReset() {
  if (!confirm('¿Seguro que querés borrar todos los datos y empezar de cero? Esta acción no se puede deshacer.')) return;
  resetForm();
}

function resetForm() {
  try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
  const today = new Date();
  const iso = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  document.getElementById('cityInput').value = 'General Roca';
  document.getElementById('dateInput').value = iso;
  document.getElementById('recipientTemplate').value = 'presidente';
  document.getElementById('recipientName').value = '';
  document.getElementById('bodyText').value = '';
  document.getElementById('signerName').value = '';
  document.getElementById('signerDNI').value = '';
  document.getElementById('signerRole').value = '';
  document.getElementById('cityBtnCurrent').textContent = 'General Roca';
  dismissRestored();
  updatePreview();
  autosizeBody();
  updateBodyCounter();
  logActivity('reset', {});
  showToast('Formulario reiniciado', 'info');
}

/* ════════════════════════════════════════════════════════════════
   BANNER RESTAURADO
   ════════════════════════════════════════════════════════════════ */
function showRestoredBanner(timestamp) {
  // Migrado a toast con acciones (el banner viejo tenía un bug de display CSS)
  if (!timestamp) return;
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const d = new Date(timestamp);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const dStr = sameDay
    ? 'hoy a las ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0')
    : 'el ' + d.toLocaleDateString('es-AR') + ' a las ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  const t = document.createElement('div');
  t.className = 'toast info';
  t.style.maxWidth = '380px';
  t.innerHTML =
    '<div class="toast-icon">📂</div>' +
    '<div class="toast-body">' +
      '<div style="font-weight:700;margin-bottom:2px">Borrador recuperado</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.65);margin-bottom:10px">Última edición ' + dStr + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="toast-action-btn">Continuar editando</button>' +
        '<button class="toast-action-btn danger">Empezar de cero</button>' +
      '</div>' +
    '</div>' +
    '<button class="toast-close" aria-label="Cerrar">×</button>';
  const buttons = t.querySelectorAll('.toast-action-btn');
  const close = () => {
    t.classList.add('exit');
    setTimeout(() => t.remove(), 300);
  };
  buttons[0].addEventListener('click', close); // Continuar
  buttons[1].addEventListener('click', () => { close(); resetForm(); }); // Empezar de cero
  t.querySelector('.toast-close').addEventListener('click', close);
  container.appendChild(t);
}
function dismissRestored() { /* deprecated — el toast se cierra solo */ }

/* ════════════════════════════════════════════════════════════════
   SELLO "Vista previa — no oficial"
   ════════════════════════════════════════════════════════════════ */
function updateWatermark() {
  const wm = document.getElementById('docWatermark');
  if (!wm) return;
  const missing = validateForm ? validateForm() : [];
  if (missing.length) wm.classList.add('show');
  else wm.classList.remove('show');
}

// Formato DNI argentino: solo números, máx 8 dígitos, con separadores de miles ej. 12.345.678
function formatDNI(input) {
  if (!input) return;
  const cursorStart = input.selectionStart;
  const before = input.value;
  // Eliminar todo lo que no sea dígito y limitar a 8
  const digits = before.replace(/\D/g, '').slice(0, 8);
  // Formatear con puntos cada 3 dígitos desde la derecha
  let formatted = '';
  if (digits.length <= 3) formatted = digits;
  else if (digits.length <= 6) formatted = digits.slice(0, -3) + '.' + digits.slice(-3);
  else formatted = digits.slice(0, -6) + '.' + digits.slice(-6, -3) + '.' + digits.slice(-3);
  if (formatted !== before) {
    input.value = formatted;
    // Reposicionar el cursor (aproximadamente) considerando los puntos añadidos
    const diff = formatted.length - before.length;
    try { input.setSelectionRange(cursorStart + diff, cursorStart + diff); } catch(e) {}
  }
}

const RECIPIENT_TEMPLATES = {
  presidente: 'Al Sr./Sra. Presidente/a Del Concejo Deliberante',
  concejal: 'Al/A la Concejal/a'
};

function composeRecipientTitle() {
  const tpl = document.getElementById('recipientTemplate').value;
  return RECIPIENT_TEMPLATES[tpl] || RECIPIENT_TEMPLATES.presidente;
}

function updatePreview() {
  if (currentMode === 'comunicado') { updateComunicadoPreview(); return; }
  const city = document.getElementById('cityInput').value.trim() || 'General Roca';
  const dateVal = document.getElementById('dateInput').value;
  const recipTitle = composeRecipientTitle();
  document.getElementById('recipientTitle').value = recipTitle;
  const bodyText = document.getElementById('bodyText').value;
  const signerName = document.getElementById('signerName').value.trim();
  const signerDNI = document.getElementById('signerDNI').value.trim();
  const signerRole = document.getElementById('signerRole').value.trim();

  document.getElementById('cityPreviewLabel').textContent = city;
  document.getElementById('docCityName').textContent = city;
  document.getElementById('cityBtnCurrent').textContent = city;
  document.getElementById('statusCity').textContent = 'Ciudad: ' + city;

  const dateFormatted = dateVal ? formatDate(dateVal) : '';
  const dateLine = city + (dateFormatted ? ', ' + dateFormatted : '');
  document.getElementById('docDateLine').textContent = dateLine;
  document.getElementById('datePreviewLabel').textContent = dateFormatted || '(sin fecha seleccionada)';

  document.getElementById('docRecipientTitle').textContent = recipTitle;
  const recipNameVal = document.getElementById('recipientName').value.trim();
  const recipNameEl = document.getElementById('docRecipientName');
  if (recipNameEl) {
    recipNameEl.textContent = recipNameVal;
    recipNameEl.style.display = recipNameVal ? '' : 'none';
  }
  document.getElementById('docRecipientCity').innerHTML = 'de ' + city + ' &nbsp;&nbsp;S__________/__________D';

  if (!isActive('docBodyBlocks')) renderBodyBlocks(bodyText, city);

  if (!isActive('docSignerLabel')) {
    document.getElementById('docSignerLabel').style.whiteSpace = 'pre';
    document.getElementById('docSignerLabel').textContent = signerName ? signerName + (signerRole ? '\n' + signerRole : '') : 'Firma y aclaración';
  }
  if (!isActive('docDNILabel')) {
    document.getElementById('docDNILabel').textContent = signerDNI ? 'DNI: ' + signerDNI : 'DNI';
  }
  document.getElementById('docPartyLine').textContent = 'La Libertad Avanza (LLA) ' + city;

  scaleDocument();
  updateWatermark();
  // Recalcular paginación en background
  setTimeout(detectPageCount, 50);
}

// Sync edición inline → inputs del panel editor
function bindInlineEditing() {
  const body = document.getElementById('docBodyBlocks');
  body && body.addEventListener('input', () => {
    const divs = body.querySelectorAll('.doc-text-block');
    let txt;
    if (divs.length) {
      // Preservar formato bold/italic/underline al sincronizar de vuelta
      txt = Array.from(divs).map(d => htmlToMarkdown(d.innerHTML).trim()).filter(Boolean).join('\n\n');
    } else {
      txt = htmlToMarkdown(body.innerHTML).trim();
    }
    document.getElementById('bodyText').value = txt;
  });

  const sig = document.getElementById('docSignerLabel');
  sig && sig.addEventListener('input', () => {
    const lines = sig.innerText.split(/\n/);
    document.getElementById('signerName').value = (lines[0] || '').trim();
    document.getElementById('signerRole').value = (lines.slice(1).join(' ') || '').trim();
  });

  const dni = document.getElementById('docDNILabel');
  dni && dni.addEventListener('input', () => {
    // Solo dígitos, máx 8, formateados con puntos
    const digits = dni.textContent.replace(/\D/g, '').slice(0, 8);
    let formatted = '';
    if (digits.length <= 3) formatted = digits;
    else if (digits.length <= 6) formatted = digits.slice(0, -3) + '.' + digits.slice(-3);
    else formatted = digits.slice(0, -6) + '.' + digits.slice(-6, -3) + '.' + digits.slice(-3);
    document.getElementById('signerDNI').value = formatted;
  });
}

function showLoading(msg, subtext) {
  document.getElementById('loadingText').textContent = msg || 'Generando documento';
  const sub = document.getElementById('loadingSubtext');
  if (sub) sub.textContent = subtext || 'Esto toma unos segundos…';
  document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('active');
}

/* ════════════════════════════════════════════════════════════════
   PAGINACIÓN AUTOMÁTICA (multi-página)
   ════════════════════════════════════════════════════════════════ */
const A4_PX = 1123; // Alto A4 a 96dpi
const A4_PX_W = 794;

// Detecta cuántas páginas ocupa el documento actual y actualiza el indicador
function detectPageCount() {
  const el = document.getElementById('document-preview');
  if (!el) return 1;
  const totalH = el.scrollHeight;
  const pages = Math.max(1, Math.ceil(totalH / A4_PX));
  const ind = document.getElementById('pageIndicator');
  if (ind) {
    if (pages > 1) {
      ind.textContent = '📄 ' + pages + ' páginas';
      ind.classList.add('show');
    } else {
      ind.classList.remove('show');
    }
  }
  return pages;
}

// Divide los bloques del body en N páginas según altura disponible
function paginateBody() {
  const el = document.getElementById('document-preview');
  const headerEl = el.querySelector('.doc-header');
  const footerEl = el.querySelector('.doc-footer');
  const bodyEl = el.querySelector('.doc-body');
  if (!bodyEl) return null;
  // Alturas estructurales fijas
  const headerH = headerEl ? headerEl.offsetHeight : 140;
  const footerH = footerEl ? footerEl.offsetHeight : 60;
  const bodyStyle = window.getComputedStyle(bodyEl);
  const padTop = parseFloat(bodyStyle.paddingTop) || 0;
  const padBot = parseFloat(bodyStyle.paddingBottom) || 0;
  const available = A4_PX - headerH - footerH - padTop - padBot - 24; // 24px safety margin
  // Tomar los hijos del body en orden
  const children = Array.from(bodyEl.children).filter(c => !c.classList.contains('page-break-marker'));
  if (!children.length) return [[]];
  // Pre-calcular alturas (offsetHeight + margin)
  const heights = children.map(c => {
    const cs = window.getComputedStyle(c);
    const mt = parseFloat(cs.marginTop) || 0;
    const mb = parseFloat(cs.marginBottom) || 0;
    return c.offsetHeight + mt + mb;
  });
  // Identificar bloques "anclados al final" que deben ir juntos en la última página
  const lastIdx = children.length - 1;
  let anchorStart = lastIdx;
  while (anchorStart > 0 && (children[anchorStart].classList.contains('doc-signature')
                          || children[anchorStart].classList.contains('doc-party-line')
                          || children[anchorStart].classList.contains('doc-valediction'))) {
    anchorStart--;
  }
  // children[anchorStart+1..end] son los anchored. Calcular su altura total.
  const anchoredIdxs = [];
  for (let i = anchorStart + 1; i <= lastIdx; i++) anchoredIdxs.push(i);
  const anchoredH = anchoredIdxs.reduce((s, i) => s + heights[i], 0);
  // Distribuir el resto en páginas
  const pages = [[]];
  let pageH = 0;
  for (let i = 0; i <= anchorStart; i++) {
    const h = heights[i];
    // Si agregar este bloque hace overflow, abrir nueva página (excepto si la página actual está vacía)
    if (pageH + h > available && pages[pages.length-1].length > 0) {
      pages.push([]);
      pageH = 0;
    }
    pages[pages.length-1].push(children[i]);
    pageH += h;
  }
  // Última página: tratar de meter los anchored al final
  if (anchoredIdxs.length) {
    if (pageH + anchoredH > available && pages[pages.length-1].length > 0) {
      pages.push([]);
      pageH = 0;
    }
    anchoredIdxs.forEach(i => pages[pages.length-1].push(children[i]));
  }
  return pages;
}

// Asegura que las fuentes web (Montserrat) estén cargadas antes de capturar.
// Sin esto html2canvas mide texto con métricas fallback y rompe el layout.
async function ensureFontsLoaded() {
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch {}
  }
  // Forzar carga explícita de los pesos de Montserrat más usados
  if (document.fonts && document.fonts.load) {
    try {
      await Promise.all([
        document.fonts.load('400 12px Montserrat'),
        document.fonts.load('400 13px Montserrat'),    // cuerpo comunicado
        document.fonts.load('500 13px Montserrat'),    // subtítulo comunicado
        document.fonts.load('500 italic 13px Montserrat'), // subtítulo italic
        document.fonts.load('600 12px Montserrat'),
        document.fonts.load('700 13px Montserrat'),
        document.fonts.load('700 16px Montserrat'),    // título comunicado nuevo
        document.fonts.load('700 28px Montserrat')
      ]);
    } catch {}
  }
}

// Captura cada página por separado moviendo temporalmente los bloques del body
async function captureAllPages(html2canvasOptions) {
  const pages = paginateBody();
  if (!pages || pages.length <= 1) return null; // single page → usa flujo normal
  const el = document.getElementById('document-preview');
  const bodyEl = el.querySelector('.doc-body');
  const originalChildren = Array.from(bodyEl.children);
  const originalMinHeight = el.style.minHeight;
  const originalHeight = el.style.height;
  const canvases = [];
  try {
    for (let i = 0; i < pages.length; i++) {
      // Vaciar body y meter solo los bloques de esta página
      while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
      pages[i].forEach(c => bodyEl.appendChild(c));
      el.style.minHeight = A4_PX + 'px';
      el.style.height = A4_PX + 'px';
      // Forzar reflow y esperar 2 frames para que el layout se estabilice
      void el.offsetHeight;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      // Pequeño extra de estabilidad para mediciones de texto
      await new Promise(r => setTimeout(r, 50));
      const canvas = await html2canvas(el, html2canvasOptions);
      canvases.push(canvas);
    }
  } finally {
    // Restaurar TODO el body original
    while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
    originalChildren.forEach(c => bodyEl.appendChild(c));
    el.style.minHeight = originalMinHeight;
    el.style.height = originalHeight;
  }
  return canvases;
}

// Preparar audit info en el documento antes de exportar
async function prepareAuditStamp() {
  const audit = document.getElementById('docAudit');
  if (!audit) return null;
  const user = (CURRENT_USER && CURRENT_USER.name) ? CURRENT_USER.name : 'desconocido';
  const now = new Date();
  const ts = now.toLocaleDateString('es-AR') + ' ' +
             String(now.getHours()).padStart(2,'0') + ':' +
             String(now.getMinutes()).padStart(2,'0');
  // Hash corto de verificación: SHA-256 de "user|timestamp" → primeros 8 chars
  const fingerprint = (await sha256(user + '|' + now.toISOString())).substring(0, 8).toUpperCase();
  audit.innerHTML = 'Generado por: ' + user + ' · ' + ts + ' · LLA-' + fingerprint;
  return { user, ts, fingerprint };
}

// Detección de mobile/iOS para ajustar exportación
function isMobileDevice() {
  return window.matchMedia('(max-width: 900px)').matches
    || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || navigator.vendor || window.opera);
}
function isIOSDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad pretende ser Mac
}

// Descarga universal — compatible con iOS Safari, Chrome Android y desktop
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const ios = isIOSDevice();
  if (ios) {
    // iOS no respeta `download`; abrir en nueva pestaña → usuario usa "Compartir"
    const w = window.open(url, '_blank');
    if (!w) {
      // Bloqueador de popups: navegar a la URL (el usuario puede guardar desde el visor)
      window.location.href = url;
    }
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ════════════════════════════════════════════════════════════════
   EXPORT COMUNICADO PDF NATIVO (texto vectorial con Montserrat)
   ════════════════════════════════════════════════════════════════
   html2canvas tiene un bug irreparable con Montserrat (caracteres
   superpuestos). Para el comunicado renderizamos el PDF con texto
   real de jsPDF, embebiendo el TTF de Montserrat. Resultado: texto
   vectorial perfecto, seleccionable, buscable, ~50KB en vez de ~1MB. */

const MONTSERRAT_URLS = {
  normal: 'https://cdn.jsdelivr.net/gh/JulietaUla/Montserrat@master/fonts/ttf/Montserrat-Regular.ttf',
  italic: 'https://cdn.jsdelivr.net/gh/JulietaUla/Montserrat@master/fonts/ttf/Montserrat-MediumItalic.ttf',
  bold:   'https://cdn.jsdelivr.net/gh/JulietaUla/Montserrat@master/fonts/ttf/Montserrat-Bold.ttf'
};
const MONTSERRAT_CACHE_KEY = 'lla_montserrat_ttf_v1';

async function loadMontserratFonts() {
  // Intentar cache
  try {
    const cached = localStorage.getItem(MONTSERRAT_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}
  // Fetch desde CDN
  const out = {};
  for (const [key, url] of Object.entries(MONTSERRAT_URLS)) {
    const buf = await fetch(url, { mode: 'cors' }).then(r => {
      if (!r.ok) throw new Error('No se pudo descargar Montserrat ' + key + ' (' + r.status + ')');
      return r.arrayBuffer();
    });
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    out[key] = btoa(bin);
  }
  try { localStorage.setItem(MONTSERRAT_CACHE_KEY, JSON.stringify(out)); } catch {}
  return out;
}

// Carga Montserrat (Regular/Bold/MediumItalic) en document.fonts como 'MontserratEmbed'.
// Lo usamos para el render IG nativo a canvas — garantiza que Canvas 2D
// renderice con la fuente correcta (mismo problema de html2canvas con web fonts).
let _montserratEmbedPromise = null;
async function ensureMontserratEmbedded() {
  if (_montserratEmbedPromise) return _montserratEmbedPromise;
  _montserratEmbedPromise = (async () => {
    const fonts = await loadMontserratFonts();
    const make = async (b64, weight, style) => {
      const ff = new FontFace('MontserratEmbed',
        'url(data:font/ttf;base64,' + b64 + ')',
        { weight, style });
      const loaded = await ff.load();
      document.fonts.add(loaded);
      return loaded;
    };
    await Promise.all([
      make(fonts.normal, '400', 'normal'),
      make(fonts.bold,   '700', 'normal'),
      make(fonts.italic, '500', 'italic')
    ]);
    // Pre-cargar tamaños grandes que va a usar el IG
    if (document.fonts && document.fonts.load) {
      await Promise.all([
        document.fonts.load('700 44px MontserratEmbed'),
        document.fonts.load('800 48px MontserratEmbed'),
        document.fonts.load('500 italic 28px MontserratEmbed'),
        document.fonts.load('400 26px MontserratEmbed')
      ]);
    }
    return true;
  })();
  return _montserratEmbedPromise;
}

// Wrap de texto a un ancho dado usando el ctx.measureText del canvas.
// Respeta espacios duros (no rompe palabras a la mitad).
function wrapTextCanvas(ctx, text, maxWidth) {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    const w = ctx.measureText(test).width;
    if (w > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Carga un dataUrl a un Image decodificado (o null).
function _igLoadImg(dataUrl) {
  return new Promise(resolve => {
    if (!dataUrl) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Pagina el cuerpo en slides 1080×1350 manteniendo la fuente legible (sin achicar).
// Cada slide = array de { text, gap } (gap px antes de la línea). Pure: usa measureCtx solo para medir.
// Devuelve { slides, linksSlide }.
function computeIGSlides(measureCtx, paragraphs, bodySize, titleH, subH, linksH) {
  const lineH = bodySize * 1.55;
  const paraGap = lineH * 0.55;
  const bodyTop0 = IG_BANNER_H + 48 + titleH + subH;  // primera slide: deja lugar para título+subtítulo
  const bodyTopN = IG_BANNER_H + 56;                   // slides de continuación: arrancan bajo el banner
  const bodyBottom = IG_H - IG_FOOTER_H - 20;
  const CW = IG_W - 160;
  measureCtx.font = '400 ' + bodySize + 'px MontserratEmbed';

  const slides = [[]];
  let si = 0;
  let y = bodyTop0;
  const newSlide = () => { slides.push([]); si++; y = bodyTopN; };

  paragraphs.forEach(para => {
    const lines = wrapTextCanvas(measureCtx, para, CW);
    const slideHasContent = slides[si].length > 0;
    const paraH = (slideHasContent ? paraGap : 0) + lines.length * lineH;
    // Si el párrafo entero no entra en lo que queda de la slide → pasar a nueva slide
    // (corte limpio en límite de párrafo, como los comunicados oficiales).
    if (slideHasContent && y + paraH > bodyBottom) newSlide();
    // Colocar líneas; solo partir el párrafo si por sí solo es más alto que una slide entera.
    lines.forEach((line, li) => {
      const firstOfSlide = slides[si].length === 0;
      const gap = (li === 0 && !firstOfSlide) ? paraGap : 0;
      if (!firstOfSlide && y + gap + lineH > bodyBottom) {
        newSlide();
        slides[si].push({ text: line, gap: 0 });
        y += lineH;
      } else {
        slides[si].push({ text: line, gap });
        y += gap + lineH;
      }
    });
  });
  // Links: en la última slide si entran; si no, nueva slide
  let linksSlide = si;
  if (linksH > 0 && (y + 30 + linksH > bodyBottom)) {
    newSlide(); linksSlide = si;
  }
  return { slides, linksSlide };
}

// Predice cuántas slides (imágenes IG) genera el contenido actual al tamaño base. Para el chip en vivo.
function predictIGSlides() {
  if (!predictIGSlides._ctx) predictIGSlides._ctx = document.createElement('canvas').getContext('2d');
  const ctx = predictIGSlides._ctx;
  const CW = IG_W - 160;
  const titulo = (document.getElementById('comunicadoTitulo')?.value || '').trim();
  const subtitulo = (document.getElementById('comunicadoSubtitulo')?.value || '').trim();
  const linkLabel = (document.getElementById('comunicadoLinkLabel')?.value || '').trim();
  const linkUrl = (document.getElementById('comunicadoLinkUrl')?.value || '').trim();
  const cuerpo = (document.getElementById('comunicadoCuerpo')?.value || '').trim();

  ctx.font = '800 48px MontserratEmbed, Montserrat, sans-serif';
  const titleH = wrapTextCanvas(ctx, titulo || 'Título del comunicado', CW).length * 48 * 1.18 + 18;
  let subH = 16;
  if (subtitulo) { ctx.font = '500 italic 28px MontserratEmbed, Montserrat, sans-serif'; subH = wrapTextCanvas(ctx, subtitulo, CW).length * 28 * 1.3 + 32; }
  const linksH = (linkLabel || linkUrl) ? 80 : 0;
  const paragraphs = cuerpo ? cuerpo.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean) : [];
  const { slides } = computeIGSlides(ctx, paragraphs, IG_BASE_BODY, titleH, subH, linksH);
  return { slideCount: slides.length };
}

// Render IG nativo 1080×1350 (4:5). Pagina en carrusel si el contenido no entra en 1 imagen,
// manteniendo la fuente grande/legible (patrón de los comunicados oficiales). Sin html2canvas.
// Devuelve { canvases: [...], slideCount }.
async function renderIGNative({ city, titulo, subtitulo, cuerpo, linkLabel, linkUrl, blancoLogo, violetaLogo }) {
  await ensureMontserratEmbedded();
  const W = IG_W, H = IG_H, ML = 80, CW = W - 160;
  const BANNER_H = IG_BANNER_H, FOOTER_H = IG_FOOTER_H, bodySize = IG_BASE_BODY;
  const lineH = bodySize * 1.55;

  const blancoImg = await _igLoadImg(blancoLogo && blancoLogo.dataUrl);
  const violetaImg = await _igLoadImg(violetaLogo && violetaLogo.dataUrl);

  // Medir título / subtítulo (van solo en la primera slide)
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = '800 48px MontserratEmbed';
  const titleLines = wrapTextCanvas(measure, titulo || 'Título del comunicado', CW);
  const titleLineH = 48 * 1.18;
  const titleH = titleLines.length * titleLineH + 18;
  const subSize = 28, subLineH = subSize * 1.3;
  let subLines = [];
  if (subtitulo) { measure.font = '500 italic ' + subSize + 'px MontserratEmbed'; subLines = wrapTextCanvas(measure, subtitulo, CW); }
  const subH = subtitulo ? (subLines.length * subLineH + 32) : 16;
  const linksH = (linkLabel || linkUrl) ? 80 : 0;

  const paragraphs = (cuerpo || '').split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const { slides, linksSlide } = computeIGSlides(measure, paragraphs, bodySize, titleH, subH, linksH);
  const total = slides.length;

  const canvases = [];
  for (let s = 0; s < total; s++) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

    // ── Banner (en todas las slides) ──
    ctx.fillStyle = '#371959'; ctx.fillRect(0, 0, W, BANNER_H);
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = '700 42px MontserratEmbed'; ctx.fillText('COMUNICADO', 64, 82);
    ctx.font = '400 30px MontserratEmbed'; ctx.fillText('OFICIAL', 64, 124);
    if (blancoImg) {
      const logoH = 90, logoW = logoH * (blancoImg.naturalWidth / blancoImg.naturalHeight);
      const logoX = W - 64 - logoW, logoY = 26;
      ctx.drawImage(blancoImg, logoX, logoY, logoW, logoH);
      const cityText = (city || '').toUpperCase();
      let cs = 21; const rightEdge = W - 28, maxCityW = rightEdge - 28;
      ctx.font = '700 ' + cs + 'px MontserratEmbed'; let cw = ctx.measureText(cityText).width;
      while (cw > maxCityW && cs > 12) { cs--; ctx.font = '700 ' + cs + 'px MontserratEmbed'; cw = ctx.measureText(cityText).width; }
      let cx = logoX + logoW / 2;
      if (cx + cw / 2 > rightEdge) cx = rightEdge - cw / 2;
      if (cx - cw / 2 < 28) cx = 28 + cw / 2;
      ctx.textAlign = 'center'; ctx.fillText(cityText, cx, logoY + logoH + 20);
    }

    // ── Título + subtítulo (solo slide 0) ──
    let y;
    ctx.fillStyle = '#1a1a1a'; ctx.textBaseline = 'top';
    if (s === 0) {
      y = BANNER_H + 48;
      ctx.textAlign = 'center';
      ctx.font = '800 48px MontserratEmbed';
      titleLines.forEach(l => { ctx.fillText(l, W / 2, y); y += titleLineH; });
      y += 18;
      if (subtitulo) {
        ctx.font = '500 italic ' + subSize + 'px MontserratEmbed';
        subLines.forEach(l => { ctx.fillText(l, W / 2, y); y += subLineH; });
        y += 32;
      } else { y += 16; }
    } else {
      y = BANNER_H + 56;
    }

    // ── Cuerpo de esta slide ──
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '400 ' + bodySize + 'px MontserratEmbed'; ctx.fillStyle = '#1a1a1a';
    slides[s].forEach(item => {
      y += item.gap;
      ctx.fillText(item.text, ML, y);
      y += lineH;
    });

    // ── Links (en su slide) ──
    if (linksH > 0 && s === linksSlide) {
      y += 30;
      if (linkLabel) { ctx.font = '700 22px MontserratEmbed'; ctx.fillStyle = '#1a1a1a'; ctx.fillText(linkLabel, ML, y); y += 30; }
      if (linkUrl) { ctx.font = '500 22px MontserratEmbed'; ctx.fillStyle = '#371959'; ctx.fillText(linkUrl, ML, y); }
    }

    // ── Footer (en todas) ──
    if (violetaImg) {
      const fH = 110, fW = fH * (violetaImg.naturalWidth / violetaImg.naturalHeight);
      ctx.drawImage(violetaImg, (W - fW) / 2, H - FOOTER_H + 45, fW, fH);
    }

    canvases.push(canvas);
  }

  return { canvases, slideCount: total };
}

async function loadImageAsDataUrl(src) {
  try {
    const blob = await fetch(src).then(r => r.blob());
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    // Medir dimensiones naturales para preservar aspect ratio
    const dims = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch (e) {
    console.warn('No se pudo cargar imagen:', src, e.message);
    return null;
  }
}

async function exportComunicadoPDFNative() {
  showLoading('Cargando fuentes Montserrat...');
  document.body.classList.add('exporting');
  let fonts, blancoLogo, violetaLogo;
  try {
    [fonts, blancoLogo, violetaLogo] = await Promise.all([
      loadMontserratFonts(),
      loadImageAsDataUrl('LLA BLANCO.png'),
      loadImageAsDataUrl('LLA VIOLETA.png')
    ]);
  } catch (e) {
    document.body.classList.remove('exporting');
    hideLoading();
    showToast('Error cargando recursos: ' + e.message, 'error', 5000);
    return;
  }

  showLoading('Generando PDF A4...');
  const auditInfo = await prepareAuditStamp();
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

    // Embebido de Montserrat
    pdf.addFileToVFS('Montserrat-Regular.ttf', fonts.normal);
    pdf.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal');
    pdf.addFileToVFS('Montserrat-Italic.ttf', fonts.italic);
    pdf.addFont('Montserrat-Italic.ttf', 'Montserrat', 'italic');
    pdf.addFileToVFS('Montserrat-Bold.ttf', fonts.bold);
    pdf.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold');

    // Contenido
    const cityRaw = (document.getElementById('cityInput').value || 'RÍO NEGRO');
    const city = cityRaw.toUpperCase();
    const titulo = (document.getElementById('comunicadoTitulo').value || '').trim() || 'Título del comunicado';
    const subtitulo = (document.getElementById('comunicadoSubtitulo').value || '').trim();
    const cuerpo = (document.getElementById('comunicadoCuerpo').value || '').trim();
    const linkLabel = (document.getElementById('comunicadoLinkLabel').value || '').trim();
    const linkUrl = (document.getElementById('comunicadoLinkUrl').value || '').trim();

    // Layout en mm
    const PAGE_W = 210, PAGE_H = 297;
    const ML = 18, MR = 18;
    const CW = PAGE_W - ML - MR;          // ancho contenido
    const BANNER_H = 28;
    const FOOTER_RESERVE = 28;            // espacio para el logo footer
    const BODY_BOTTOM = PAGE_H - FOOTER_RESERVE;
    const VIOLET = [55, 25, 89];          // #371959
    const INK = [26, 26, 26];             // #1a1a1a

    function drawBanner() {
      pdf.setFillColor(...VIOLET);
      pdf.rect(0, 0, PAGE_W, BANNER_H, 'F');
      // "COMUNICADO OFICIAL"
      pdf.setFont('Montserrat', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(255, 255, 255);
      pdf.text('COMUNICADO OFICIAL', ML, 17);
      // Logo blanco + ciudad: agrupados a la derecha y centrados entre sí
      pdf.setFont('Montserrat', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(255, 255, 255);
      if (blancoLogo) {
        const targetH = 13; // mm
        const w = targetH * (blancoLogo.w / blancoLogo.h);
        const eagleX = PAGE_W - MR - w;
        const eagleY = 4;
        try { pdf.addImage(blancoLogo.dataUrl, 'PNG', eagleX, eagleY, w, targetH); } catch {}
        // Ciudad centrada bajo el águila
        pdf.text(city, eagleX + w / 2, eagleY + targetH + 4, { align: 'center' });
      } else {
        pdf.text(city, PAGE_W - MR, BANNER_H - 5, { align: 'right' });
      }
    }

    function drawFooter() {
      if (violetaLogo) {
        const targetH = 14; // mm
        const w = targetH * (violetaLogo.w / violetaLogo.h);
        try { pdf.addImage(violetaLogo.dataUrl, 'PNG', (PAGE_W - w) / 2, PAGE_H - FOOTER_RESERVE + 6, w, targetH); } catch {}
      }
    }

    // Página 1
    drawBanner();
    let y = BANNER_H + 12;
    const PT_TO_MM = 0.3528;              // 1pt en mm
    const lh = (sizePt, factor) => sizePt * factor * PT_TO_MM;

    // Tamaños configurables por el usuario (editor de texto)
    const titleSize = currentTextSizes.comTitulo || 16;
    const bodySize = currentTextSizes.comBody || 13;

    // Título
    pdf.setFont('Montserrat', 'bold');
    pdf.setFontSize(titleSize);
    pdf.setTextColor(...INK);
    const tituloLines = pdf.splitTextToSize(titulo, CW);
    const tituloLineH = lh(titleSize, 1.35);
    tituloLines.forEach(line => {
      pdf.text(line, PAGE_W / 2, y, { align: 'center' });
      y += tituloLineH;
    });
    y += 3;

    // Subtítulo (opcional)
    if (subtitulo) {
      pdf.setFont('Montserrat', 'italic');
      pdf.setFontSize(13);
      const subLines = pdf.splitTextToSize(subtitulo, CW);
      const subLineH = lh(13, 1.4);
      subLines.forEach(line => {
        pdf.text(line, PAGE_W / 2, y, { align: 'center' });
        y += subLineH;
      });
      y += 6;
    } else {
      y += 4;
    }

    // Cuerpo
    pdf.setFont('Montserrat', 'normal');
    pdf.setFontSize(bodySize);
    pdf.setTextColor(...INK);
    const bodyLineH = lh(bodySize, 1.55);
    const paraGap = bodyLineH * 0.65;

    // Restaura el estilo del cuerpo (drawBanner deja el estado en blanco/bold/7pt).
    // Sin esto, el texto del cuerpo en la página 2+ sale BLANCO sobre fondo blanco = invisible.
    const applyBodyStyle = () => {
      pdf.setFont('Montserrat', 'normal');
      pdf.setFontSize(bodySize);
      pdf.setTextColor(...INK);
    };

    const paragraphs = cuerpo ? cuerpo.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean) : [];
    paragraphs.forEach((para, idx) => {
      const lines = pdf.splitTextToSize(para, CW);
      lines.forEach(line => {
        if (y + bodyLineH > BODY_BOTTOM) {
          pdf.addPage();
          drawBanner();
          applyBodyStyle();   // ← re-aplicar negro/normal/bodySize tras el banner
          y = BANNER_H + 12;
        }
        pdf.text(line, ML, y);
        y += bodyLineH;
      });
      if (idx < paragraphs.length - 1) y += paraGap;
    });

    // Links
    if (linkLabel || linkUrl) {
      y += 6;
      if (y + 12 > BODY_BOTTOM) {
        pdf.addPage();
        drawBanner();
        y = BANNER_H + 12;
      }
      if (linkLabel) {
        pdf.setFont('Montserrat', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(...INK);
        pdf.text(linkLabel, ML, y);
        y += lh(10, 1.5);
      }
      if (linkUrl) {
        pdf.setFont('Montserrat', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(...VIOLET);
        try { pdf.textWithLink(linkUrl, ML, y, { url: linkUrl }); }
        catch { pdf.text(linkUrl, ML, y); }
      }
    }

    // Footer en TODAS las páginas (el águila violeta cierra cada hoja)
    const pageCount = pdf.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      pdf.setPage(p);
      drawFooter();
    }
    pdf.setPage(pageCount);

    // Metadatos
    pdf.setProperties({
      title: 'Comunicado LLA - ' + cityRaw,
      subject: titulo,
      author: auditInfo ? auditInfo.user : 'La Libertad Avanza Río Negro',
      creator: 'Herramienta Partidaria LLA Río Negro',
      keywords: 'LLA, comunicado, ' + cityRaw + (auditInfo ? ', ref:' + auditInfo.fingerprint : '')
    });

    const filename = 'Comunicado-LLA-' + cityRaw.replace(/\s+/g, '-') + '.pdf';
    const blob = pdf.output('blob');
    downloadBlob(blob, filename);
    logActivity('export_pdf', { city: cityRaw, mode: 'comunicado', pages: pageCount, fingerprint: auditInfo && auditInfo.fingerprint });
    showToast('✓ PDF generado (' + pageCount + ' ' + (pageCount === 1 ? 'página' : 'páginas') + '): ' + filename, 'success');
  } catch (e) {
    console.error('Error PDF nativo:', e);
    showToast('Error al generar PDF: ' + (e.message || e), 'error', 5000);
  }
  document.body.classList.remove('exporting');
  hideLoading();
}

async function exportPDF() {
  // Comunicado → renderer nativo con texto vectorial Montserrat
  if (currentMode === 'comunicado') {
    return exportComunicadoPDFNative();
  }
  showLoading('Generando PDF A4...');
  document.body.classList.add('exporting');
  // Cerrar drawer si está abierto y desenfocar elementos editables
  closeCityDrawer();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const auditInfo = await prepareAuditStamp();
  // Aguardar carga de fuentes web — crucial para que html2canvas mida texto correctamente
  await ensureFontsLoaded();
  await new Promise(r => setTimeout(r, 400));
  try {
    if (!window.jspdf || !window.html2canvas) throw new Error('Librerías no cargadas');
    const { jsPDF } = window.jspdf;
    const el = document.getElementById('document-preview');
    const mobile = isMobileDevice();
    const captureOpts = {
      scale: mobile ? 1.5 : 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: el.offsetWidth,
      height: A4_PX,
      windowWidth: el.offsetWidth,
      windowHeight: A4_PX
    };
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    // Multi-página: intenta paginar; si solo es 1 página, hace captura normal
    const multiCanvases = await captureAllPages(captureOpts);
    let pageCount;
    if (multiCanvases) {
      multiCanvases.forEach((canvas, i) => {
        const imgData = canvas.toDataURL('image/jpeg', mobile ? 0.88 : 0.95);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
      });
      pageCount = multiCanvases.length;
    } else if (el.scrollHeight > A4_PX + 60) {
      // Multi-página: capturar cada A4 individualmente (evita el bug de overlapping
      // de html2canvas al renderizar canvases gigantes).
      pageCount = Math.ceil(el.scrollHeight / A4_PX);
      for (let i = 0; i < pageCount; i++) {
        const pageOpts = {
          ...captureOpts,
          width: el.offsetWidth,
          height: A4_PX,
          y: i * A4_PX,                     // offset dentro del elemento
          windowWidth: el.offsetWidth,
          windowHeight: el.scrollHeight     // forzar a html2canvas a layoutear el doc completo
        };
        const canvas = await html2canvas(el, pageOpts);
        const imgData = canvas.toDataURL('image/jpeg', mobile ? 0.88 : 0.95);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
      }
    } else {
      // Single page
      const singleOpts = { ...captureOpts, height: el.offsetHeight, windowHeight: el.offsetHeight };
      const canvas = await html2canvas(el, singleOpts);
      const imgData = canvas.toDataURL('image/jpeg', mobile ? 0.88 : 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
      pageCount = 1;
    }
    const city = document.getElementById('cityInput').value.trim() || 'General Roca';
    // Metadatos del PDF
    pdf.setProperties({
      title: 'Membrete LLA - ' + city,
      subject: 'Documento partidario La Libertad Avanza - ' + city,
      author: auditInfo ? auditInfo.user : 'LLA',
      creator: 'Herramienta Partidaria LLA Río Negro',
      keywords: 'LLA, Río Negro, ' + city + (auditInfo ? ', ref:' + auditInfo.fingerprint : '')
    });
    const filename = 'Membrete-LLA-' + city.replace(/\s+/g,'-') + '.pdf';
    const blob = pdf.output('blob');
    downloadBlob(blob, filename);
    logActivity('export_pdf', { city, fingerprint: auditInfo && auditInfo.fingerprint, pages: pageCount });
    showToast('✓ PDF generado (' + pageCount + ' ' + (pageCount === 1 ? 'página' : 'páginas') + '): ' + filename, 'success');
  } catch(e) {
    console.error('Error PDF:', e);
    showToast('Error al generar PDF: ' + (e.message || e), 'error', 5000);
  }
  document.body.classList.remove('exporting');
  hideLoading();
}

// ═══════════════ EXPORT INSTAGRAM 1080×1350 (4:5) ═══════════════
async function exportInstagram() {
  // Validar que estamos en modo comunicado
  if (currentMode !== 'comunicado') {
    showToast('Solo disponible en modo Comunicado', 'error', 3000);
    return;
  }
  const titulo = document.getElementById('comunicadoTitulo').value.trim();
  const cuerpo = document.getElementById('comunicadoCuerpo').value.trim();
  if (!titulo || !cuerpo) {
    showToast('Completá título y cuerpo antes de exportar', 'error', 3000);
    return;
  }

  // Render NATIVO con Canvas 2D + Montserrat embebido (mismo approach que el PDF nativo).
  // html2canvas tiene el bug de superposición de caracteres con Montserrat — aquí lo evitamos
  // dibujando texto directo con ctx.fillText sobre fuente cargada vía FontFace API.
  showLoading('Cargando fuentes Montserrat...');
  let blancoLogo, violetaLogo;
  try {
    [, blancoLogo, violetaLogo] = await Promise.all([
      ensureMontserratEmbedded(),
      loadImageAsDataUrl('LLA BLANCO.png'),
      loadImageAsDataUrl('LLA VIOLETA.png')
    ]);
  } catch (e) {
    hideLoading();
    showToast('Error cargando recursos: ' + e.message, 'error', 5000);
    return;
  }

  showLoading('Generando imagen Instagram 1080×1350...');
  try {
    const cityRaw = document.getElementById('cityInput').value || 'RÍO NEGRO';
    const city = cityRaw.toUpperCase();
    const subtitulo = (document.getElementById('comunicadoSubtitulo')?.value || '').trim();
    const linkLabel = document.getElementById('comunicadoLinkLabel').value.trim();
    const linkUrl = document.getElementById('comunicadoLinkUrl').value.trim();

    const { canvases, slideCount } = await renderIGNative({
      city, titulo, subtitulo, cuerpo, linkLabel, linkUrl, blancoLogo, violetaLogo
    });

    // Descargar cada slide del carrusel como PNG numerado
    const cityClean = cityRaw.replace(/\s+/g, '-');
    for (let i = 0; i < canvases.length; i++) {
      const dataUrl = canvases[i].toDataURL('image/png', 1.0);
      const suffix = slideCount > 1 ? ('-' + (i + 1)) : '';
      const link = document.createElement('a');
      link.download = 'Comunicado-IG-' + cityClean + suffix + '.png';
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Pausa entre descargas para que el navegador no bloquee la segunda+
      if (i < canvases.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    if (typeof logActivity === 'function') {
      logActivity('export_instagram', { city: cityRaw, titulo: titulo.slice(0, 80), slides: slideCount });
    }

    if (slideCount > 1) {
      showToast('✓ Carrusel de ' + slideCount + ' imágenes listo (1080×1350 c/u) — subilas en orden', 'success', 5000);
    } else {
      showToast('✓ Imagen Instagram lista (1080×1350)', 'success', 3000);
    }
  } catch (e) {
    console.error('Export IG falló:', e);
    showToast('Error al generar la imagen: ' + e.message, 'error', 4000);
  } finally {
    hideLoading();
  }
}

async function exportJPG() {
  showLoading('Generando imagen JPG...');
  document.body.classList.add('exporting');
  closeCityDrawer();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  await prepareAuditStamp();
  await ensureFontsLoaded();
  await new Promise(r => setTimeout(r, 400));
  try {
    if (!window.html2canvas) throw new Error('Librería html2canvas no cargada');
    const el = document.getElementById('document-preview');
    const mobile = isMobileDevice();
    const canvas = await html2canvas(el, {
      scale: mobile ? 1.5 : 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: el.offsetWidth,
      height: el.offsetHeight,
      windowWidth: el.offsetWidth,
      windowHeight: el.offsetHeight
    });
    const city = document.getElementById('cityInput').value.trim() || 'General Roca';
    const filename = 'Membrete-LLA-' + city.replace(/\s+/g,'-') + '.jpg';
    // Convertir el canvas en Blob (con fallback a dataURL→Blob para navegadores viejos)
    const blob = await new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas vacío')), 'image/jpeg', mobile ? 0.88 : 0.95);
      } else {
        const dataUrl = canvas.toDataURL('image/jpeg', mobile ? 0.88 : 0.95);
        fetch(dataUrl).then(r => r.blob()).then(resolve).catch(reject);
      }
    });
    downloadBlob(blob, filename);
    logActivity('export_jpg', { city });
    showToast('✓ Imagen JPG generada: ' + filename, 'success');
  } catch(e) {
    console.error('Error JPG:', e);
    showToast('Error al generar JPG: ' + (e.message || e), 'error', 5000);
  }
  document.body.classList.remove('exporting');
  hideLoading();
}

function scaleDocument() { applyZoom(); }

// Re-escalar al rotar el dispositivo o cuando aparece/desaparece la barra del navegador
window.addEventListener('orientationchange', () => setTimeout(scaleDocument, 200));
window.addEventListener('load', () => setTimeout(scaleDocument, 100));

/* ════════════════════════════════════════════════════════════════
   AUTOGUARDADO + MÚLTIPLES BORRADORES
   ════════════════════════════════════════════════════════════════
   Estructura en localStorage:
     lla_drafts_v2 = { 'id1': { name, state, createdAt, updatedAt }, ... }
     lla_active_draft_v2 = 'id1' (cuál está activo en este dispositivo)
   STORAGE_KEY se mantiene por compatibilidad — al cargar lo migramos al primer draft.
   ════════════════════════════════════════════════════════════════ */
const STORAGE_KEY = 'lla_membrete_v1';           // legacy (migración)
const DRAFTS_KEY = 'lla_drafts_v2';
const ACTIVE_DRAFT_KEY = 'lla_active_draft_v2';
const PERSISTED_FIELDS = [
  'cityInput', 'dateInput', 'recipientTemplate', 'recipientName',
  'bodyText', 'signerName', 'signerDNI', 'signerRole',
  'comunicadoTitulo', 'comunicadoSubtitulo', 'comunicadoCuerpo', 'comunicadoLinkLabel', 'comunicadoLinkUrl'
];
let saveTimeout = null;

function generateDraftId() {
  return 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function getDrafts() {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}'); }
  catch { return {}; }
}
function persistDrafts(drafts) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}
function getActiveDraftId() { return localStorage.getItem(ACTIVE_DRAFT_KEY); }
function setActiveDraftId(id) { localStorage.setItem(ACTIVE_DRAFT_KEY, id); }

function currentFormState() {
  const state = {};
  PERSISTED_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) state[id] = el.value;
  });
  state._mode = (typeof currentMode !== 'undefined' && currentMode) ? currentMode : 'membrete';
  // Tamaños del editor de texto
  if (typeof getCurrentTextSizes === 'function') {
    state._textSizes = getCurrentTextSizes();
  }
  return state;
}

function deriveDraftName(state) {
  const city = state.cityInput || 'Sin ciudad';
  if (state._mode === 'comunicado') {
    const titulo = (state.comunicadoTitulo || '').trim();
    return 'Comunicado — ' + (titulo ? (titulo.length > 38 ? titulo.slice(0,38) + '…' : titulo) : city);
  }
  const tpl = state.recipientTemplate === 'concejal' ? 'Concejal' : 'Concejo';
  return tpl + ' — ' + city;
}

function saveState() {
  try {
    const drafts = getDrafts();
    let activeId = getActiveDraftId();
    const state = currentFormState();
    if (!activeId || !drafts[activeId]) {
      // No hay draft activo — crear uno
      activeId = generateDraftId();
      drafts[activeId] = {
        name: deriveDraftName(state),
        state,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      setActiveDraftId(activeId);
    } else {
      drafts[activeId].state = state;
      drafts[activeId].updatedAt = Date.now();
      // Si el name fue auto-derivado y la ciudad cambió, actualizar
      const existing = drafts[activeId].name;
      const auto = deriveDraftName(state);
      const wasAuto = !drafts[activeId].nameLocked;
      if (wasAuto) drafts[activeId].name = auto;
    }
    persistDrafts(drafts);
    flashSavedBadge();
    refreshDraftsBtnCount();
  } catch (e) {
    console.warn('No se pudo autoguardar:', e);
  }
}

function migrateLegacyDraft() {
  // Si existe lla_membrete_v1 pero todavía no hay drafts, migrar
  if (Object.keys(getDrafts()).length > 0) return;
  try {
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (!legacy) return;
    const oldState = JSON.parse(legacy);
    const id = generateDraftId();
    const newDraft = {
      name: deriveDraftName(oldState),
      state: oldState,
      createdAt: oldState._savedAt || Date.now(),
      updatedAt: oldState._savedAt || Date.now()
    };
    persistDrafts({ [id]: newDraft });
    setActiveDraftId(id);
    localStorage.removeItem(STORAGE_KEY); // limpiar legacy
  } catch {}
}

function applyDraftState(state) {
  if (!state) return;
  PERSISTED_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && state[id] != null) el.value = state[id];
  });
  const cityBtn = document.getElementById('cityBtnCurrent');
  if (cityBtn && state.cityInput) cityBtn.textContent = state.cityInput;
  // Restaurar tamaños del editor de texto
  if (typeof restoreTextSizes === 'function') restoreTextSizes(state._textSizes);
  // Restaurar modo (Nota / Comunicado)
  if (typeof switchMode === 'function') {
    switchMode(state._mode === 'comunicado' ? 'comunicado' : 'membrete');
  }
}

function restoreState() {
  migrateLegacyDraft();
  const drafts = getDrafts();
  let activeId = getActiveDraftId();
  if (!activeId || !drafts[activeId]) {
    // No hay drafts: arrancar limpio
    refreshDraftsBtnCount();
    return false;
  }
  const draft = drafts[activeId];
  applyDraftState(draft.state);
  if (draft.updatedAt) showRestoredBanner(draft.updatedAt);
  refreshDraftsBtnCount();
  return true;
}

function refreshDraftsBtnCount() {
  const count = Object.keys(getDrafts()).length;
  const el = document.getElementById('draftsBtnCount');
  if (el) el.textContent = count;
  const bn = document.getElementById('bottomNavDraftsCount');
  if (bn) {
    bn.textContent = count;
    bn.style.display = count > 0 ? 'flex' : 'none';
  }
}

// ─── Bottom Navigation (mobile) ───
function bottomNavSelect(target) {
  // Animar el active state
  document.querySelectorAll('.bottom-nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === target);
  });
  if (target === 'editor') {
    // Scroll al editor panel + cerrar drawers
    closeDraftsDrawer && closeDraftsDrawer();
    closeAdminDrawer && closeAdminDrawer();
    const ep = document.querySelector('.editor-panel');
    if (ep) ep.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (target === 'drafts') {
    openDraftsDrawer && openDraftsDrawer();
  } else if (target === 'export') {
    // Scroll al document preview (donde están los export inline) o trigger del export por defecto
    const dp = document.getElementById('document-preview');
    if (dp) dp.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Si es comunicado: ofrecer IG, si es nota: ofrecer PDF
    setTimeout(() => {
      if (typeof currentMode !== 'undefined' && currentMode === 'comunicado') {
        if (typeof exportInstagram === 'function') exportInstagram();
      } else {
        if (typeof exportPDF === 'function') exportPDF();
      }
    }, 400);
  } else if (target === 'admin') {
    openAdminDrawer && openAdminDrawer();
  }
}

function refreshBottomNavAdminVisibility() {
  const btn = document.querySelector('.bottom-nav-admin');
  if (!btn) return;
  const isAdmin = typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.role === 'admin';
  btn.style.display = isAdmin ? 'flex' : 'none';
  document.body.classList.add('has-bottom-nav');
}

/* ─── UI del drawer de borradores ─── */
function openDraftsDrawer() {
  saveState(); // snapshot del estado actual antes de mostrar
  renderDraftsList();
  document.getElementById('draftsDrawer').classList.add('open');
  document.getElementById('draftsBackdrop').classList.add('open');
}
function closeDraftsDrawer() {
  document.getElementById('draftsDrawer').classList.remove('open');
  document.getElementById('draftsBackdrop').classList.remove('open');
}

function renderDraftsList() {
  const list = document.getElementById('draftsList');
  if (!list) return;
  const drafts = getDrafts();
  const activeId = getActiveDraftId();
  const ids = Object.keys(drafts).sort((a, b) =>
    (drafts[b].updatedAt || 0) - (drafts[a].updatedAt || 0)
  );
  if (!ids.length) {
    list.innerHTML = '<div class="drafts-empty">' +
      '<span class="drafts-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>' +
      '<span>No hay borradores todavía</span>' +
      '<span class="drafts-empty-hint">Tus documentos se guardan solos mientras escribís. Empezá con "+ Nueva nota" o "+ Nuevo comunicado".</span>' +
      '</div>';
    return;
  }
  list.innerHTML = ids.map(id => {
    const d = drafts[id];
    const active = id === activeId;
    const city = (d.state && d.state.cityInput) || '—';
    const updatedRel = d.updatedAt ? formatRelativeTime(d.updatedAt) : '—';
    const updatedAbs = d.updatedAt ? formatAbsoluteDate(d.updatedAt) : '';
    const isCom = d.state && d.state._mode === 'comunicado';
    const bodyText = isCom ? (d.state.comunicadoCuerpo || '') : (d.state && d.state.bodyText) || '';
    const bodyChars = bodyText.length;
    const nameEsc = (d.name || '').replace(/"/g,'&quot;');
    const typeChip = isCom
      ? '<span class="draft-type-chip draft-type-com">Comunicado</span>'
      : '<span class="draft-type-chip draft-type-nota">Nota</span>';
    const titulo = isCom ? (d.state.comunicadoTitulo || '') : (d.state && d.state.bodyText || '').slice(0, 40);
    const subtitulo = isCom ? (d.state.comunicadoSubtitulo || '') : '';
    const bodyLineCount = Math.min(8, Math.max(2, Math.ceil(bodyChars / 80)));
    const thumb = '<div class="draft-thumb draft-thumb--' + (isCom ? 'com' : 'nota') + '" aria-hidden="true">' +
      '<div class="draft-thumb-banner"></div>' +
      (titulo ? '<div class="draft-thumb-title"></div>' : '') +
      (subtitulo ? '<div class="draft-thumb-sub"></div>' : '') +
      Array.from({ length: bodyLineCount }, () => '<div class="draft-thumb-line"></div>').join('') +
      '<div class="draft-thumb-foot"></div>' +
    '</div>';
    return `<div class="draft-card ${active?'active':''}" data-id="${id}">
      ${thumb}
      <div class="draft-name" onclick="event.stopPropagation();">
        <span style="flex:1; display:flex; align-items:center; gap:8px;" onclick="openDraft('${id}')">${typeChip}<span style="flex:1;">${escapeHtml(d.name || 'Sin nombre')}</span></span>
        <button class="draft-action-btn" onclick="renameDraft('${id}')" title="Renombrar">✎</button>
      </div>
      <div class="draft-meta">
        <span><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${escapeHtml(city)}</span>
        <span><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> ${bodyChars} chars</span>
        <span title="${updatedRel}"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${updatedAbs}</span>
      </div>
      <div class="draft-actions">
        <button class="draft-action-btn" onclick="openDraft('${id}')">${active?'Abierto':'Abrir'}</button>
        <button class="draft-action-btn" onclick="duplicateDraft('${id}')">Duplicar</button>
        <button class="draft-action-btn danger" onclick="deleteDraft('${id}')">Eliminar</button>
      </div>
    </div>`;
  }).join('');
  applyStagger(list, { delay: 30, max: 20 });
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatAbsoluteDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24*3600*1000);
  const sameDay = d.toDateString() === today.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  if (sameDay) return 'Hoy ' + hh + ':' + mm;
  if (isYesterday) return 'Ayer ' + hh + ':' + mm;
  // dd/mm/aaaa HH:MM (mismo año → sin año)
  const dd = String(d.getDate()).padStart(2,'0');
  const MM = String(d.getMonth()+1).padStart(2,'0');
  const sameYear = d.getFullYear() === today.getFullYear();
  return dd + '/' + MM + (sameYear ? '' : '/' + d.getFullYear()) + ' · ' + hh + ':' + mm;
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'hace instantes';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'hace ' + h + ' h';
  const d = new Date(ts);
  return d.toLocaleDateString('es-AR') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function createNewDraft(mode) {
  // Guardar el actual antes de cambiar
  saveState();
  const targetMode = (mode === 'comunicado') ? 'comunicado'
                   : (mode === 'membrete') ? 'membrete'
                   : (typeof currentMode !== 'undefined' ? currentMode : 'membrete');
  const id = generateDraftId();
  const drafts = getDrafts();
  const today = new Date();
  const iso = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  const count = Object.keys(drafts).length + 1;
  drafts[id] = {
    name: (targetMode === 'comunicado' ? 'Comunicado ' : 'Nota ') + count,
    state: {
      cityInput: 'General Roca',
      dateInput: iso,
      recipientTemplate: 'presidente',
      recipientName: '',
      bodyText: '',
      signerName: '',
      signerDNI: '',
      signerRole: '',
      comunicadoTitulo: '',
      comunicadoSubtitulo: '',
      comunicadoCuerpo: '',
      comunicadoLinkLabel: '',
      comunicadoLinkUrl: '',
      _mode: targetMode
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  persistDrafts(drafts);
  setActiveDraftId(id);
  applyDraftState(drafts[id].state);
  updatePreview();
  if (typeof autosizeBody === 'function') autosizeBody();
  if (typeof updateBodyCounter === 'function') updateBodyCounter();
  renderDraftsList();
  refreshDraftsBtnCount();
  showToast('✓ Nuevo borrador creado', 'success', 2500);
}

function openDraft(id) {
  // Guardar el actual primero
  saveState();
  const drafts = getDrafts();
  if (!drafts[id]) return;
  setActiveDraftId(id);
  applyDraftState(drafts[id].state);
  updatePreview();
  if (typeof autosizeBody === 'function') autosizeBody();
  if (typeof updateBodyCounter === 'function') updateBodyCounter();
  renderDraftsList();
  closeDraftsDrawer();
  showToast('📁 Abriste: ' + drafts[id].name, 'info', 2000);
}

function renameDraft(id) {
  const drafts = getDrafts();
  if (!drafts[id]) return;
  const newName = prompt('Nombre del borrador:', drafts[id].name);
  if (newName == null) return;
  const trimmed = newName.trim();
  if (!trimmed) return;
  drafts[id].name = trimmed;
  drafts[id].nameLocked = true; // ya no autoderivamos el nombre
  persistDrafts(drafts);
  renderDraftsList();
}

function duplicateDraft(id) {
  const drafts = getDrafts();
  if (!drafts[id]) return;
  const newId = generateDraftId();
  drafts[newId] = {
    name: drafts[id].name + ' (copia)',
    state: { ...drafts[id].state },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nameLocked: true
  };
  persistDrafts(drafts);
  renderDraftsList();
  refreshDraftsBtnCount();
  showToast('✓ Borrador duplicado', 'success', 2000);
}

function deleteDraft(id) {
  const drafts = getDrafts();
  if (!drafts[id]) return;
  if (!confirm('¿Eliminar el borrador "' + drafts[id].name + '"? Esta acción no se puede deshacer.')) return;
  const wasActive = getActiveDraftId() === id;
  delete drafts[id];
  persistDrafts(drafts);
  if (wasActive) {
    const remainingIds = Object.keys(drafts);
    if (remainingIds.length > 0) {
      // Abrir el siguiente más reciente
      const sortedIds = remainingIds.sort((a, b) => (drafts[b].updatedAt || 0) - (drafts[a].updatedAt || 0));
      openDraft(sortedIds[0]);
    } else {
      // No quedan: crear uno nuevo en blanco
      createNewDraft();
    }
  }
  renderDraftsList();
  refreshDraftsBtnCount();
  showToast('🗑 Borrador eliminado', 'info', 2000);
}

/* ════════════════════════════════════════════════════════════════
   HISTORIAL UNDO/REDO
   ════════════════════════════════════════════════════════════════ */
const HISTORY_MAX = 50;
const HISTORY_FIELDS = ['cityInput','dateInput','recipientTemplate','recipientName','bodyText','signerName','signerDNI','signerRole'];
let historyStack = [];   // snapshots pasados
let redoStack = [];      // para rehacer después de un undo
let isRestoringHistory = false; // flag para evitar pushes durante apply
let historyDebounce = null;

function takeSnapshot() {
  const snap = {};
  HISTORY_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) snap[id] = el.value;
  });
  return snap;
}

function applySnapshot(s) {
  if (!s) return;
  isRestoringHistory = true;
  HISTORY_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && s[id] != null) el.value = s[id];
  });
  // Sincronizar UI dependiente
  const cityBtn = document.getElementById('cityBtnCurrent');
  if (cityBtn) cityBtn.textContent = s.cityInput || 'General Roca';
  updatePreview();
  if (typeof autosizeBody === 'function') autosizeBody();
  if (typeof updateBodyCounter === 'function') updateBodyCounter();
  // Persistir en localStorage (setear value programáticamente no dispara 'input')
  if (typeof saveState === 'function') saveState();
  setTimeout(() => { isRestoringHistory = false; }, 50);
}

function pushHistorySnapshot() {
  if (isRestoringHistory) return;
  const s = takeSnapshot();
  const last = historyStack[historyStack.length - 1];
  if (last && JSON.stringify(last) === JSON.stringify(s)) return;
  historyStack.push(s);
  if (historyStack.length > HISTORY_MAX) historyStack.shift();
  redoStack = []; // nueva acción invalida el redo
  updateUndoRedoUI();
}

function scheduleHistorySnapshot() {
  clearTimeout(historyDebounce);
  historyDebounce = setTimeout(pushHistorySnapshot, 600);
}

function undo() {
  if (historyStack.length < 2) return;
  const current = historyStack.pop();
  redoStack.push(current);
  const prev = historyStack[historyStack.length - 1];
  applySnapshot(prev);
  updateUndoRedoUI();
  showToast && showToast('↶ Acción deshecha', 'info', 1500);
}

function redo() {
  if (!redoStack.length) return;
  const s = redoStack.pop();
  historyStack.push(s);
  applySnapshot(s);
  updateUndoRedoUI();
  showToast && showToast('↷ Acción rehecha', 'info', 1500);
}

function updateUndoRedoUI() {
  const u = document.getElementById('undoBtn');
  const r = document.getElementById('redoBtn');
  if (u) u.disabled = historyStack.length < 2;
  if (r) r.disabled = redoStack.length === 0;
}

function bindHistory() {
  // Snapshot inicial
  pushHistorySnapshot();
  // Cada cambio en los campos dispara un snapshot debounced
  HISTORY_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, scheduleHistorySnapshot);
  });
  // Edición inline en el doc también
  ['docBodyBlocks','docSignerLabel','docDNILabel'].forEach(id => {
    const el = document.getElementById(id);
    el && el.addEventListener('input', scheduleHistorySnapshot);
  });
  updateUndoRedoUI();
}

/* ════════════════════════════════════════════════════════════════
   ATAJOS DE TECLADO
   ════════════════════════════════════════════════════════════════ */
function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    const target = e.target;
    const inBody = target && target.id === 'bodyText';
    // Formato dentro del textarea del cuerpo
    if (inBody && key === 'b') { e.preventDefault(); applyFormat('bold'); return; }
    if (inBody && key === 'i') { e.preventDefault(); applyFormat('italic'); return; }
    if (inBody && key === 'u') { e.preventDefault(); applyFormat('underline'); return; }
    // Acciones globales
    if (key === 's') { e.preventDefault(); exportPDF(); }
    else if (key === 'p') { e.preventDefault(); window.print && window.print(); }
    else if (key === 'k') { e.preventDefault(); openCityDrawer(); }
    else if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); }
  });
}

function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveState, 400);
}

function flashSavedBadge() {
  const b = document.getElementById('savedBadge');
  if (!b) return;
  b.classList.add('flash');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove('flash'), 600);
}

function bindAutosave() {
  // Hook todos los inputs persistidos
  PERSISTED_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, scheduleSave);
  });
  // Edición inline también dispara autoguardado (los inputs ocultos ya se sincronizan)
  ['docBodyBlocks','docSignerLabel','docDNILabel'].forEach(id => {
    const el = document.getElementById(id);
    el && el.addEventListener('input', scheduleSave);
  });
}

/* ════════════════════════════════════════════════════════════════
   COMPARTIR (Web Share API)
   ════════════════════════════════════════════════════════════════ */
async function generatePdfBlob() {
  if (!window.jspdf || !window.html2canvas) throw new Error('Librerías no cargadas');
  const auditInfo = await prepareAuditStamp();
  await ensureFontsLoaded();
  const { jsPDF } = window.jspdf;
  const el = document.getElementById('document-preview');
  const mobile = isMobileDevice();
  const canvas = await html2canvas(el, {
    scale: mobile ? 1.5 : 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: el.offsetWidth,
    height: el.offsetHeight,
    windowWidth: el.offsetWidth,
    windowHeight: el.offsetHeight
  });
  const imgData = canvas.toDataURL('image/jpeg', mobile ? 0.88 : 0.95);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
  const city = document.getElementById('cityInput').value.trim() || 'General Roca';
  pdf.setProperties({
    title: 'Membrete LLA - ' + city,
    subject: 'Documento partidario La Libertad Avanza - ' + city,
    author: auditInfo ? auditInfo.user : 'LLA',
    creator: 'Herramienta Partidaria LLA Río Negro',
    keywords: 'LLA, Río Negro, ' + city + (auditInfo ? ', ref:' + auditInfo.fingerprint : '')
  });
  return pdf.output('blob');
}

async function shareDocument() {
  if (!navigator.share) {
    alert('Tu navegador no soporta el botón Compartir. Usá "Exportar PDF" y luego compartilo manualmente.');
    return;
  }
  showLoading('Preparando para compartir...');
  document.body.classList.add('exporting');
  closeCityDrawer();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  await new Promise(r => setTimeout(r, 150));
  try {
    const blob = await generatePdfBlob();
    const city = document.getElementById('cityInput').value.trim() || 'General Roca';
    const filename = 'Membrete-LLA-' + city.replace(/\s+/g,'-') + '.pdf';
    const file = new File([blob], filename, { type: 'application/pdf' });
    const shareData = {
      files: [file],
      title: 'Membrete LLA - ' + city,
      text: 'Membrete oficial La Libertad Avanza - ' + city
    };
    if (navigator.canShare && !navigator.canShare(shareData)) {
      // No puede compartir archivos: probar solo texto/URL
      delete shareData.files;
    }
    await navigator.share(shareData);
    logActivity('share_pdf', { city });
    showToast('✓ Documento compartido', 'success');
  } catch(e) {
    if (e.name !== 'AbortError') {
      console.error('Share error:', e);
      showToast('No se pudo compartir: ' + (e.message || e), 'error', 5000);
    }
  }
  document.body.classList.remove('exporting');
  hideLoading();
}

function setupShareButton() {
  // Mostrar botón "Compartir" solo si el navegador soporta Web Share API con archivos
  if (!navigator.share) return;
  const btn = document.getElementById('shareBtn');
  if (btn) btn.style.display = '';
}

/* ════════════════════════════════════════════════════════════════
   VALIDACIÓN PRE-EXPORTACIÓN
   ════════════════════════════════════════════════════════════════ */
function validateForm() {
  const missing = [];
  if (currentMode === 'comunicado') {
    const titulo = document.getElementById('comunicadoTitulo').value.trim();
    const cuerpo = document.getElementById('comunicadoCuerpo').value.trim();
    if (!titulo) missing.push('Título del comunicado');
    if (!cuerpo) missing.push('Cuerpo del comunicado');
    return missing;
  }
  // modo membrete (nota oficial)
  const city = document.getElementById('cityInput').value.trim();
  const recipName = document.getElementById('recipientName').value.trim();
  const body = document.getElementById('bodyText').value.trim();
  const signerName = document.getElementById('signerName').value.trim();
  const signerDNI = document.getElementById('signerDNI').value.trim();
  const signerRole = document.getElementById('signerRole').value.trim();

  if (!city) missing.push('Seleccionar la ciudad / localidad');
  if (!recipName) missing.push('Nombre del destinatario');
  if (!body) missing.push('Cuerpo del documento');
  if (!signerName) missing.push('Nombre del firmante');
  if (!signerDNI) missing.push('DNI del firmante');
  if (!signerRole) missing.push('Cargo / Rol del firmante');
  return missing;
}

function openValidation(missing, onContinue) {
  const list = document.getElementById('validationList');
  list.innerHTML = missing.map(m => '<li>' + m + '</li>').join('');
  const cont = document.getElementById('validationContinue');
  // Reemplazar listener anterior (clonando el botón)
  const fresh = cont.cloneNode(true);
  cont.parentNode.replaceChild(fresh, cont);
  fresh.addEventListener('click', () => {
    closeValidation();
    onContinue();
  });
  document.getElementById('validationModal').classList.add('open');
}

function closeValidation() {
  document.getElementById('validationModal').classList.remove('open');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeValidation();
});

// Wrappers que validan antes de exportar
const _exportPDF_inner = exportPDF;
const _exportJPG_inner = exportJPG;
exportPDF = function() {
  const missing = validateForm();
  if (missing.length) openValidation(missing, _exportPDF_inner);
  else _exportPDF_inner();
};
exportJPG = function() {
  const missing = validateForm();
  if (missing.length) openValidation(missing, _exportJPG_inner);
  else _exportJPG_inner();
};

/* ════════════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════════════ */
(function() {
  const restored = restoreState();
  if (!restored) {
    const today = new Date();
    const iso = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    document.getElementById('dateInput').value = iso;
  }
  updatePreview();
  bindInlineEditing();
  bindAutosave();
  bindKeyboardShortcuts();
  bindCtrlScrollZoom();
  bindCuerpoUrlHint();
  bindFloatingEditorBar();
  setupShareButton();
  autosizeBody();
  updateBodyCounter();
  bindHistory();
  applyZoom();
  // Registro de Service Worker para PWA / offline + auto-update
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('sw.js');
        // Detectar cuando hay un SW nuevo esperando para activarse
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              // Hay versión nueva esperando → ofrecer recargar
              if (typeof showToast === 'function') {
                showToast('🔄 Nueva versión disponible — tocá acá para actualizar', 'info', 30000, () => {
                  newSW.postMessage('SKIP_WAITING');
                });
              }
            }
          });
        });
        // Cuando el nuevo SW toma control, recargar la página
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          location.reload();
        });
        // Check periódico cada 60 min (por si el usuario tiene la app abierta mucho rato)
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      } catch (err) {
        console.warn('SW no registrado:', err);
      }
    });
  }
  window.addEventListener('resize', () => applyZoom());
})();
