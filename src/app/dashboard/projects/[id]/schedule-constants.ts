/**
 * Konstanten + Types für das Scheduling-Modul.
 *
 * In separates Modul ausgelagert, weil schedule-actions.ts „use server"
 * trägt und deshalb nur async Funktionen + Types exportieren darf.
 * Diese Datei hier ist „normal" und kann von Client-Components importiert
 * werden, ohne die Server-Action-Regeln zu verletzen.
 */

export type PostStatus =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "live"
  | "paused"
  | "archived";

export const POST_STATUSES: {
  value: PostStatus;
  label: string;
  emoji: string;
  color: string;
}[] = [
  { value: "draft",     label: "Draft",     emoji: "📝", color: "slate" },
  { value: "review",    label: "Review",    emoji: "👀", color: "amber" },
  { value: "approved",  label: "Approved",  emoji: "✓",  color: "blue" },
  { value: "scheduled", label: "Scheduled", emoji: "📅", color: "purple" },
  { value: "live",      label: "Live",      emoji: "🚀", color: "emerald" },
  { value: "paused",    label: "Paused",    emoji: "⏸",  color: "orange" },
  { value: "archived",  label: "Archiv",    emoji: "📦", color: "stone" },
];

export const TARGET_PLATFORMS: {
  value: string;
  label: string;
  emoji: string;
}[] = [
  { value: "meta_feed",       label: "Meta Feed",       emoji: "📘" },
  { value: "meta_reels",      label: "Reels",           emoji: "🎬" },
  { value: "instagram_story", label: "Story",           emoji: "📲" },
  { value: "tiktok",          label: "TikTok",          emoji: "🎵" },
  { value: "linkedin",        label: "LinkedIn",        emoji: "💼" },
  { value: "youtube_shorts",  label: "YouTube Shorts",  emoji: "▶️" },
  { value: "google_display",  label: "Google Display",  emoji: "🔎" },
];
