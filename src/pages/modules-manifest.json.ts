import { getCollection, render } from 'astro:content';

export const prerender = true;

export async function GET() {
  const entries = (await getCollection('modules', ({ data }) => data.access === 'free'))
    .sort((a, b) => a.data.order - b.data.order);

  const modules = await Promise.all(entries.map(async (entry) => {
    const { headings } = await render(entry);
    return {
      slug: entry.data.slug,
      sectionIds: headings.filter(({ depth }) => depth === 2).map(({ slug }) => slug),
    };
  }));

  return new Response(JSON.stringify(modules), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
