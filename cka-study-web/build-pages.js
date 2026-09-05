"use strict";

/*
 * Genera una página HTML estática por módulo (SEO-101/102/103): reutiliza
 * parser.js + render.js (los mismos que pinta la app) en modo `staticMode`,
 * para que el contenido completo esté en el HTML sin depender de JS. Escribe
 * también dist/sitemap.xml, que incluye estas páginas y excluye /app/ (ver
 * decisión SEO-004: /app/ es una herramienta noindex,follow).
 *
 * Uso: node cka-study-web/build-pages.js   (lo invoca build.sh)
 */

const fs = require("fs");
const path = require("path");
const parser = require("./parser.js");
const render = require("./render.js");

const ROOT_DIR = path.join(__dirname, "..");
const MODULOS_DIR = path.join(ROOT_DIR, "modulos");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const SITE_URL = "https://cka.kestrion.dev";
const OG_IMAGE = `${SITE_URL}/og.png`;
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%232563eb'/%3E%3Ctext x='32' y='44' font-family='sans-serif' font-size='30' font-weight='800' fill='white' text-anchor='middle'%3EK%3C/text%3E%3C/svg%3E";

// Fuente de verdad de slugs y descripciones: ver AUDITORIA-SEO.md (SEO-101/102).
// El orden es el mismo que modulos/index.json (alfabético): no reordena, no
// renumera — solo añade una URL pública estable por módulo existente.
const MODULES = [
  {
    file: "M00-entorno-kubectl.txt",
    slug: "entorno-kubectl",
    description: "Monta tu laboratorio CKA con K3s, domina kubectl con alias y atajos, y aprende la estrategia de examen para gestionar el tiempo y evitar errores comunes.",
  },
  {
    file: "M01-arquitectura.txt",
    slug: "arquitectura-kubernetes",
    description: "Arquitectura de Kubernetes para el CKA: control plane, etcd, kube-apiserver, scheduler, kubelet y kube-proxy explicados con laboratorios prácticos en K3s.",
  },
  {
    file: "M02-instalacion-kubeadm.txt",
    slug: "kubeadm-instalacion-upgrade-etcd",
    description: "Instala un cluster con kubeadm, actualiza Kubernetes de versión y practica backup y restore de etcd: los laboratorios más repetidos en el examen CKA.",
  },
  {
    file: "M03-rbac-seguridad.txt",
    slug: "rbac-seguridad-kubernetes",
    description: "RBAC en Kubernetes para el CKA: Roles, RoleBindings, ClusterRoles, ServiceAccounts y buenas prácticas de seguridad del cluster, con laboratorios guiados.",
  },
  {
    file: "M03b-helm-kustomize-crds.txt",
    slug: "helm-kustomize-crds",
    description: "Helm, Kustomize, CRDs, Operators y las interfaces CNI/CSI/CRI explicadas para el examen CKA, con ejemplos prácticos en un cluster kubeadm de 3 nodos.",
  },
  {
    file: "M04-workloads-deploy-ds-stateful.txt",
    slug: "deployments-daemonsets-statefulsets",
    description: "Deployments, DaemonSets y StatefulSets en Kubernetes: controllers, rolling updates y gestión de workloads para el 15% de Workloads & Scheduling del CKA.",
  },
];

// Igual que stripPreamble en app.js: el aviso antes de la primera caja "===="
// no es contenido del módulo.
function stripPreamble(text) {
  const match = text.match(/^=+\s*$/m);
  return match ? text.slice(match.index) : text;
}

function loadManifest() {
  const raw = fs.readFileSync(path.join(MODULOS_DIR, "index.json"), "utf8");
  return JSON.parse(raw);
}

// Evita el desajuste contenido/sitemap que señalaba SEO-103: si alguien añade
// o quita un módulo sin actualizar MODULES, el build falla en vez de publicar
// páginas a medias o dejar un módulo nuevo sin URL propia.
function assertInSyncWithManifest(manifest) {
  const manifestSet = new Set(manifest);
  const configuredFiles = MODULES.map((m) => m.file);
  const configuredSet = new Set(configuredFiles);

  const missingInConfig = manifest.filter((f) => !configuredSet.has(f));
  const missingInManifest = configuredFiles.filter((f) => !manifestSet.has(f));

  if (missingInConfig.length || missingInManifest.length) {
    console.error("build-pages.js: MODULES (en este fichero) está desincronizado con modulos/index.json.");
    if (missingInConfig.length) console.error("  En index.json pero no en MODULES:", missingInConfig);
    if (missingInManifest.length) console.error("  En MODULES pero no en index.json:", missingInManifest);
    process.exit(1);
  }
}

function parseModule(entry) {
  const text = stripPreamble(fs.readFileSync(path.join(MODULOS_DIR, entry.file), "utf8"));
  const [module] = parser.parseCourse(text);
  if (!module) {
    console.error(`build-pages.js: ${entry.file} no produjo ningún módulo al parsear.`);
    process.exit(1);
  }
  return { ...entry, module };
}

function neighborRef(entry) {
  if (!entry) return null;
  return { code: entry.module.code, title: entry.module.title, slug: entry.slug };
}

function renderPage(entry, prev, next) {
  const { module, slug, description } = entry;
  const title = render.cleanModuleTitle(module);
  const canonical = `${SITE_URL}/modulos/${slug}/`;
  const pageTitle = `${title} — CKA en español | Kestrion`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Módulos", item: `${SITE_URL}/#modulos` },
      { "@type": "ListItem", position: 3, name: title, item: canonical },
    ],
  };

  const article = render.renderModuleArticle(module, {
    prev,
    next,
    progress: {},
    opts: { staticMode: true },
  });

  const esc = render.escapeHtml;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(pageTitle)}</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${canonical}">
    ${prev ? `<link rel="prev" href="${SITE_URL}/modulos/${prev.slug}/">` : ""}
    ${next ? `<link rel="next" href="${SITE_URL}/modulos/${next.slug}/">` : ""}
    <meta property="og:type" content="article">
    <meta property="og:title" content="${esc(pageTitle)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${OG_IMAGE}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:locale" content="es_ES">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(pageTitle)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${OG_IMAGE}">
    <link rel="icon" href="${FAVICON}">
    <script>
      try {
        document.documentElement.dataset.theme = localStorage.getItem("cka.theme")
          || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      } catch (error) { /* sin localStorage: tema claro */ }
    </script>
    <link rel="stylesheet" href="../../app/styles.css">
    <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>
    <style>
      body { display: block; }
      .page-header, .page-main, .page-footer { max-width: 68rem; margin: 0 auto; padding-left: clamp(1rem, 3.5vw, 3rem); padding-right: clamp(1rem, 3.5vw, 3rem); }
      .page-header { display: flex; align-items: center; padding-top: 1.1rem; }
      .page-logo { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 800; color: var(--text); text-decoration: none; font-size: 1.05rem; }
      .page-logo-mark { display: inline-flex; align-items: center; justify-content: center; width: 1.6rem; height: 1.6rem; border-radius: 8px; background: var(--accent); color: #fff; font-size: 0.85rem; font-weight: 800; }
      .breadcrumbs { max-width: 68rem; margin: 0 auto; padding: 0.9rem clamp(1rem, 3.5vw, 3rem) 0; font-size: 0.82rem; color: var(--muted); display: flex; gap: 0.4rem; flex-wrap: wrap; }
      .breadcrumbs a { color: var(--muted); text-decoration: none; }
      .breadcrumbs a:hover { color: var(--accent); text-decoration: underline; }
      .breadcrumbs [aria-current] { color: var(--text); font-weight: 600; }
      .page-main { padding-top: 1rem; padding-bottom: 3rem; }
      .timer-static { margin: 0 0 0.7rem; padding: 0.6rem 0.85rem; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--line); color: var(--text-2); font-size: 0.88rem; }
      .app-cta { margin-top: 1.4rem; padding: 1rem 1.2rem; border-radius: 12px; background: var(--accent-soft); border: 1px solid var(--accent-border); color: var(--text); font-size: 0.94rem; }
      .app-cta a { color: var(--accent-strong); font-weight: 700; text-decoration: none; }
      .app-cta a:hover { text-decoration: underline; }
      .page-footer { padding-top: 1.5rem; padding-bottom: 2.5rem; border-top: 1px solid var(--line); }
      .page-footer .foot-links { display: flex; gap: 1.1rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
      .page-footer .foot-links a { color: var(--text-2); text-decoration: none; font-size: 0.88rem; }
      .page-footer .foot-links a:hover { color: var(--accent); }
      .page-footer .foot-copy { margin: 0; color: var(--muted); font-size: 0.78rem; line-height: 1.5; }
    </style>
  </head>
  <body>
    <header class="page-header">
      <a class="page-logo" href="../../"><span class="page-logo-mark">K</span> Kestrion</a>
    </header>
    <nav class="breadcrumbs" aria-label="Miga de pan">
      <a href="../../">Inicio</a>
      <span aria-hidden="true">/</span>
      <a href="../../#modulos">Módulos</a>
      <span aria-hidden="true">/</span>
      <span aria-current="page">${esc(title)}</span>
    </nav>
    <main class="page-main">
      ${article}
      <p class="app-cta">🔧 ¿Quieres practicar este módulo con quiz oculto hasta revelar, temporizador de laboratorio y progreso guardado? <a href="../../app/">Ábrelo en la app interactiva →</a></p>
    </main>
    <footer class="page-footer">
      <nav class="foot-links">
        <a href="../../app/">App interactiva</a>
        <a href="https://github.com/kestrion-dev/kestrion-cka" rel="noopener">GitHub</a>
        <a href="../../aviso-legal">Aviso legal</a>
        <a href="../../politica-privacidad">Privacidad</a>
      </nav>
      <p class="foot-copy">
        Kubernetes® y CKA® (Certified Kubernetes Administrator) son marcas registradas de The Linux Foundation en Estados Unidos y otros países.
        Kestrion es un proyecto educativo independiente y no está afiliado, asociado ni respaldado por The Linux Foundation ni por la Cloud Native Computing Foundation.
        © ${new Date().getFullYear()} Kestrion.
      </p>
    </footer>
  </body>
</html>
`;
}

function writeSitemap(entries) {
  const urls = [
    { loc: `${SITE_URL}/`, changefreq: "weekly", priority: "1.0" },
    ...entries.map((entry) => ({
      loc: `${SITE_URL}/modulos/${entry.slug}/`,
      changefreq: "monthly",
      priority: "0.8",
    })),
  ];

  const body = urls.map((url) => `  <url>\n    <loc>${url.loc}</loc>\n    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

  fs.writeFileSync(path.join(DIST_DIR, "sitemap.xml"), xml);
  console.log(`dist/sitemap.xml (${urls.length} URLs)`);
}

function main() {
  const manifest = loadManifest();
  assertInSyncWithManifest(manifest);

  const parsedModules = MODULES.map(parseModule);

  parsedModules.forEach((entry, index) => {
    const prev = neighborRef(parsedModules[index - 1]);
    const next = neighborRef(parsedModules[index + 1]);
    const html = renderPage(entry, prev, next);
    const outDir = path.join(DIST_DIR, "modulos", entry.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), html);
    console.log(`dist/modulos/${entry.slug}/index.html`);
  });

  writeSitemap(parsedModules);
}

main();
