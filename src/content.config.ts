import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const modules = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/modulos' }),
  schema: z.object({
    code: z.string().regex(/^M\d{2}$/),
    order: z.number().int().positive(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1),
    description: z.string().min(1),
    access: z.enum(['free', 'premium']),
    updated: z.coerce.date(),
    type: z.string().min(1).optional(),
    prerequisites: z.array(z.string()).optional(),
    environment: z.string().min(1).optional(),
    examWeight: z.number().min(0).max(100).optional(),
    estimatedMinutes: z.number().int().positive().optional(),
  }),
});

export const collections = { modules };
