$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://localhost:3131/')
$listener.Start()
Write-Host "Server running at http://localhost:3131"

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css'
  '.js'   = 'application/javascript'
  '.json' = 'application/json'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.pdf'  = 'application/pdf'
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  $urlPath = $req.Url.LocalPath
  if ($urlPath -eq '/') { $urlPath = '/index.html' }
  try { $urlPath = [System.Uri]::UnescapeDataString($urlPath) } catch {}
  $filePath = Join-Path $root $urlPath.TrimStart('/')
  if (Test-Path $filePath -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($filePath)
    $contentType = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $res.ContentType = $contentType
    $res.SendChunked = $true
    $res.Headers.Add('Access-Control-Allow-Origin', '*')
    $res.OutputStream.Write($bytes, 0, $bytes.Count)
  } else {
    $res.StatusCode = 404
  }
  $res.OutputStream.Close()
}
