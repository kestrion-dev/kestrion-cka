#!/usr/bin/env bash
# Ensambla el sitio publicable en dist/:
#   dist/                     <- landing/ (kestrion.dev)
#   dist/app/                 <- cka-study-web/ (la app interactiva, noindex)
#   dist/modulos/*.txt        <- modulos/ + index.json regenerado
#   dist/modulos/<slug>/      <- página HTML estática por módulo (build-pages.js)
#   dist/sitemap.xml          <- generado por build-pages.js (/ + cada módulo)
#
# En Cloudflare Pages: build command = bash build.sh, output directory = dist
# En local: bash build.sh && python3 -m http.server 8001 --directory dist
# Requiere Node.js (build-pages.js reutiliza cka-study-web/parser.js y render.js).
set -euo pipefail

cd "$(dirname "$0")"

bash cka-study-web/build-manifest.sh

rm -rf dist
mkdir -p dist/app

cp -r landing/. dist/
cp -r cka-study-web/. dist/app/
cp -r modulos dist/modulos

node cka-study-web/build-pages.js

# Herramientas de desarrollo que no pintan nada en producción.
rm -f dist/app/start.sh dist/app/build-manifest.sh dist/app/build-pages.js dist/app/README.md

echo "dist/ listo:"
find dist -maxdepth 2 -type f | sort
