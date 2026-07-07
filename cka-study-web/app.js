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

const ICONS = {
  sun: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.4"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.4 14.2A8.4 8.4 0 0 1 9.8 3.6a8.4 8.4 0 1 0 10.6 10.6Z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.8 9.6 18 19.5 6.5"/></svg>`,
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
    const code = copyButton.closest(".code-panel")?.querySelector("code")?.textContent || "";
    navigator.clipboard.writeText(code).then(() => {
      copyButton.classList.add("copied");
      copyButton.textContent = "Copiado";
      setTimeout(() => {
        copyButton.classList.remove("copied");
        copyButton.textContent = "Copiar";
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
      button.classList.toggle("on", Boolean(state.progress[sectionId]));
      button.title = state.progress[sectionId] ? "Estudiada — clic para desmarcar" : "Marcar como estudiada";
    }
  }
  renderNav();
  renderOverview();
}

// Las cabeceras de grupo (secciones sin bloques) no cuentan para el progreso.
function moduleProgress(module) {
  const real = module.sections.filter((s) => s.blocks.length);
  const done = real.filter((s) => state.progress[s.id]).length;
  const total = real.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/* ------------------------------------------------------------------ render */

function render() {
  renderNav();
  renderOverview();
  renderMain();
}

function renderNav() {
  els.nav.innerHTML = state.modules.map((module) => {
    const { done, total, pct } = moduleProgress(module);
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
    const { done, total } = moduleProgress(module);
    acc.done += done;
    acc.total += total;
    acc.quiz += countBlocks(module, (b) => b.type === "quiz");
    acc.code += countBlocks(module, (b) => b.type === "code");
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
      <span class="stat-foot">detectados en el TXT</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">Preguntas de repaso</span>
      <strong class="stat-value">${totals.quiz}</strong>
      <span class="stat-foot">en los checkpoints</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">Bloques de comandos</span>
      <strong class="stat-value">${totals.code}</strong>
      <span class="stat-foot">listos para copiar</span>
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
  const { done, total, pct } = moduleProgress(module);

  els.content.innerHTML = `
    <article class="module">
      <header class="module-hero">
        <div class="hero-row">
          <span class="module-chip">${escapeHtml(module.code)}</span>
          <div class="hero-meter">
            <span class="meter"><span class="meter-fill" style="width:${pct}%"></span></span>
            <span class="hero-meter-label">${done}/${total} secciones</span>
          </div>
        </div>
        <h2>${escapeHtml(cleanModuleTitle(module))}</h2>
        <div class="module-meta">
          ${module.meta.map((item) => `<span class="pill"><span class="pill-key">${escapeHtml(item.key)}</span>${escapeHtml(item.value)}</span>`).join("")}
        </div>
      </header>
      <div class="module-body">
        ${module.sections.map((section) => renderSection(section)).join("")}
      </div>
      <footer class="module-footer">
        ${prev ? `<button class="module-jump" type="button" data-goto-module="${prev.id}"><span class="jump-dir">← Anterior</span><span class="jump-title">${escapeHtml(prev.code)} · ${escapeHtml(truncate(cleanModuleTitle(prev), 46))}</span></button>` : "<span></span>"}
        ${next ? `<button class="module-jump jump-next" type="button" data-goto-module="${next.id}"><span class="jump-dir">Siguiente →</span><span class="jump-title">${escapeHtml(next.code)} · ${escapeHtml(truncate(cleanModuleTitle(next), 46))}</span></button>` : "<span></span>"}
      </footer>
    </article>
  `;

  restoreTimerWidgets();
}

function renderSection(section) {
  if (!section.blocks.length) {
    return `<h3 class="group-heading" id="${section.id}"><span>${escapeHtml(section.title)}</span></h3>`;
  }

  const isDone = Boolean(state.progress[section.id]);
  const badges = [];
  if (section.kind === "checkpoint") {
    const questions = section.blocks.filter((b) => b.type === "quiz").length;
    badges.push(`<span class="badge badge-quiz">${questions} pregunta${questions === 1 ? "" : "s"}</span>`);
  }
  if (section.kind === "lab" && section.timerMinutes) {
    badges.push(`<span class="badge badge-lab">≤ ${section.timerMinutes} min</span>`);
  }

  return `
    <details class="section-card lvl-${section.level} kind-${section.kind} ${isDone ? "done" : ""}" id="${section.id}" open>
      <summary>
        <span class="sec-caret" aria-hidden="true"></span>
        <span class="sec-title">${escapeHtml(section.title)}</span>
        <span class="sec-badges">${badges.join("")}</span>
        <button class="done-toggle ${isDone ? "on" : ""}" type="button" data-done="${section.id}"
                title="${isDone ? "Estudiada — clic para desmarcar" : "Marcar como estudiada"}">${ICONS.check}</button>
      </summary>
      <div class="section-body">
        ${section.kind === "lab" && section.timerMinutes ? renderTimer(section) : ""}
        ${section.blocks.map((block) => renderBlock(block)).join("")}
      </div>
    </details>
  `;
}

/* ---------------------------------------------------------------- bloques */

function renderBlock(block) {
  switch (block.type) {
    case "code":
      return `
        <div class="code-panel">
          <div class="code-toolbar">
            <span class="code-lang">${codeLabel(block.text)}</span>
            <button class="copy-button" type="button" data-copy>Copiar</button>
          </div>
          <pre><code>${highlightCode(block.text)}</code></pre>
        </div>
      `;
    case "ascii":
      return `<pre class="ascii-art">${escapeHtml(block.text)}</pre>`;
    case "note":
      return renderCallout(block, "note", "📌");
    case "task":
      return renderCallout(block, "task", "🎯");
    case "success":
      return renderCallout(block, "success", "✅");
    case "quiz":
      return `
        <article class="quiz-card">
          <div class="quiz-head">
            <span class="quiz-num">${escapeHtml(block.label || "Pregunta")}</span>
          </div>
          <div class="quiz-question">${renderRichText(block.question)}</div>
          <button class="quiz-toggle" type="button" data-quiz-toggle>
            <span class="when-closed">Mostrar respuesta</span>
            <span class="when-open">Ocultar respuesta</span>
          </button>
          <div class="quiz-answer">
            ${block.answerBlocks.map((inner) => renderBlock(inner)).join("")}
          </div>
        </article>
      `;
    case "spoiler":
      return `
        <div class="spoiler">
          <div class="spoiler-cover">
            <p class="spoiler-label">🔒 ${escapeHtml(block.label || "Solución de referencia")}</p>
            <button class="reveal-button" type="button" data-reveal>Mostrar solución</button>
          </div>
          <button class="spoiler-hide" type="button" data-reveal>Ocultar solución</button>
          <div class="spoiler-content">
            ${block.blocks.map((inner) => renderBlock(inner)).join("")}
          </div>
        </div>
      `;
    default:
      return `<div class="text-block">${renderRichText(block.text)}</div>`;
  }
}

function renderCallout(block, kind, icon) {
  return `
    <aside class="callout callout-${kind}">
      <span class="callout-icon" aria-hidden="true">${icon}</span>
      <div class="callout-body">${renderRichText(block.text)}</div>
    </aside>
  `;
}

// Junta en párrafos fluidos las líneas cortadas del TXT; conserva los saltos
// en listas y bloques indentados (pasos, ejemplos alineados).
function renderRichText(text) {
  return text.split(/\n{2,}/).map((para) => {
    const lines = para.split("\n");
    const flowable = lines.every((line) => /^\S/.test(line))
      && !lines.some((line) => /^(\d+[.)]\s|[-*•]\s)/.test(line));
    if (flowable) {
      return `<p>${escapeHtml(para.replace(/\s*\n\s*/g, " "))}</p>`;
    }
    return `<p class="keep-lines">${escapeHtml(para)}</p>`;
  }).join("");
}

/* ------------------------------------------------------------- cronómetro */

function renderTimer(section) {
  return `
    <div class="timer" data-timer="${section.id}" data-target="${section.timerMinutes * 60}">
      <div class="timer-info">
        <span class="timer-label">⏱ Laboratorio cronometrado</span>
        <span class="timer-goal">Objetivo: ≤ ${section.timerMinutes} min</span>
      </div>
      <span class="timer-clock">00:00</span>
      <div class="timer-controls">
        <button class="timer-button primary" type="button" data-timer-action="start">Iniciar</button>
        <button class="timer-button" type="button" data-timer-action="reset">Reiniciar</button>
      </div>
    </div>
  `;
}

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

/* -------------------------------------------------- resaltado de sintaxis */

const CMD_WORDS = new Set((
  "kubectl k kubeadm etcdctl crictl systemctl journalctl sudo cat vim nano curl wget ssh scp watch " +
  "grep egrep awk sed echo export alias source mkdir cp mv rm ls apt apt-get openssl swapoff modprobe sysctl " +
  "complete python3 tar chmod chown head tail wc tee sort uniq find xargs cd docker ctr helm jq base64 touch " +
  "ln df du free ps top less man which sleep kill test set"
).split(/\s+/));

const TOKEN_SCANS = [
  { type: "str", re: /'[^']*'|"[^"]*"/g },
  { type: "comment", re: /(?<=\s)#.*$/g },
  { type: "ph", re: /<[A-Za-z[\]][\w\][./ -]{0,50}>/g },
  { type: "var", re: /\$\{?[A-Za-z_]\w*\}?/g },
  { type: "var", re: /\b[A-Z_]{3,}[A-Z0-9_]*(?==\S)/g },
  { type: "flag", re: /(?<=[\s=(])--?[A-Za-z][\w-]*/g },
];

function highlightCode(text) {
  return text.split("\n").map(highlightCodeLine).join("\n");
}

function highlightCodeLine(line) {
  if (/^\s*#/.test(line)) {
    return `<span class="tok-comment">${escapeHtml(line)}</span>`;
  }

  const ranges = [];
  const overlaps = (start, end) => ranges.some((r) => start < r.end && end > r.start);
  const add = (start, end, type) => {
    if (end > start && !overlaps(start, end)) ranges.push({ start, end, type });
  };

  const yamlKey = line.match(/^(\s*(?:-\s+)?)([A-Za-z_][\w.-]*):(?=\s|$)/);
  if (yamlKey && !CMD_WORDS.has(yamlKey[2])) {
    add(yamlKey[1].length, yamlKey[0].length, "key");
  }

  const leadingFlag = line.match(/^(\s*)(--?[A-Za-z][\w-]*)/);
  if (leadingFlag) {
    add(leadingFlag[1].length, leadingFlag[1].length + leadingFlag[2].length, "flag");
  }

  for (const { type, re } of TOKEN_SCANS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(line))) {
      add(match.index, match.index + match[0].length, type);
      if (re.lastIndex === match.index) re.lastIndex += 1;
    }
  }

  const cmdRe = /(^\s*|\|\s*|&&\s*|;\s*|\$\(\s*|\b(?:sudo|watch|xargs)\s+)([A-Za-z][\w.-]*)/g;
  let match;
  while ((match = cmdRe.exec(line))) {
    const word = match[2];
    if (!CMD_WORDS.has(word)) continue;
    const start = match.index + match[1].length;
    add(start, start + word.length, "cmd");
  }

  ranges.sort((a, b) => a.start - b.start);
  let html = "";
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    html += escapeHtml(line.slice(cursor, range.start));
    html += `<span class="tok-${range.type}">${escapeHtml(line.slice(range.start, range.end))}</span>`;
    cursor = range.end;
  }
  html += escapeHtml(line.slice(cursor));
  return html;
}

function codeLabel(text) {
  const lines = text.split("\n").filter((line) => line.trim());
  const yamlLines = lines.filter((line) => /^\s*(- )?[\w.-]+:(\s|$)/.test(line)).length;
  const cmdLines = lines.filter((line) => CMD_WORDS.has(line.trim().split(/\s+/)[0])).length;
  return yamlLines > cmdLines ? "YAML" : "Terminal";
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

function cleanModuleTitle(module) {
  return module.title.replace(new RegExp(`^${module.code}\\s*[-–·:]\\s*`, "i"), "");
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

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
