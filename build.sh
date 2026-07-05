#!/usr/bin/env bash
# Ensambla el sitio publicable en dist/:
#   dist/            <- landing/ (kestrion.dev)
#   dist/app/        <- cka-study-web/ (la web de estudio)
#   dist/modulos/    <- modulos/ + index.json regenerado
#
# En Cloudflare Pages: build command = bash build.sh, output directory = dist
# En local: bash build.sh && python3 -m http.server 8001 --directory dist
set -euo pipefail

cd "$(dirname "$0")"

bash cka-study-web/build-manifest.sh

rm -rf dist
mkdir -p dist/app

cp -r landing/. dist/
cp -r cka-study-web/. dist/app/
cp -r modulos dist/modulos

# Herramientas de desarrollo que no pintan nada en producción.
rm -f dist/app/start.sh dist/app/build-manifest.sh dist/app/README.md

echo "dist/ listo:"
find dist -maxdepth 2 -type f | sort
