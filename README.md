# Herramienta Partidaria LLA Río Negro

Herramienta web para generar **notas oficiales** y **comunicados de prensa** de La Libertad Avanza Río Negro.

## 🌐 Sitio en vivo

👉 **https://josiasbc4.github.io/lla-rio-negro/** _(GitHub Pages: branch `main` → `/(root)`)_

## ✨ Funcionalidades

- 📝 **Notas oficiales** con membrete (encabezado, destinatario, cuerpo, firma)
- 📰 **Comunicados de prensa** con banda violeta, título, cuerpo y links
- 🏙️ Selector de ciudad (todos los municipios de Río Negro)
- 💾 **Borradores** locales (autoguardado en el navegador)
- 📤 Exportar a **JPG** y **PDF A4**
- 🔐 Acceso por código único por referente
- 📱 PWA — funciona offline una vez instalada

## 🚀 Deploy

GitHub Pages despliega automáticamente desde la **raíz del branch `main`** en cada push. El `index.html` se mantiene sincronizado con `herramienta-lla.html`.

## 📂 Estructura

```
.
├── index.html            ← Lo que sirve GitHub Pages
├── herramienta-lla.html  ← Fuente principal (idéntica a index.html)
├── manifest.json         ← PWA manifest
├── sw.js                 ← Service Worker (v3)
├── users.json            ← Lista de referentes autorizados
├── LLA *.png             ← Logos
├── server.js             ← Dev server local en localhost:3131
└── README.md
```

## 🛠️ Dev local

```bash
node server.js
# abrir http://localhost:3131
```

---

_La Libertad Avanza · Río Negro 2026_
