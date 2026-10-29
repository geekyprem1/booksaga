import { z } from 'zod';

const price = z.number().finite().min(0).max(100000);
const model = z
  .string()
  .trim()
  .max(150)
  .regex(/^[a-zA-Z0-9._:/-]*$/, 'Invalid model name.');
export const aiSettingsSchema = z.object({
  model: model,
  fastModel: model,
  pricing: z.record(
    z
      .string()
      .min(1)
      .max(150)
      .regex(/^[a-zA-Z0-9._:/-]+$/),
    z.object({
      inputPerM: price,
      outputPerM: price,
      cachedInputPerM: price,
    }),
  ),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;
