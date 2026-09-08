# Fase 0 — arquitectura técnica local

Estado: preparada localmente en la rama `v2`. La incorporación y revisión de módulos se realizará en una tarea posterior.

## Alcance implementado

- Astro SSG sin adaptador de servidor ni framework cliente.
- Node.js 22.23.2 declarado para desarrollo y builds.
- Colección Markdown con esquema de metadatos.
- Landing, catálogo y ruta estática de módulo derivadas de la colección.
- Layout con canonical y metadatos sociales.
- Sitemap y robots generados desde la configuración canónica.
- Página 404 estática configurada para Cloudflare.
- Wrangler fijado en el proyecto para reproducir localmente el runtime de Cloudflare.
- Validación de despliegue `wrangler deploy --dry-run` integrada en CI; no autentica ni publica.
- Checklist por sección, progreso, cronómetro, copia, búsqueda estática y tema con TypeScript nativo.
- Validador determinista y pruebas unitarias de estructura.
- Comprobación bloqueante que impide publicar rutas, ficheros o referencias runtime de V1.
- Fuentes, runtime y scripts de V1 retirados de la rama `v2`.

## Ejecución local

Con Node.js 22.23.2:

```bash exec
npm ci
npm run ci
```

Para desarrollo:

```bash exec
npm run dev
```

## Build de Cloudflare

V2 genera un sitio completamente estático en `dist/`. `wrangler.jsonc` ya apunta a ese directorio y no necesita adaptador Astro ni código Worker.

La rama de preview deberá ejecutar `bash build.sh`.

## Trabajo diferido

- Incorporar y normalizar M01.
- Aplicar las correcciones aprobadas de `REVISION-TECNICA-M01.md`.
- Validar M01 y M02, sus anchors, quiz, respuestas, laboratorios y soluciones.
- Comprobar una página real y el checklist en navegador con y sin JavaScript.
- Commit, push y preview de Cloudflare, todos pendientes de autorización específica.

## Verificación local

Ejecutada el 2026-09-08:

- `astro check`: 0 errores, advertencias o indicaciones.
- Pruebas estructurales y del validador: 8/8 correctas.
- Build Astro SSG: correcto.
- Validación del artefacto: sin rutas, ficheros ni referencias runtime V1.
- `wrangler deploy --dry-run`: correcto, sin autenticación ni publicación.
- Smoke test: `/` y `/modulos/` responden 200; `/app/` y los TXT heredados responden 404.
