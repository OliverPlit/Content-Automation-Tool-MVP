import { z } from "zod";

export const TONES = [
  "professionell",
  "locker",
  "verspielt",
  "premium",
  "direkt",
] as const;

export const adVariantSchema = z.object({
  body: z.string().min(1).max(600),
  cta: z.string().min(1).max(60),
});

export const adCopySchema = z.object({
  headline: z.string().min(1).max(120),
  subline: z.string().min(1).max(200),
  variants: z.array(adVariantSchema).length(5),
});

export type AdCopy = z.infer<typeof adCopySchema>;
export type AdVariant = z.infer<typeof adVariantSchema>;

export type GenerateState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"product" | "audience" | "tone", string>>;
  output?: AdCopy;
  input?: { product: string; audience: string; tone: string };
};

export type SaveState = {
  ok: boolean;
  error?: string;
  savedId?: string;
};
