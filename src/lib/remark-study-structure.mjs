function plainText(node) {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? '';
  return Array.isArray(node.children) ? node.children.map(plainText).join('') : '';
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^\d+(?:\.\d+)*\.?\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function walk(node, ids) {
  if (node.type === 'heading' && node.depth >= 2) {
    const base = slugify(plainText(node)) || 'seccion';
    const count = ids.get(base) ?? 0;
    const id = count === 0 ? base : `${base}-${count}`;
    ids.set(base, count + 1);
    node.data ??= {};
    node.data.hProperties = { ...node.data.hProperties, id };
  }

  if (node.type === 'code') {
    const role = node.meta?.trim();
    if (role) {
      node.data ??= {};
      node.data.hProperties = { ...node.data.hProperties, 'data-code-role': role };
    }
  }

  if (Array.isArray(node.children)) node.children.forEach((child) => walk(child, ids));
}

export default function remarkStudyStructure() {
  return (tree) => walk(tree, new Map());
}
