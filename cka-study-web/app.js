"use strict";

const MODULES_DIR = "../modulos/";
const FALLBACK_SOURCE = "../CURSO-CKA-claude.txt";

const STORE_KEYS = {
  progress: "cka.progress",
  theme: "cka.theme",
  lastPosition: "cka.lastPosition",
};

const state = {
  modules: [],
  activeModule: null,
  query: "",
  progress: readStore(STORE_KEYS.progress, {}),
  lastPosition: readStore(STORE_KEYS.lastPosition, null),
  timers: new Map(),
};

const els = {
  nav: document.querySelector("#moduleNav"),
  overview: document.querySelector("#overview"),
  content: document.querySelector("#courseContent"),
  searchResults: document.querySelector("#searchResults"),
  searchState: document.querySelector("#searchState"),
  crumb: document.querySelector("#crumb"),
  title: document.querySelector("#pageTitle"),
  search: document.querySelector("#searchInput"),
  continueChip: document.querySelector("#continueChip"),
  themeToggle: document.querySelector("#themeToggle"),
  expandAll: document.querySelector("#expandAll"),
  collapseAll: document.querySelector("#collapseAll"),
  menuButton: document.querySelector("#menuButton"),
  scrim: document.querySelector("#scrim"),
};

init();

async function init() {
  bindEvents();
  updateThemeButton();

  try {
    const { text } = await loadCourseText();
    state.modules = CourseParser.parseCourse(text);

    const remembered = state.lastPosition && state.modules.find((m) => m.id === state.lastPosition.moduleId);
    state.activeModule = remembered?.id || state.modules[0]?.id || null;

    render();
    showContinueChip();
    startTimerLoop();
    openFromHash();
  } catch (error) {
    els.crumb.textContent = "Error";
    els.title.textContent = "No se pudo cargar el material";
    els.content.innerHTML = `
      <div class="empty">
        <p>El navegador no puede leer los TXT del curso (<strong>modulos/*.txt</strong> o
        <strong>CURSO-CKA-claude.txt</strong>) directamente desde <code>file://</code>.</p>
        <p>Arranca el servidor local con <code>./cka-study-web/start.sh</code> y abre
        <code>http://127.0.0.1:8000/cka-study-web/</code>.</p>
      </div>
    `;
    console.error(error);
  }
}

// Carga el curso probando tres fuentes en orden:
//   1. modulos/index.json — manifiesto generado por build-manifest.sh; es lo
//      que funciona en hosting estático (Cloudflare Pages, GitHub Pages...),
//      donde el servidor no genera listados de directorio.
//   2. Listado de directorio de modulos/ — lo genera python http.server
//      (start.sh); cubre el uso local aunque el manifiesto no exista.
//   3. CURSO-CKA-claude.txt — TXT único original, como último recurso.
async function loadCourseText() {
  const manifestFiles = await discoverFromManifest();
  if (manifestFiles.length) {
    const loaded = await fetchModuleTexts(manifestFiles);
    if (loaded.texts.length) {
      return {
        text: loaded.texts.join("\n\n"),
        source: `modulos/ (${loaded.texts.length} fichero${loaded.texts.length === 1 ? "" : "s"} · índice)`,
      };
    }
  }

  const listedFiles = await discoverFromListing();
  if (listedFiles.length) {
    const loaded = await fetchModuleTexts(listedFiles);
    if (loaded.texts.length) {
      return {
        text: loaded.texts.join("\n\n"),
        source: `modulos/ (${loaded.texts.length} fichero${loaded.texts.length === 1 ? "" : "s"} · listado)`,
      };
    }
  }

  const response = await fetch(FALLBACK_SOURCE, { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar ${FALLBACK_SOURCE}`);
  return { text: await response.text(), source: "CURSO-CKA-claude.txt" };
}

async function discoverFromManifest() {
  try {
    const response = await fetch(`${MODULES_DIR}index.json`, { cache: "no-store" });
    if (!response.ok) return [];
    const names = await response.json();
    if (!Array.isArray(names)) return [];
    return sortModuleFiles(names.filter((name) => typeof name === "string" && name.endsWith(".txt")));
  } catch (error) {
    console.warn("Sin modulos/index.json legible.", error);
    return [];
  }
}

async function discoverFromListing() {
  try {
    const response = await fetch(MODULES_DIR, { cache: "no-store" });
    if (!response.ok) return [];
    const html = await response.text();
    const names = [...html.matchAll(/href="([^"?#]+\.txt)"/gi)].map((match) => decodeURIComponent(match[1]));
    return sortModuleFiles(names);
  } catch (error) {
    console.warn("Sin listado de modulos/.", error);
    return [];
  }
}

function sortModuleFiles(names) {
  return [...new Set(names)]
    .filter((name) => !name.includes("/") && /^M\d+/i.test(name))
    .sort((a, b) => a.localeCompare(b, "es"));
}

// Descarga los ficheros del curso; uno que falte (manifiesto desfasado) se
// omite con aviso en consola en lugar de tumbar la carga completa.
async function fetchModuleTexts(files) {
  const texts = await Promise.all(files.map(async (name) => {
    try {
      const response = await fetch(MODULES_DIR + encodeURIComponent(name), { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return stripPreamble(await response.text());
    } catch (error) {
      console.warn(`Se omite modulos/${name}:`, error);
      return null;
    }
  }));
  return { texts: texts.filter((text) => text !== null) };
}

// Cada fichero de módulo empieza en su caja "====": el preámbulo anterior
// (aviso de copyright, notas) no es contenido del curso y se descarta para
// que no se cuele en el módulo previo al concatenar.
function stripPreamble(text) {
  const match = text.match(/^=+\s*$/m);
  return match ? text.slice(match.index) : text;
}

/* ---------------------------------------------------------------- eventos */

function bindEvents() {
  let searchTimeout = null;
  els.search.addEventListener("input", (event) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.query = event.target.value.trim();
      render();
    }, 140);
  });

  els.themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    writeStore(STORE_KEYS.theme, next, true);
    updateThemeButton();
  });

  els.expandAll.addEventListener("click", () => setAllSections(true));
  els.collapseAll.addEventListener("click", () => setAllSections(false));

  els.menuButton.addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
  els.scrim.addEventListener("click", () => document.body.classList.remove("sidebar-open"));

  els.continueChip.addEventListener("click", () => {
    const pos = state.lastPosition;
    els.continueChip.hidden = true;
    if (pos) navigateTo(pos.moduleId, pos.sectionId);
  });

  document.addEventListener("click", onDocumentClick);
  window.addEventListener("scroll", onScroll, { passive: true });
}

function onDocumentClick(event) {
  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) {
    const code = copyButton.closest(".code-panel")?.querySelector("[data-copy-source]")?.textContent || "";
    navigator.clipboard.writeText(code).then(() => {
      copyButton.classList.add("copied");
      copyButton.textContent = "Copiado";
      setTimeout(() => {
        copyButton.classList.remove("copied");
        copyButton.textContent = copyButton.dataset.copyLabel || "Copiar";
      }, 1200);
    });
    return;
  }

  const doneButton = event.target.closest("[data-done]");
  if (doneButton) {
    event.preventDefault();
    event.stopPropagation();
    toggleDone(doneButton.dataset.done);
    return;
  }

  const quizToggle = event.target.closest("[data-quiz-toggle]");
  if (quizToggle) {
    quizToggle.closest(".quiz-card")?.classList.toggle("open");
    return;
  }

  const revealButton = event.target.closest("[data-reveal]");
  if (revealButton) {
    revealButton.closest(".spoiler")?.classList.toggle("open");
    return;
  }

  const timerButton = event.target.closest("[data-timer-action]");
  if (timerButton) {
    const widget = timerButton.closest("[data-timer]");
    if (widget) handleTimerAction(widget.dataset.timer, timerButton.dataset.timerAction);
    return;
  }

  const navModule = event.target.closest("[data-nav-module]");
  if (navModule) {
    document.body.classList.remove("sidebar-open");
    els.continueChip.hidden = true;
    setActiveModule(navModule.dataset.navModule);
    return;
  }

  const tocLink = event.target.closest("[data-toc-section]");
  if (tocLink) {
    event.preventDefault();
    document.body.classList.remove("sidebar-open");
    navigateTo(tocLink.dataset.tocModule, tocLink.dataset.tocSection);
    return;
  }

  const result = event.target.closest("[data-result-section]");
  if (result) {
    els.continueChip.hidden = true;
    navigateTo(result.dataset.resultModule, result.dataset.resultSection);
    return;
  }

  const gotoModule = event.target.closest("[data-goto-module]");
  if (gotoModule) {
    els.continueChip.hidden = true;
    setActiveModule(gotoModule.dataset.gotoModule);
  }
}

/* ------------------------------------------------------------- navegación */

function setActiveModule(moduleId, { scrollTop = true } = {}) {
  if (!state.modules.some((m) => m.id === moduleId)) return;
  state.activeModule = moduleId;
  if (state.query) {
    state.query = "";
    els.search.value = "";
  }
  render();
  saveLastPosition(moduleId, null);
  if (scrollTop) window.scrollTo({ top: 0 });
}

function navigateTo(moduleId, sectionId, { smooth = true } = {}) {
  if (state.activeModule !== moduleId || state.query) {
    setActiveModule(moduleId, { scrollTop: !sectionId });
  }
  if (!sectionId) return;

  const card = document.getElementById(sectionId);
  if (!card) return;
  if (card instanceof HTMLDetailsElement) card.open = true;
  card.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "start" });
  card.classList.add("flash");
  setTimeout(() => card.classList.remove("flash"), 1700);
  saveLastPosition(moduleId, sectionId);
}

// Permite abrir la web directamente en una sección: .../cka-study-web/#<id-seccion>
function openFromHash() {
  const sectionId = decodeURIComponent(location.hash.slice(1));
  if (!sectionId) return;
  const module = state.modules.find((m) => m.sections.some((s) => s.id === sectionId));
  if (!module) return;
  els.continueChip.hidden = true;
  navigateTo(module.id, sectionId, { smooth: false });
}

function showContinueChip() {
  const pos = state.lastPosition;
  if (!pos || !pos.sectionId) return;
  const module = state.modules.find((m) => m.id === pos.moduleId);
  const section = module?.sections.find((s) => s.id === pos.sectionId);
  if (!module || !section) return;
  els.continueChip.innerHTML = `<span class="chip-play">▶</span> Continuar: <strong>${escapeHtml(module.code)}</strong> · ${escapeHtml(truncate(section.title, 34))}`;
  els.continueChip.hidden = false;
}

function saveLastPosition(moduleId, sectionId) {
  state.lastPosition = { moduleId, sectionId };
  writeStore(STORE_KEYS.lastPosition, state.lastPosition);
}

let scrollTick = false;
function onScroll() {
  if (scrollTick || state.query) return;
  scrollTick = true;
  requestAnimationFrame(() => {
    scrollTick = false;
    const cards = els.content.querySelectorAll(".section-card");
    let current = null;
    for (const card of cards) {
      if (card.getBoundingClientRect().top <= 130) current = card;
      else break;
    }
    const sectionId = current?.id || null;
    if (sectionId && state.lastPosition?.sectionId !== sectionId) {
      saveLastPosition(state.activeModule, sectionId);
      els.nav.querySelectorAll("[data-toc-section]").forEach((link) => {
        link.classList.toggle("active", link.dataset.tocSection === sectionId);
      });
    }
  });
}

/* ---------------------------------------------------------------- progreso */

function toggleDone(sectionId) {
  if (state.progress[sectionId]) delete state.progress[sectionId];
  else state.progress[sectionId] = true;
  writeStore(STORE_KEYS.progress, state.progress);

  const card = document.getElementById(sectionId);
  if (card) {
    card.classList.toggle("done", Boolean(state.progress[sectionId]));
    const button = card.querySelector("[data-done]");
    if (button) {
      const isDone = Boolean(state.progress[sectionId]);
      button.classList.toggle("on", isDone);
      button.title = isDone ? "Estudiada — clic para desmarcar" : "Marcar como estudiada";
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(isDone));
    }
  }
  renderNav();
  renderOverview();
}

/* ------------------------------------------------------------------ render */

function render() {
  renderNav();
  renderOverview();
  renderMain();
}

function renderNav() {
  els.nav.innerHTML = state.modules.map((module) => {
    const { done, total, pct } = moduleProgress(module, state.progress);
    const isActive = module.id === state.activeModule && !state.query;
    const toc = isActive ? `
      <ol class="toc">
        ${module.sections.map((section) => `
          <li>
            <a href="#${section.id}" class="toc-link lvl-${section.level} ${section.blocks.length ? "" : "toc-group"} ${state.progress[section.id] ? "done" : ""} ${state.lastPosition?.sectionId === section.id ? "active" : ""}"
               data-toc-module="${module.id}" data-toc-section="${section.id}">
              <span class="toc-mark">${state.progress[section.id] ? ICONS.check : ""}</span>
              <span class="toc-text">${escapeHtml(section.title)}</span>
            </a>
          </li>
        `).join("")}
      </ol>` : "";

    return `
      <div class="nav-module ${isActive ? "active" : ""}">
        <button class="nav-item" type="button" data-nav-module="${module.id}">
          <span class="nav-top">
            <span class="nav-code">${escapeHtml(module.code)}</span>
            <span class="nav-count ${done === total && total ? "complete" : ""}">${done === total && total ? `${ICONS.check} ` : ""}${done}/${total}</span>
          </span>
          <span class="nav-title">${escapeHtml(cleanModuleTitle(module))}</span>
          <span class="meter meter-small"><span class="meter-fill" style="width:${pct}%"></span></span>
        </button>
        ${toc}
      </div>
    `;
  }).join("");
}

function renderOverview() {
  const totals = state.modules.reduce((acc, module) => {
    const { done, total } = moduleProgress(module, state.progress);
    acc.done += done;
    acc.total += total;
    acc.quiz += countBlocks(module, (b) => b.type === "quiz");
    acc.code += countBlocks(module, (b) => b.type === "code" && typeof b.copyText === "string");
    return acc;
  }, { done: 0, total: 0, quiz: 0, code: 0 });

  const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

  els.overview.innerHTML = `
    <article class="stat-card stat-progress">
      <span class="stat-label">Progreso del curso</span>
      <strong class="stat-value">${pct}%</strong>
      <span class="meter"><span class="meter-fill" style="width:${pct}%"></span></span>
      <span class="stat-foot">${totals.done} de ${totals.total} secciones estudiadas</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">Módulos</span>
      <strong class="stat-value">${state.modules.length}</strong>
    </article>
    <article class="stat-card">
      <span class="stat-label">Preguntas de repaso</span>
      <strong class="stat-value">${totals.quiz}</strong>
      <span class="stat-foot">en los checkpoints</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">Bloques copiables</span>
      <strong class="stat-value">${totals.code}</strong>
      <span class="stat-foot">con copia explícita y segura</span>
    </article>
  `;
}

function renderMain() {
  if (state.query) {
    renderSearchResults();
    return;
  }

  els.searchResults.hidden = true;
  els.searchState.hidden = true;
  els.overview.hidden = false;
  els.content.hidden = false;

  const module = state.modules.find((m) => m.id === state.activeModule) || state.modules[0];
  if (!module) return;

  const index = state.modules.indexOf(module);
  els.crumb.textContent = `Módulo ${index + 1} de ${state.modules.length} · ${module.code}`;
  els.title.textContent = cleanModuleTitle(module);

  const prev = state.modules[index - 1];
  const next = state.modules[index + 1];

  els.content.innerHTML = renderModuleArticle(module, { prev, next, progress: state.progress });

  restoreTimerWidgets();
}

/* ------------------------------------------------------------- cronómetro */

function getTimer(sectionId) {
  if (!state.timers.has(sectionId)) {
    state.timers.set(sectionId, { elapsed: 0, running: false });
  }
  return state.timers.get(sectionId);
}

function handleTimerAction(sectionId, action) {
  const timer = getTimer(sectionId);
  if (action === "start") timer.running = !timer.running;
  if (action === "reset") {
    timer.running = false;
    timer.elapsed = 0;
  }
  updateTimerWidget(sectionId);
}

function startTimerLoop() {
  setInterval(() => {
    for (const [sectionId, timer] of state.timers) {
      if (!timer.running) continue;
      timer.elapsed += 1;
      updateTimerWidget(sectionId);
    }
  }, 1000);
}

function updateTimerWidget(sectionId) {
  const widget = els.content.querySelector(`[data-timer="${sectionId}"]`);
  if (!widget) return;
  const timer = getTimer(sectionId);
  const target = Number(widget.dataset.target) || 0;
  widget.querySelector(".timer-clock").textContent = formatClock(timer.elapsed);
  widget.classList.toggle("running", timer.running);
  widget.classList.toggle("over", target > 0 && timer.elapsed > target);
  const startButton = widget.querySelector('[data-timer-action="start"]');
  startButton.textContent = timer.running ? "Pausar" : timer.elapsed ? "Reanudar" : "Iniciar";
}

function restoreTimerWidgets() {
  for (const sectionId of state.timers.keys()) updateTimerWidget(sectionId);
}

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/* ---------------------------------------------------------------- búsqueda */

function renderSearchResults() {
  const query = state.query;
  const results = [];

  for (const module of state.modules) {
    for (const section of module.sections) {
      const haystack = sectionSearchText(section);
      const lower = haystack.toLowerCase();
      const idx = lower.indexOf(query.toLowerCase());
      const titleHit = section.title.toLowerCase().includes(query.toLowerCase());
      if (idx === -1 && !titleHit) continue;
      results.push({
        module,
        section,
        snippet: idx !== -1 ? makeSnippet(haystack, idx, query) : "",
      });
    }
  }

  els.crumb.textContent = "Búsqueda global";
  els.title.textContent = `Resultados para "${query}"`;
  els.overview.hidden = true;
  els.content.hidden = true;
  els.searchResults.hidden = false;
  els.searchState.hidden = false;
  els.searchState.textContent = results.length
    ? `${results.length} sección${results.length === 1 ? "" : "es"} con coincidencias en ${new Set(results.map((r) => r.module.id)).size} módulo(s).`
    : "Sin resultados. Prueba con otro término (ej. kubectl, etcd, drain).";

  let lastModule = null;
  els.searchResults.innerHTML = results.map((result) => {
    const header = result.module !== lastModule
      ? `<p class="results-module">${escapeHtml(result.module.code)} · ${escapeHtml(cleanModuleTitle(result.module))}</p>`
      : "";
    lastModule = result.module;
    return `
      ${header}
      <button class="result" type="button" data-result-module="${result.module.id}" data-result-section="${result.section.id}">
        <span class="result-title">${highlight(result.section.title, query)}</span>
        ${result.snippet ? `<span class="result-snippet">${result.snippet}</span>` : ""}
      </button>
    `;
  }).join("") || `<div class="empty"><p>No hay resultados para esa búsqueda.</p></div>`;
}

function sectionSearchText(section) {
  if (!section._searchText) {
    const parts = [section.title];
    const walk = (blocks) => blocks.forEach((block) => {
      if (block.type === "quiz") {
        parts.push(block.label, block.question);
        walk(block.answerBlocks);
      } else if (block.type === "spoiler") {
        walk(block.blocks);
      } else {
        parts.push(block.text);
      }
    });
    walk(section.blocks);
    section._searchText = parts.filter(Boolean).join("\n");
  }
  return section._searchText;
}

function makeSnippet(text, index, query) {
  const start = Math.max(0, index - 70);
  const end = Math.min(text.length, index + query.length + 110);
  const raw = `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
  return highlight(raw, query);
}

/* ------------------------------------------------------------------- utils */

function countBlocks(module, predicate) {
  let count = 0;
  const walk = (blocks) => blocks.forEach((block) => {
    if (predicate(block)) count += 1;
    if (block.type === "quiz") walk(block.answerBlocks);
    if (block.type === "spoiler") walk(block.blocks);
  });
  module.sections.forEach((section) => walk(section.blocks));
  return count;
}

function setAllSections(open) {
  els.content.querySelectorAll(".section-card").forEach((details) => {
    details.open = open;
  });
}

function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  els.themeToggle.innerHTML = dark ? ICONS.sun : ICONS.moon;
  els.themeToggle.title = dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
}

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStore(key, value, plain = false) {
  try {
    localStorage.setItem(key, plain ? value : JSON.stringify(value));
  } catch {
    /* modo privado: la app funciona sin persistencia */
  }
}

function highlight(value, query) {
  const safe = escapeHtml(value);
  if (!query) return safe;
  const escapedQuery = escapeRegExp(escapeHtml(query));
  return safe.replace(new RegExp(`(${escapedQuery})`, "gi"), "<mark>$1</mark>");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
