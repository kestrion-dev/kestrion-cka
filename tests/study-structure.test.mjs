import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import rehypeStudyStructure from '../src/lib/rehype-study-structure.mjs';
import remarkStudyStructure from '../src/lib/remark-study-structure.mjs';
import shikiCodeRole from '../src/lib/shiki-code-role.mjs';

const markdown = `## 1. Inicio

\`\`\`bash exec
kubectl get nodes
\`\`\`

\`\`\`text output
node-a Ready
\`\`\`

## 2. Checkpoint

**Pregunta 1**

¿Qué se comprueba?

Respuesta: la estructura.

## 3. Laboratorio cronometrado

Objetivo: completar en menos de 7 minutos.

\`\`\`yaml config
apiVersion: v1
kind: Namespace
\`\`\`

Solución de referencia, no mirar hasta terminar:

\`\`\`bash exec
kubectl create namespace prueba
\`\`\`
`;

test('genera la estructura de estudio sin retirar respuestas del HTML', async () => {
  const processor = await createMarkdownProcessor({
    remarkPlugins: [remarkStudyStructure],
    rehypePlugins: [rehypeStudyStructure],
    shikiConfig: { transformers: [shikiCodeRole] },
  });
  const result = await processor.render(markdown);
  const html = result.code;

  assert.deepEqual(result.metadata.headings.filter(({ depth }) => depth === 2).map(({ slug }) => slug), [
    'inicio',
    'checkpoint',
    'laboratorio-cronometrado',
  ]);
  assert.equal((html.match(/data-section-checklist/g) ?? []).length, 3);
  assert.equal((html.match(/data-copy-code/g) ?? []).length, 3);
  assert.match(html, /class="quiz-card"/);
  assert.match(html, /Respuesta: la estructura\./);
  assert.match(html, /data-target-seconds="420"/);
  assert.match(html, /class="lab-solution"/);
  assert.match(html, /data-code-role="output"/);
});

test('mantiene identificadores únicos cuando se repite un encabezado', async () => {
  const processor = await createMarkdownProcessor({ remarkPlugins: [remarkStudyStructure] });
  const result = await processor.render('## 1. Repetida\n\n## 2. Repetida\n');
  assert.deepEqual(result.metadata.headings.map(({ slug }) => slug), ['repetida', 'repetida-1']);
});
