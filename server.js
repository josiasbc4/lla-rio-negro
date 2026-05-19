const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3131;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/herramienta-lla.html';
  // Decodificar componentes URL (ej: %20 → espacio en "LLA BLANCO.png")
  try { urlPath = decodeURIComponent(urlPath); } catch (_) {}
  const filePath = path.join(ROOT, urlPath);
  const ext = path.extname(filePath);
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Server running at http://localhost:${PORT}`));
