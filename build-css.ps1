# Build de Tailwind (CLI standalone, sin Node)
# Uso: powershell -ExecutionPolicy Bypass -File build-css.ps1
# Descarga del binario (una vez):
#   Invoke-WebRequest "https://github.com/tailwindlabs/tailwindcss/releases/download/v4.3.0/tailwindcss-windows-x64.exe" -OutFile tailwindcss.exe
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $dir "tailwindcss.exe"
if (-not (Test-Path $exe)) {
  Write-Host "Falta tailwindcss.exe. Descargalo con:" -ForegroundColor Yellow
  Write-Host '  Invoke-WebRequest "https://github.com/tailwindlabs/tailwindcss/releases/download/v4.3.0/tailwindcss-windows-x64.exe" -OutFile tailwindcss.exe'
  exit 1
}
& $exe -i (Join-Path $dir "tailwind.input.css") -o (Join-Path $dir "tailwind.css") --minify
Write-Host "OK -> tailwind.css" -ForegroundColor Green
