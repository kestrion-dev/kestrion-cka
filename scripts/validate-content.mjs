import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED = ['code', 'order', 'slug', 'title', 'description', 'access', 'updated'];
const ROLES = new Set(['bash exec', 'yaml config', 'text output', 'text reference']);

function scalar(value) {
  const trimmed = value.trim();
  if (/^(['"]).*\1$/.test(trimmed)) return trimmed.slice(1, -1);
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export function validateDocument(source, filename, knownSlugs = new Set()) {
  const errors = [];
  const lines = source.split(/\r?\n/);
  if (lines[0] !== '---') return [`${filename}:1: falta el frontmatter inicial`];
  const end = lines.indexOf('---', 1);
  if (end === -1) return [`${filename}:1: frontmatter sin cerrar`];

  const data = {};
  const metadataLines = {};
  for (let index = 1; index < end; index += 1) {
    const match = lines[index].match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!match) continue;
    data[match[1]] = scalar(match[2]);
    metadataLines[match[1]] = index + 1;
  }

  for (const field of REQUIRED) {
    if (data[field] === undefined || data[field] === '') errors.push(`${filename}:1: falta el campo obligatorio ${field}`);
  }
  if (data.code && !/^M\d{2}$/.test(data.code)) errors.push(`${filename}:${metadataLines.code}: code debe usar M seguido de dos dígitos`);
  if (data.order && (!Number.isInteger(data.order) || data.order < 1)) errors.push(`${filename}:${metadataLines.order}: order debe ser un entero positivo`);
  if (data.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) errors.push(`${filename}:${metadataLines.slug}: slug no es válido`);
  if (data.access && !['free', 'premium'].includes(data.access)) errors.push(`${filename}:${metadataLines.access}: access debe ser free o premium`);
  if (data.access === 'premium') errors.push(`${filename}:${metadataLines.access}: el contenido premium no puede formar parte de la salida estática`);
  if (data.updated && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.updated))) errors.push(`${filename}:${metadataLines.updated}: updated debe usar YYYY-MM-DD`);
  if (data.slug && path.basename(filename) !== `${data.slug}.md`) errors.push(`${filename}:${metadataLines.slug}: el nombre del fichero debe coincidir con el slug`);

  let fence = null;
  let h1Found = false;
  for (let index = end + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const marker = line.match(/^```(.*)$/);
    if (marker) {
      if (fence) {
        if (marker[1] !== '') errors.push(`${filename}:${index + 1}: cierre de bloque inválido`);
        fence = null;
      } else {
        const role = marker[1].trim();
        if (!ROLES.has(role)) errors.push(`${filename}:${index + 1}: rol de bloque desconocido: ${role || '(vacío)'}`);
        fence = { role, line: index + 1 };
      }
      continue;
    }
    if (!fence && !h1Found && /^#\s/.test(line)) {
      h1Found = true;
      errors.push(`${filename}:${index + 1}: el cuerpo debe comenzar en H2; el layout genera el H1`);
    }
    if (fence?.role === 'bash exec' && /<[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][^>\n]*>/.test(line)) {
      errors.push(`${filename}:${index + 1}: placeholder prohibido dentro de bash exec`);
    }
  }
  if (fence) errors.push(`${filename}:${fence.line}: bloque sin cerrar`);

  for (let index = end + 1; index < lines.length; index += 1) {
    for (const match of lines[index].matchAll(/\]\(\/modulos\/([a-z0-9-]+)\/?(?:#[^)]+)?\)/g)) {
      if (!knownSlugs.has(match[1])) errors.push(`${filename}:${index + 1}: referencia a módulo inexistente: ${match[1]}`);
    }
  }

  return { data, errors };
}

export async function validateDirectory(directory) {
  const names = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
  const documents = await Promise.all(names.map(async (name) => ({
    name,
    source: await readFile(path.join(directory, name), 'utf8'),
  })));
  const preliminary = documents.map(({ name, source }) => validateDocument(source, name));
  const slugs = new Set(preliminary.map((result) => result.data?.slug).filter(Boolean));
  const results = documents.map(({ name, source }) => validateDocument(source, name, slugs));
  const errors = results.flatMap((result) => result.errors);

  for (const field of ['slug', 'code', 'order']) {
    const seen = new Map();
    for (let index = 0; index < results.length; index += 1) {
      const value = results[index].data?.[field];
      if (value === undefined) continue;
      if (seen.has(value)) errors.push(`${documents[index].name}:1: ${field} duplicado con ${seen.get(value)}`);
      else seen.set(value, documents[index].name);
    }
  }
  return errors;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const directory = path.resolve(process.argv[2] ?? 'src/content/modulos');
  const errors = await validateDirectory(directory);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Contenido válido: ${directory}`);
  }
}
