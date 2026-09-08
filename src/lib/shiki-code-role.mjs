const ROLES = new Set(['exec', 'config', 'output', 'reference']);

export default {
  name: 'kestrion-code-role',
  pre(node) {
    const meta = this.options.meta;
    const raw = typeof meta === 'string' ? meta : meta?.__raw;
    const role = raw?.trim();
    if (role && ROLES.has(role)) node.properties['data-code-role'] = role;
  },
};
