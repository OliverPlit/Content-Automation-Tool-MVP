// Creatomate template registry.
// Fill the `id` field with the template UUID from your Creatomate project.
// Leave empty strings until a template exists — the UI will show a disabled
// "Template-ID fehlt" state instead of attempting the render.

export type TemplateKind = "staticSquare" | "animatedSquare" | "reelVertical";

export type TemplateConfig = {
  kind: TemplateKind;
  id: string;
  label: string;
  description: string;
  aspectRatio: string;
  outputExt: "jpg" | "png" | "mp4";
};

export const TEMPLATES: Record<TemplateKind, TemplateConfig> = {
  staticSquare: {
    kind: "staticSquare",
    id: process.env.CREATOMATE_TEMPLATE_STATIC_SQUARE ?? "",
    label: "Static 1:1",
    description: "Quadratisches Bild für Insta-Feed (JPG)",
    aspectRatio: "1:1",
    outputExt: "jpg",
  },
  animatedSquare: {
    kind: "animatedSquare",
    id: process.env.CREATOMATE_TEMPLATE_ANIMATED_SQUARE ?? "",
    label: "Animated 1:1",
    description: "Quadratisches Video für Insta-Feed (MP4, ~5 Sek)",
    aspectRatio: "1:1",
    outputExt: "mp4",
  },
  reelVertical: {
    kind: "reelVertical",
    id: process.env.CREATOMATE_TEMPLATE_REEL_VERTICAL ?? "",
    label: "Reel 9:16",
    description: "Hochformat-Video für Story / Reels / TikTok (MP4, ~6 Sek)",
    aspectRatio: "9:16",
    outputExt: "mp4",
  },
};

export function getTemplate(kind: TemplateKind): TemplateConfig {
  return TEMPLATES[kind];
}
