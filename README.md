# Herramienta Partidaria LLA Río Negro

Herramienta web para generar **notas oficiales** y **comunicados de prensa** de La Libertad Avanza Río Negro.

## 🌐 Sitio en vivo

👉 **https://josiasamaya.github.io/lla-rio-negro/** _(activar GitHub Pages → branch `main` → carpeta `/lla-deploy`)_

## ✨ Funcionalidades

- 📝 **Notas oficiales** con membrete (encabezado, destinatario, cuerpo, firma)
- 📰 **Comunicados de prensa** con banda violeta, título, cuerpo y links
- 🏙️ Selector de ciudad (todos los municipios de Río Negro)
- 💾 **Borradores** locales (autoguardado en el navegador)
- 📤 Exportar a **JPG** y **PDF A4**
- 🔐 Acceso por código único por referente
- 📱 PWA — funciona offline una vez instalada

## 🚀 Deploy

El sitio servido está en `/lla-deploy/`. Cualquier cambio en `herramienta-lla.html` se debe replicar ahí antes de pushear.

## 📂 Estructura

```
.
├── lla-deploy/          ← Lo que se publica (GitHub Pages)
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   └── LLA *.png
├── herramienta-lla.html ← Fuente principal (idéntico a deploy/index.html)
├── server.js            ← Dev server local en localhost:3131
└── README.md
```

## 🛠️ Dev local

```bash
node server.js
# abrir http://localhost:3131
```

---

_La Libertad Avanza · Río Negro 2026_
