"use strict";

/*
 * Render puro de módulos/secciones/bloques a HTML: recibe la estructura que
 * produce parser.js y devuelve strings, sin tocar document/window/localStorage.
 * Lo carga la app (cka-study-web/index.html, como script global antes de
 * app.js) y también build-pages.js en Node, para que las páginas estáticas de
 * módulo se vean igual que la app interactiva.
 *
 * `opts.staticMode` distingue el modo de página estática (sin JS: quiz y
 * spoiler siempre abiertos, sin botones que dependan de listeners, sin
 * progreso ni cronómetro interactivo) del modo app normal (comportamiento
 * idéntico al de siempre).
 */

const ICONS = {
  sun: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.4"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.4 14.2A8.4 8.4 0 0 1 9.8 3.6a8.4 8.4 0 1 0 10.6 10.6Z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.8 9.6 18 19.5 6.5"/></svg>`,
};

/* ------------------------------------------------------------------ render */

function renderModuleArticle(module, { prev, next, progress = {}, opts = {} } = {}) {
  const staticMode = Boolean(opts.staticMode);
  const { done, total, pct } = moduleProgress(module, progress);

  const jump = (neighbor, dir) => {
    if (!neighbor) return "<span></span>";
    const label = `<span class="jump-dir">${dir === "prev" ? "← Anterior" : "Siguiente →"}</span><span class="jump-title">${escapeHtml(neighbor.code)} · ${escapeHtml(truncate(cleanModuleTitle(neighbor), 46))}</span>`;
    const cls = dir === "next" ? "module-jump jump-next" : "module-jump";
    return staticMode
      ? `<a class="${cls}" href="../${neighbor.slug}/">${label}</a>`
      : `<button class="${cls}" type="button" data-goto-module="${neighbor.id}">${label}</button>`;
  };

  return `
    <article class="module">
      <header class="module-hero">
        <div class="hero-row">
          <span class="module-chip">${escapeHtml(module.code)}</span>
          ${staticMode ? "" : `
          <div class="hero-meter">
            <span class="meter"><span class="meter-fill" style="width:${pct}%"></span></span>
            <span class="hero-meter-label">${done}/${total} secciones</span>
          </div>`}
        </div>
        <h2>${escapeHtml(cleanModuleTitle(module))}</h2>
        <div class="module-meta">
          ${module.meta.map((item) => `<span class="pill"><span class="pill-key">${escapeHtml(item.key)}</span>${escapeHtml(item.value)}</span>`).join("")}
        </div>
      </header>
      <div class="module-body">
        ${module.sections.map((section) => renderSection(section, progress, opts)).join("")}
      </div>
      <footer class="module-footer">
        ${jump(prev, "prev")}
        ${jump(next, "next")}
      </footer>
    </article>
  `;
}

function renderSection(section, progress = {}, opts = {}) {
  if (!section.blocks.length) {
    return `<h3 class="group-heading" id="${section.id}"><span>${escapeHtml(section.title)}</span></h3>`;
  }

  const staticMode = Boolean(opts.staticMode);
  const isDone = Boolean(progress[section.id]);
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
      </summary>
      <div class="section-body">
        ${section.kind === "lab" && section.timerMinutes ? renderTimer(section, opts) : ""}
        ${section.blocks.map((block) => renderBlock(block, opts)).join("")}
        ${staticMode ? "" : `
        <div class="section-completion">
          <button class="done-toggle ${isDone ? "on" : ""}" type="button" data-done="${section.id}"
                  aria-label="${isDone ? "Estudiada — clic para desmarcar" : "Marcar como estudiada"}"
                  aria-pressed="${isDone}" title="${isDone ? "Estudiada — clic para desmarcar" : "Marcar como estudiada"}">${ICONS.check}</button>
        </div>`}
      </div>
    </details>
  `;
}

/* ---------------------------------------------------------------- bloques */

function renderBlock(block, opts = {}) {
  const staticMode = Boolean(opts.staticMode);
  switch (block.type) {
    case "code": {
      const copyLabel = block.role === "config" ? "Copiar configuración" : "Copiar comando";
      const isCopyable = !staticMode && typeof block.copyText === "string";
      return `
        <div class="code-panel role-${escapeHtml(block.role || "legacy")}">
          <div class="code-toolbar">
            <span class="code-lang">${escapeHtml(codeBlockLabel(block))}</span>
            ${isCopyable
              ? `<button class="copy-button" type="button" data-copy data-copy-label="${copyLabel}">${copyLabel}</button>`
              : ""}
          </div>
          ${isCopyable ? `<span hidden data-copy-source>${escapeHtml(block.copyText)}</span>` : ""}
          <pre><code>${highlightCode(block.text)}</code></pre>
        </div>
      `;
    }
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
        <article class="quiz-card${staticMode ? " open" : ""}">
          <div class="quiz-head">
            <span class="quiz-num">${escapeHtml(block.label || "Pregunta")}</span>
          </div>
          <div class="quiz-question">${renderRichText(block.question)}</div>
          ${staticMode ? "" : `
          <button class="quiz-toggle" type="button" data-quiz-toggle>
            <span class="when-closed">Mostrar respuesta</span>
            <span class="when-open">Ocultar respuesta</span>
          </button>`}
          <div class="quiz-answer">
            ${block.answerBlocks.map((inner) => renderBlock(inner, opts)).join("")}
          </div>
        </article>
      `;
    case "spoiler":
      return `
        <div class="spoiler${staticMode ? " open" : ""}">
          ${staticMode ? "" : `
          <div class="spoiler-cover">
            <p class="spoiler-label">🔒 ${escapeHtml(block.label || "Solución de referencia")}</p>
            <button class="reveal-button" type="button" data-reveal>Mostrar solución</button>
          </div>
          <button class="spoiler-hide" type="button" data-reveal>Ocultar solución</button>`}
          <div class="spoiler-content">
            ${block.blocks.map((inner) => renderBlock(inner, opts)).join("")}
          </div>
        </div>
      `;
    default:
      return `<div class="text-block">${renderRichText(block.text)}</div>`;
  }
}

function codeBlockLabel(block) {
  switch (block.role) {
    case "exec":
      return "Terminal";
    case "output":
      return "Salida esperada";
    case "template":
      return block.language === "gotemplate" ? "Plantilla Helm" : `Plantilla · ${block.language}`;
    case "config":
      return `Configuración · ${block.language}`;
    case "reference":
      return "Referencia";
    default:
      return codeLabel(block.text);
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

function renderTimer(section, opts = {}) {
  if (opts.staticMode) {
    return `
      <p class="timer-static">⏱ Laboratorio cronometrado — objetivo: ≤ ${section.timerMinutes} min (cronómetro interactivo disponible en la app).</p>
    `;
  }
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

/* -------------------------------------------------- resaltado de sintaxis */

const CMD_WORDS = new Set((
  "kubectl k kubeadm etcdctl etcdutl crictl systemctl journalctl sudo cat vim nano curl wget ssh scp watch " +
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

// Las cabeceras de grupo (secciones sin bloques) no cuentan para el progreso.
function moduleProgress(module, progress = {}) {
  const real = module.sections.filter((s) => s.blocks.length);
  const done = real.filter((s) => progress[s.id]).length;
  const total = real.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function cleanModuleTitle(module) {
  return module.title.replace(new RegExp(`^${module.code}\\s*[-–·:]\\s*`, "i"), "");
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ICONS,
    renderModuleArticle,
    renderSection,
    renderBlock,
    renderCallout,
    renderRichText,
    renderTimer,
    codeBlockLabel,
    codeLabel,
    highlightCode,
    highlightCodeLine,
    moduleProgress,
    cleanModuleTitle,
    truncate,
    escapeHtml,
  };
}
