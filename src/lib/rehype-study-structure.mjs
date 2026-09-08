function element(tagName, properties = {}, children = []) {
  return { type: 'element', tagName, properties, children };
}

function text(value) {
  return { type: 'text', value };
}

function plainText(node) {
  if (node.type === 'text') return node.value ?? '';
  return Array.isArray(node.children) ? node.children.map(plainText).join('') : '';
}

function hasClass(node, className) {
  const classes = node.properties?.className;
  return Array.isArray(classes) ? classes.includes(className) : classes === className;
}

function nextElement(children, start) {
  for (let index = start; index < children.length; index += 1) {
    if (children[index].type === 'element') return index;
  }
  return -1;
}

function transformQuizzes(children) {
  for (let index = 0; index < children.length; index += 1) {
    const marker = children[index];
    if (marker.type !== 'element' || marker.tagName !== 'p' || !/^Pregunta\s+\d+$/i.test(plainText(marker).trim())) continue;

    const questionIndex = nextElement(children, index + 1);
    const answerIndex = nextElement(children, questionIndex + 1);
    const question = children[questionIndex];
    const answer = children[answerIndex];
    if (question?.tagName !== 'p' || answer?.tagName !== 'p' || !/^Respuesta:/i.test(plainText(answer).trim())) continue;

    marker.properties = { ...marker.properties, className: ['quiz-label'] };
    question.properties = { ...question.properties, className: ['quiz-question'] };
    answer.properties = { ...answer.properties, className: ['quiz-answer-text'] };
    const card = element('section', { className: ['quiz-card'] }, [
      marker,
      question,
      element('details', { className: ['quiz-answer'] }, [
        element('summary', {}, [text('Mostrar respuesta')]),
        answer,
      ]),
    ]);
    children.splice(index, answerIndex - index + 1, card);
  }
}

function solutionMarkerText(node) {
  if (node.type !== 'element' || node.tagName !== 'p') return null;
  const value = plainText(node).trim();
  if (/^Solución de referencia/i.test(value)) return value;
  if (/^Solución Tarea\s+\d+:?$/i.test(value)) return value;
  return null;
}

function solutionSummaryText(markerText) {
  const task = markerText.match(/^Solución Tarea\s+(\d+):?$/i);
  return task ? `Mostrar solución de referencia — Tarea ${task[1]}` : 'Mostrar solución de referencia';
}

function transformSolutions(children) {
  for (let index = 0; index < children.length; index += 1) {
    const markerText = solutionMarkerText(children[index]);
    if (!markerText) continue;

    let end = index + 1;
    while (
      end < children.length
      && !(children[end].type === 'element' && /^h[1-2]$/.test(children[end].tagName))
      && !solutionMarkerText(children[end])
    ) end += 1;
    const content = children.slice(index + 1, end);
    const details = element('details', { className: ['lab-solution'] }, [
      element('summary', {}, [text(solutionSummaryText(markerText))]),
      ...content,
    ]);
    children.splice(index, end - index, details);
  }
}

function insertTimers(children) {
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const heading = children[index];
    if (heading.type !== 'element' || heading.tagName !== 'h2' || !/laboratorio cronometrado/i.test(plainText(heading))) continue;

    let minutes = 10;
    for (let cursor = index + 1; cursor < children.length; cursor += 1) {
      const candidate = children[cursor];
      if (candidate.type === 'element' && candidate.tagName === 'h2') break;
      const match = plainText(candidate).match(/menos de\s+(\d+)\s+minutos/i);
      if (match) {
        minutes = Number(match[1]);
        break;
      }
    }

    const timer = element('section', {
      className: ['study-timer'],
      'data-study-timer': '',
      'data-target-seconds': String(minutes * 60),
      'aria-label': `Cronómetro, objetivo ${minutes} minutos`,
    }, [
      element('p', { className: ['timer-target'] }, [text(`Objetivo: ${minutes} minutos`)]),
      element('output', { className: ['timer-display'], 'aria-live': 'polite' }, [text(`${String(minutes).padStart(2, '0')}:00`)]),
      element('div', { className: ['timer-actions'] }, [
        element('button', { type: 'button', 'data-timer-toggle': '' }, [text('Iniciar')]),
        element('button', { type: 'button', 'data-timer-reset': '' }, [text('Reiniciar')]),
      ]),
    ]);
    children.splice(index + 1, 0, timer);
  }
}

function checkIcon() {
  return {
    type: 'element',
    tagName: 'svg',
    properties: { viewBox: '0 0 24 24', width: '13', height: '13', fill: 'none', stroke: 'currentColor', strokeWidth: '3.2', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
    children: [{ type: 'element', tagName: 'path', properties: { d: 'M4.5 12.8 9.6 18 19.5 6.5' }, children: [] }],
  };
}

function checklist(sectionId) {
  return element('div', { className: ['section-completion'] }, [
    element('button', {
      type: 'button',
      className: ['done-toggle'],
      'data-section-checklist': '',
      'data-id': sectionId,
      'aria-pressed': 'false',
      'aria-label': 'Marcar como estudiada',
      title: 'Marcar como estudiada',
    }, [checkIcon()]),
  ]);
}

function insertChecklists(children) {
  const headings = [];
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.type === 'element' && child.tagName === 'h2') headings.push(index);
  }

  for (let cursor = headings.length - 1; cursor >= 0; cursor -= 1) {
    const headingIndex = headings[cursor];
    const nextHeading = cursor + 1 < headings.length ? headings[cursor + 1] : children.length;
    const sectionId = children[headingIndex].properties?.id ?? `section-${cursor + 1}`;
    children.splice(nextHeading, 0, checklist(String(sectionId)));
  }
}

function findCodeRole(node) {
  if (node.type === 'element') {
    const role = node.properties?.dataCodeRole ?? node.properties?.['data-code-role'];
    if (role) return role;
  }
  if (!Array.isArray(node.children)) return undefined;
  for (const child of node.children) {
    const role = findCodeRole(child);
    if (role) return role;
  }
  return undefined;
}

function transformCodeBlocks(node) {
  if (!Array.isArray(node.children)) return;
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (child.type === 'element' && child.tagName === 'pre' && !hasClass(node, 'code-block')) {
      const role = findCodeRole(child);
      if (role) {
        const copyable = role === 'exec' || role === 'config';
        const controls = [element('span', { className: ['code-role'] }, [text(String(role))])];
        if (copyable) controls.push(element('button', { type: 'button', 'data-copy-code': '' }, [text('Copiar')]));
        node.children[index] = element('div', { className: ['code-block'], 'data-code-role': role }, [
          element('div', { className: ['code-toolbar'] }, controls),
          child,
        ]);
        continue;
      }
    }
    transformCodeBlocks(child);
  }
}

export default function rehypeStudyStructure() {
  return (tree) => {
    if (!Array.isArray(tree.children)) return;
    transformQuizzes(tree.children);
    transformSolutions(tree.children);
    insertTimers(tree.children);
    insertChecklists(tree.children);
    transformCodeBlocks(tree);
  };
}
