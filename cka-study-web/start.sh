#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

port="${1:-8000}"
url="http://127.0.0.1:${port}/cka-study-web/"

# Regenera el manifiesto de módulos para que el arranque local use el mismo
# camino de carga que el hosting estático (modulos/index.json).
bash cka-study-web/build-manifest.sh || true

echo "Servidor local del Curso CKA"
echo "URL: ${url}"
echo
echo "Pulsa Ctrl+C para detenerlo."
echo

# Abre el navegador cuando el servidor ya está escuchando.
(
  sleep 1
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${url}" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "${url}" >/dev/null 2>&1 || true
  fi
) &

python3 -m http.server "${port}" --bind 127.0.0.1
