/**
 * Plattform → empfohlene Render-Formate.
 *
 * Wenn der User im Studio eine Plattform auswählt (z.B. "Meta Feed"),
 * setzen wir die 3 Render-Slots automatisch auf die für diese Plattform
 * optimalen Formate.
 *
 * Reihenfolge in der Liste = Reihenfolge der Slots (Slot 1, Slot 2, Slot 3).
 *
 * Die Werte sind TemplateKinds aus templates.ts — die Slot-Auswahl
 * (welcher Style innerhalb des Kinds) bleibt dem Default-Slot überlassen
 * und nimmt den ersten Verfügbaren des Kinds (siehe getDefaultSlot).
 */

import type { TemplateKind } from "./templates";

export type RenderPlatform =
  | "meta_feed"
  | "meta_reels"
  | "instagram_story"
  | "tiktok"
  | "linkedin"
  | "youtube_shorts"
  | "google_display";

export const PLATFORM_LABELS: Record<RenderPlatform, string> = {
  meta_feed: "Meta Feed",
  meta_reels: "Reels",
  instagram_story: "Story",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube_shorts: "YouTube Shorts",
  google_display: "Google Display",
};

export const PLATFORM_FORMAT_PRESETS: Record<
  RenderPlatform,
  [TemplateKind, TemplateKind, TemplateKind]
> = {
  // Meta Feed: 4:5 hat den höchsten organischen CTR auf Insta/FB, dazu
  // 1:1 als Quadrat-Standard und 1:1 animiert für mehr Stop-Power.
  meta_feed: ["static_4x5", "static_1x1", "reel_1x1"],

  // Meta Reels (Insta + FB Reels): 9:16-Video Hauptformat, statisches
  // 9:16 als Cover-Frame, 1:1-Animation für Cross-Posting im Feed.
  meta_reels: ["reelVertical", "staticSquare", "reel_1x1"],

  // Instagram Story: gleich wie Reels, anderes Posting-Verhalten.
  instagram_story: ["reelVertical", "staticSquare", "reel_1x1"],

  // TikTok: nur 9:16, deshalb zweimal Reel (User wählt Variante via Dropdown)
  // + 1:1 Animation als Cross-Posting-Backup.
  tiktok: ["reelVertical", "reelVertical", "reel_1x1"],

  // LinkedIn: Landscape dominiert, 1:1 als Sponsored-Square, Video-Landscape.
  linkedin: ["static_16x9", "static_1x1", "reel_16x9"],

  // YouTube Shorts: 9:16 wie Reels + Cover + 1:1-Cross-Post.
  youtube_shorts: ["reelVertical", "staticSquare", "reel_1x1"],

  // Google Display: alle drei Static-Aspektratios — Display-Netzwerk
  // mischt Landscape/Square/Portrait je Placement.
  google_display: ["static_16x9", "static_4x5", "static_1x1"],
};

/**
 * Hilfs-Lookup. Robust gegen unbekannte Werte → null.
 */
export function getPresetForPlatform(
  platform: string,
): [TemplateKind, TemplateKind, TemplateKind] | null {
  if (platform in PLATFORM_FORMAT_PRESETS) {
    return PLATFORM_FORMAT_PRESETS[platform as RenderPlatform];
  }
  return null;
}
