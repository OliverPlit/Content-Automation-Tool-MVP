// Creatomate template registry.
// Static metadata is safe in client bundles; the actual IDs are read from
// env vars in server-side code (render-actions.ts + page.tsx) and the
// availability is passed down to client components as a prop.

export type TemplateKind = "staticSquare" | "animatedSquare" | "reelVertical";

export type TemplateMeta = {
  kind: TemplateKind;
  label: string;
  description: string;
  aspectRatio: string;
  outputExt: "jpg" | "png" | "mp4";
  envVar: string;
};

export const TEMPLATE_META: Record<TemplateKind, TemplateMeta> = {
  staticSquare: {
    kind: "staticSquare",
    label: "Static 9:16",
    description: "Hochformat-Standbild für Story / Reels-Cover (JPG)",
    aspectRatio: "9:16",
    outputExt: "jpg",
    envVar: "CREATOMATE_TEMPLATE_STATIC_SQUARE",
  },
  animatedSquare: {
    kind: "animatedSquare",
    label: "Animated 1:1",
    description: "Quadratisches Video für Insta-Feed (MP4, ~5 Sek)",
    aspectRatio: "1:1",
    outputExt: "mp4",
    envVar: "CREATOMATE_TEMPLATE_ANIMATED_SQUARE",
  },
  reelVertical: {
    kind: "reelVertical",
    label: "Reel 9:16",
    description: "Hochformat-Video für Story / Reels / TikTok (MP4, ~6 Sek)",
    aspectRatio: "9:16",
    outputExt: "mp4",
    envVar: "CREATOMATE_TEMPLATE_REEL_VERTICAL",
  },
};

// SERVER-ONLY: reads env vars. Do NOT import this in client components.
export function getTemplateId(kind: TemplateKind): string {
  const meta = TEMPLATE_META[kind];
  return process.env[meta.envVar] ?? "";
}

// SERVER-ONLY: which template kinds have a non-empty ID configured.
export function getTemplateAvailability(): Record<TemplateKind, boolean> {
  return {
    staticSquare: !!getTemplateId("staticSquare"),
    animatedSquare: !!getTemplateId("animatedSquare"),
    reelVertical: !!getTemplateId("reelVertical"),
  };
}
