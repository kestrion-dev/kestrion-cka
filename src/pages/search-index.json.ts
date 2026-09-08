import { getCollection } from 'astro:content';

export const prerender = true;

function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*_#[\]()<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET() {
  const modules = (await getCollection('modules', ({ data }) => data.access === 'free'))
    .sort((a, b) => a.data.order - b.data.order)
    .map(({ body, data }) => ({
      code: data.code,
      title: data.title,
      description: data.description,
      slug: data.slug,
      text: plainText(body ?? ''),
    }));

  return new Response(JSON.stringify(modules), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
