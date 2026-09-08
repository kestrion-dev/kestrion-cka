import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateDirectory, validateDocument } from '../scripts/validate-content.mjs';

const valid = `---
code: M01
order: 1
slug: entorno-kubectl
title: Entorno y kubectl
description: Preparación del entorno para el examen.
access: free
updated: "2026-09-07"
---

## Preparación

\`\`\`bash exec
kubectl get pods
\`\`\`
`;

test('acepta un módulo mínimo válido', () => {
  const result = validateDocument(valid, 'entorno-kubectl.md', new Set(['entorno-kubectl']));
  assert.deepEqual(result.errors, []);
});

test('rechaza roles desconocidos y placeholders ejecutables', () => {
  const source = valid.replace('bash exec\nkubectl get pods', 'bash legacy\nkubectl get pod <nombre>');
  const result = validateDocument(source, 'entorno-kubectl.md', new Set(['entorno-kubectl']));
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /rol de bloque desconocido/);
});

test('rechaza placeholders dentro de bash exec', () => {
  const source = valid.replace('kubectl get pods', 'kubectl get pod <nombre>');
  const result = validateDocument(source, 'entorno-kubectl.md', new Set(['entorno-kubectl']));
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /placeholder prohibido/);
});

test('rechaza H1 en el cuerpo y contenido premium', () => {
  const source = valid.replace('access: free', 'access: premium').replace('## Preparación', '# Título repetido');
  const result = validateDocument(source, 'entorno-kubectl.md', new Set(['entorno-kubectl']));
  assert.equal(result.errors.length, 2);
});

test('no confunde un comentario "#" dentro de un bloque de código con un H1', () => {
  const source = `${valid}\n\`\`\`yaml config\n# comentario de configuracion\n\`\`\`\n`;
  const result = validateDocument(source, 'entorno-kubectl.md', new Set(['entorno-kubectl']));
  assert.deepEqual(result.errors, []);
});

test('rechaza referencias a módulos inexistentes', () => {
  const source = `${valid}\n[Continuar](/modulos/no-existe/)\n`;
  const result = validateDocument(source, 'entorno-kubectl.md', new Set(['entorno-kubectl']));
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /referencia a módulo inexistente/);
});

test('rechaza metadatos duplicados entre módulos', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kestrion-validator-'));
  try {
    await writeFile(path.join(directory, 'entorno-kubectl.md'), valid);
    await writeFile(
      path.join(directory, 'arquitectura-kubernetes.md'),
      valid.replace('slug: entorno-kubectl', 'slug: arquitectura-kubernetes'),
    );
    const errors = await validateDirectory(directory);
    assert.equal(errors.filter((error) => /code duplicado|order duplicado/.test(error)).length, 2);
  } finally {
    await rm(directory, { recursive: true });
  }
});
