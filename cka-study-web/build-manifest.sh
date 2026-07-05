#!/usr/bin/env bash
# Genera modulos/index.json con la lista de módulos del curso (*.txt, orden
# alfabético). La web lo usa como primera fuente: es lo que permite que
# funcione en hosting estático (Cloudflare Pages, GitHub Pages...), donde el
# servidor no genera listados de directorio.
#
# Uso: ./cka-study-web/build-manifest.sh
# En Cloudflare Pages: comando de build = bash cka-study-web/build-manifest.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d modulos ]; then
  echo "No hay carpeta modulos/; nada que generar." >&2
  exit 0
fi

python3 - <<'EOF'
import json
import re
from pathlib import Path

base = Path("modulos")
# Solo módulos del curso (M00-..., M01-...); excluye LICENSE.txt y similares.
files = sorted(p.name for p in base.glob("*.txt") if re.match(r"M\d+", p.name))
(base / "index.json").write_text(json.dumps(files, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"modulos/index.json generado con {len(files)} fichero(s):")
for name in files:
    print(f"  - {name}")
EOF
