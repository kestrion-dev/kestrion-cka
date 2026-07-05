"use strict";

/*
 * Parser del material de estudio (CURSO-CKA-claude.txt).
 * Convierte el texto plano en una estructura de módulos, secciones y bloques:
 *   módulo  -> { id, code, title, meta[], sections[], raw }
 *   sección -> { id, title, level, kind, blocks[], timerMinutes?, raw }
 *   bloque  -> { type: text|note|task|success|code|ascii, text }
 *            | { type: quiz, label, question, answerBlocks[] }
 *            | { type: spoiler, label, blocks[] }
 * No modifica nunca el fichero original: solo lo interpreta.
 */
const CourseParser = (() => {
  function parseCourse(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const moduleStarts = [];

    lines.forEach((line, index) => {
      if (/^MODULO:\s*M\d+/i.test(line.trim())) {
        const separators = [];
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
          if (/^=+$/.test(lines[cursor].trim())) separators.push(cursor);
          if (separators.length === 2) break;
        }
        moduleStarts.push(separators[1] ?? separators[0] ?? index);
      }
    });

    return moduleStarts.map((start, idx) => {
      const end = moduleStarts[idx + 1] ?? lines.length;
      const moduleLines = stripModuleFooter(trimEmpty(lines.slice(start, end)));
      const code = findValue(moduleLines, "MODULO") || `M${String(idx).padStart(2, "0")}`;
      const title = extractModuleTitle(moduleLines, code);
      const meta = extractMeta(moduleLines);
      const sections = parseSections(moduleLines, code);
      return {
        id: slug(code),
        code,
        title,
        meta,
        sections,
        raw: moduleLines.join("\n"),
      };
    });
  }

  // El pie "==== / FIN Mxx / SIGUIENTE: ... / ====" no es contenido de estudio.
  function stripModuleFooter(lines) {
    const copy = [...lines];
    while (copy.length) {
      const value = copy[copy.length - 1].trim();
      if (!value || /^=+$/.test(value) || /^(FIN\s+M\d+|SIGUIENTE:|ENTORNO REQUERIDO)/i.test(value)) {
        copy.pop();
      } else {
        break;
      }
    }
    return copy;
  }

  function extractModuleTitle(lines, moduleCode) {
    const moduleIndex = lines.findIndex((line) => /^MODULO:/i.test(line.trim()));
    const before = lines.slice(0, Math.max(moduleIndex, 0)).filter((line) => {
      const value = line.trim();
      return value && !/^=+$/.test(value);
    });
    const joined = before.join(" ").replace(/\s+/g, " ").trim();
    return joined || `${moduleCode} - Modulo de estudio`;
  }

  function extractMeta(lines) {
    const keys = ["TIPO", "ENTORNO", "PRERREQUISITOS", "PESO EN EXAMEN", "TIEMPO ESTIMADO"];
    return keys
      .map((key) => {
        const value = findValue(lines, key);
        return value ? { key, value } : null;
      })
      .filter(Boolean);
  }

  function findValue(lines, key) {
    const line = lines.find((entry) => entry.trim().toUpperCase().startsWith(`${key}:`));
    return line ? line.slice(line.indexOf(":") + 1).trim() : "";
  }

  function parseSections(lines, moduleCode) {
    const starts = [];
    lines.forEach((line, index) => {
      const current = line.trim();
      const previous = lines[index - 1]?.trim() || "";
      const next = lines[index + 1]?.trim() || "";
      const isDecoratedHeading = current && /^-+$/.test(previous) && /^-+$/.test(next);
      const isUnderlinedHeading = current && /^-+$/.test(next) && !/^[-=]+$/.test(current);
      if ((isDecoratedHeading || isUnderlinedHeading) && !current.includes("<<'EOF'")) {
        starts.push(index);
      }
    });

    const uniqueStarts = [...new Set(starts)].filter((index) => !/^[-=]+$/.test(lines[index].trim()));

    if (!uniqueStarts.length) {
      return [buildSection(moduleCode, "Contenido", lines, new Map())];
    }

    const usedIds = new Map();
    let seenNumbered = false;

    // Las secciones sin cuerpo (títulos "1. ..." cuyo contenido está en las
    // subsecciones) se conservan como cabeceras de grupo para el índice.
    return uniqueStarts.map((start, idx) => {
      const end = uniqueStarts[idx + 1] ?? lines.length;
      const title = lines[start].trim();
      const bodyStart = /^-+$/.test(lines[start + 1]?.trim()) ? start + 2 : start + 1;
      const section = buildSection(moduleCode, title, lines.slice(bodyStart, end), usedIds, seenNumbered);
      if (/^\d+\.(?!\d)/.test(title)) seenNumbered = true;
      return section;
    });
  }

  function buildSection(moduleCode, title, bodyLines, usedIds, seenNumbered = false) {
    const kind = /CHECKPOINT/i.test(title)
      ? "checkpoint"
      : /LABORATORIO CRONOMETRADO/i.test(title)
        ? "lab"
        : "normal";

    let level = 1;
    if (/^\d+\.\d+/.test(title)) {
      level = 2;
    } else if (!/^\d+\./.test(title) && seenNumbered && kind === "normal") {
      // Subtítulos sin numerar (HERRAMIENTA 1:, CASO 2:, ...) que aparecen
      // después de secciones numeradas cuelgan de la sección anterior.
      level = 2;
    }

    const body = trimEmpty(bodyLines);
    let blocks;
    let timerMinutes = null;

    if (kind === "checkpoint") {
      blocks = parseCheckpointBlocks(body);
    } else if (kind === "lab") {
      const lab = parseLabBlocks(body);
      blocks = lab.blocks;
      timerMinutes = lab.timerMinutes;
    } else {
      blocks = parseBlocks(body);
    }

    return {
      id: uniqueSlug(`${moduleCode}-${title}`, usedIds),
      title,
      level,
      kind,
      blocks,
      timerMinutes,
      raw: body.join("\n"),
    };
  }

  // CHECKPOINT: pares "Pregunta N:" / "Respuesta esperada:".
  function parseCheckpointBlocks(lines) {
    const isQuestion = (line) => /^Pregunta\b[^:]*:/i.test(line.trim());
    const isAnswer = (line) => /^Respuesta\b[^:]*:/i.test(line.trim());
    const blocks = [];
    let i = 0;

    const intro = [];
    while (i < lines.length && !isQuestion(lines[i])) {
      intro.push(lines[i]);
      i += 1;
    }
    blocks.push(...parseBlocks(trimEmpty(intro)));

    while (i < lines.length) {
      const label = lines[i].trim().replace(/:\s*$/, "");
      i += 1;

      const questionLines = [];
      while (i < lines.length && !isAnswer(lines[i]) && !isQuestion(lines[i])) {
        questionLines.push(lines[i]);
        i += 1;
      }

      const answerLines = [];
      if (i < lines.length && isAnswer(lines[i])) {
        i += 1;
        while (i < lines.length && !isQuestion(lines[i])) {
          answerLines.push(lines[i]);
          i += 1;
        }
      }

      blocks.push({
        type: "quiz",
        label,
        question: trimEmpty(dedent(questionLines)).join("\n"),
        answerBlocks: parseBlocks(trimEmpty(dedent(answerLines))),
      });
    }

    return blocks;
  }

  // LABORATORIO CRONOMETRADO: minutos objetivo + solución tapada.
  function parseLabBlocks(lines) {
    const match = lines.join("\n").match(/completar en menos de\s+(\d+)\s+min/i);
    const timerMinutes = match ? Number(match[1]) : null;

    const solutionIndex = lines.findIndex((line) => /^SOLUCION DE REFERENCIA/i.test(line.trim()));
    if (solutionIndex === -1) {
      return { blocks: parseBlocks(lines), timerMinutes };
    }

    const blocks = parseBlocks(trimEmpty(lines.slice(0, solutionIndex)));
    blocks.push({
      type: "spoiler",
      label: lines[solutionIndex].trim().replace(/:\s*$/, ""),
      blocks: parseBlocks(trimEmpty(dedent(lines.slice(solutionIndex + 1)))),
    });
    return { blocks, timerMinutes };
  }

  function parseBlocks(lines) {
    const blocks = [];
    let buffer = [];
    let code = [];
    let inCode = false;
    let inHeredoc = false;

    const flushText = () => {
      // Los separadores decorativos (----- / =====) del TXT no son contenido.
      const clean = buffer.filter((entry) => !/^[-=]{4,}$/.test(entry.trim()));
      const text = trimEmpty(clean).join("\n").trim();
      if (text) blocks.push(classifyTextBlock(text));
      buffer = [];
    };

    const flushCode = () => {
      const text = trimEmpty(code).join("\n");
      if (text.trim()) blocks.push({ type: "code", text });
      code = [];
    };

    lines.forEach((line) => {
      const value = line.trim();
      const startsCode = isCodeStart(line);

      // Etiquetas en mayúsculas (OBJETIVO:, TAREA 1 - ...:) abren bloque
      // de texto propio para que la clasificación por primera línea funcione.
      if (!inCode && !startsCode && isLabelLine(value) && buffer.some((b) => b.trim())) {
        flushText();
      }

      if (!inCode && startsCode) {
        flushText();
        inCode = true;
        inHeredoc = value.includes("<<'EOF'") || value.includes('<<"EOF"') || value.includes("<<EOF");
        code.push(line);
        return;
      }

      if (inCode) {
        if (inHeredoc) {
          code.push(line);
          if (value === "EOF") {
            flushCode();
            inCode = false;
            inHeredoc = false;
          }
          return;
        }

        const previous = code[code.length - 1] || "";
        const bareYamlKey = /^[-\w.]+:\s*$/.test(value) && !isLabelLine(value);
        const continuesCode = startsCode || bareYamlKey || line.startsWith("  ") || line.startsWith("\t") || previous.trim().endsWith("\\");

        if (!value) {
          flushCode();
          inCode = false;
          return;
        }

        if (!continuesCode || isPlainHeading(value)) {
          flushCode();
          inCode = false;
          buffer.push(line);
          return;
        }

        code.push(line);
        return;
      }

      buffer.push(line);
    });

    if (inCode) flushCode();
    flushText();
    return blocks;
  }

  function isCodeStart(line) {
    const value = line.trim();
    if (/^(kubectl|k |cat |vim |source |alias |export |complete |sudo |systemctl|journalctl|crictl|etcdctl|kubeadm|curl |wget |apt |apt-get |modprobe |sysctl |mkdir |cp |mv |rm |grep |awk |openssl |watch |ssh |scp |containerd|swapoff|sed |echo )/.test(value)) {
      return !looksLikeProse(value);
    }
    if (isLabelLine(value)) return false;
    return value.startsWith("#")
      || value.includes("<<'EOF'")
      || /^[-\w.]+:\s*[\w"{[]/.test(value)
      || /^\s{2,}[-\w.]+:/.test(line);
  }

  // "kubectl create falla si el recurso ya existe." es prosa que habla de un
  // comando, no un comando: muchas palabras, conectores y sin sintaxis shell.
  function looksLikeProse(value) {
    if (/[=/|$<>{}[\]\\-]/.test(value)) return false;
    const words = value.split(/\s+/);
    if (words.length < 6) return false;
    return /[.,]$/.test(value) || /\s(si|que|es|son|un|una|el|la|los|las|de|para|o|y)\s/i.test(` ${value} `);
  }

  // Etiqueta estructural del material: OBJETIVO:, TAREA:, CRITERIOS DE EXITO:...
  function isLabelLine(value) {
    return /^[A-ZÁÉÍÓÚÑ][A-Z0-9ÁÉÍÓÚÑ ()-]{2,}:/.test(value);
  }

  function isPlainHeading(value) {
    return /^[A-Z0-9 .,:ÁÉÍÓÚÑ-]{4,}$/.test(value) && !value.startsWith("#") && !value.includes(": ");
  }

  function classifyTextBlock(text) {
    const lines = text.split("\n");
    const boxy = lines.filter((line) => /\+--|--\+|\|.*\||--+>|<--+/.test(line)).length;
    if (boxy >= 3 && boxy >= lines.length * 0.4) {
      return { type: "ascii", text };
    }

    const first = lines[0].trim().toUpperCase();
    if (first.includes("NOTA") || first.includes("IMPORTANTE") || first.includes("TRUCO") || first.includes("REGLA")) {
      return { type: "note", text };
    }
    if (first.includes("TAREA") || first.includes("OBJETIVO:")) {
      return { type: "task", text };
    }
    if (first.includes("CRITERIOS DE EXITO") || first.includes("CHECKPOINT")) {
      return { type: "success", text };
    }
    return { type: "text", text };
  }

  function dedent(lines) {
    const indents = lines
      .filter((line) => line.trim())
      .map((line) => line.match(/^\s*/)[0].length);
    const min = indents.length ? Math.min(...indents) : 0;
    return min ? lines.map((line) => line.slice(min)) : [...lines];
  }

  function trimEmpty(lines) {
    const copy = [...lines];
    while (copy.length && !copy[0].trim()) copy.shift();
    while (copy.length && !copy[copy.length - 1].trim()) copy.pop();
    return copy;
  }

  function slug(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  // ID estable por módulo+título (no por posición): añadir contenido al TXT
  // no invalida el progreso guardado de las secciones existentes.
  function uniqueSlug(value, usedIds) {
    const base = slug(value) || "seccion";
    const count = usedIds.get(base) || 0;
    usedIds.set(base, count + 1);
    return count ? `${base}-${count + 1}` : base;
  }

  return { parseCourse, slug };
})();
