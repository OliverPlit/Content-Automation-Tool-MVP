/**
 * Shared image-generation helpers used by:
 *  - dashboard/generate/actions.ts (per-variant)
 *  - dashboard/images/new (standalone)
 *  - dashboard/library/[id]/image-actions.ts (regenerate)
 *
 * Provider: Nur Google Gemini 2.5 Flash Image ("Nano Banana").
 */
import { experimental_generateImage as generateImage } from "ai";
import { google } from "@/lib/ai/google-client";

export type ImageFormat = "1:1" | "9:16" | "4:5" | "16:9";

const DIMS: Record<ImageFormat, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "9:16": { width: 1024, height: 1536 },
  "4:5": { width: 1024, height: 1280 },
  "16:9": { width: 1536, height: 1024 },
};

export function formatDimensions(format: ImageFormat) {
  return DIMS[format];
}

export async function generateOneImage(opts: {
  prompt: string;
  format: ImageFormat;
}): Promise<{
  bytes: Uint8Array;
  mediaType: string;
  width: number;
  height: number;
}> {
  const { prompt, format } = opts;
  const result = await generateImage({
    model: google.image("gemini-2.5-flash-image"),
    prompt,
    aspectRatio: format,
  });
  const dims = DIMS[format];
  return {
    bytes: result.image.uint8Array,
    mediaType: result.image.mediaType || "image/png",
    width: dims.width,
    height: dims.height,
  };
}

export function classifyImageError(msg: string): string {
  const isQuota = /quota|rate.?limit|429|billing/i.test(msg);
  if (isQuota)
    return "Gemini API-Limit oder Billing-Problem. In Google AI Studio prüfen.";
  return msg;
}

export function inferExt(mediaType: string): string {
  if (mediaType.includes("png")) return "png";
  if (mediaType.includes("webp")) return "webp";
  if (mediaType.includes("jpeg") || mediaType.includes("jpg")) return "jpg";
  return mediaType.split("/")[1] ?? "png";
}
