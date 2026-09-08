# Kestrion CKA

Web estática e interactiva en español para preparar el examen Certified Kubernetes Administrator.

## Arquitectura

La aplicación usa Astro en modo SSG. Cada módulo se genera como HTML completo en `/modulos/<slug>/` y añade JavaScript únicamente para funciones interactivas aisladas.

```text
src/content/modulos/       Fuente Markdown validada
src/pages/                 Landing, catálogo y páginas de módulo
src/components/            Componentes interactivos Astro
src/lib/                   Lógica TypeScript compartida
scripts/                   Validación de contenido
tests/                     Pruebas automatizadas
```

## Desarrollo local

Requiere Node.js 22.23.2.

```bash
npm ci
npm run dev
```

El preview que reproduce Cloudflare Workers se inicia con `npm run preview` después del build.

Validación completa:

```bash
npm run ci
```

El build estático se genera en `dist/` y `wrangler.jsonc` permite servirlo mediante Cloudflare Workers Static Assets.

## Licencia

El código está bajo MIT. El contenido del curso pertenece a Kestrion y conserva una licencia separada; consulta [LICENSE](LICENSE).

Kubernetes® y CKA® son marcas registradas de The Linux Foundation. Kestrion es un proyecto educativo independiente, no afiliado a The Linux Foundation ni a la CNCF.
