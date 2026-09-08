import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import rehypeStudyStructure from './src/lib/rehype-study-structure.mjs';
import remarkStudyStructure from './src/lib/remark-study-structure.mjs';
import shikiCodeRole from './src/lib/shiki-code-role.mjs';

export default defineConfig({
  site: 'https://cka.kestrion.dev',
  output: 'static',
  integrations: [sitemap()],
  markdown: {
    shikiConfig: { transformers: [shikiCodeRole] },
    processor: unified({
      remarkPlugins: [remarkStudyStructure],
      rehypePlugins: [rehypeStudyStructure],
    }),
  },
});
