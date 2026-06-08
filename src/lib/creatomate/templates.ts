// Creatomate template registry — Pool pro Kind.
//
// Jeder Kind (staticSquare / animatedSquare / reelVertical) kann mehrere
// Template-Varianten haben (z.B. "Bold Headline", "Centered Quote", "Minimal").
// Jede Variante ist ein "Slot" mit eigenem Label und eigener Env-Var.
//
// Die CREATOMATE-IDs landen NICHT ins Client-Bundle — sie werden nur in
// Server-Code via getTemplatePool / getTemplateBySlot gelesen. Client-Komponenten
// bekommen die fertige Pool-Liste als prop.
//
// Backwards-Compat: die alten Env-Vars (CREATOMATE_TEMPLATE_STATIC_SQUARE etc.)
// bleiben als Default-Slot pro Kind erhalten.

// Format-Kinds. Die ersten 3 sind die historischen — bleiben für DB-Backwards-Compat
// (alte creative_renders-Rows haben sie als template_kind gespeichert).
// Neu dazugekommen sind 4:5 Static (Meta Feed) + 1:1 Static (Insta Feed) +
// 16:9 Static (LinkedIn/Display) + 1:1 Animated als Reel-Variante.
export type TemplateKind =
  | "staticSquare"
  | "animatedSquare"
  | "reelVertical"
  // Neue Format-Kinds (RF1)
  | "static_1x1"
  | "static_4x5"
  | "static_16x9"
  | "reel_1x1"
  | "reel_16x9";

export type TemplateKindMeta = {
  kind: TemplateKind;
  label: string;
  description: string;
  aspectRatio: string;
  outputExt: "jpg" | "png" | "mp4";
  /** Plattform-Hinweis für UI */
  platforms: string;
};

export const TEMPLATE_META: Record<TemplateKind, TemplateKindMeta> = {
  staticSquare: {
    kind: "staticSquare",
    label: "Static 9:16",
    description: "Hochformat-Standbild für Story / Reels-Cover",
    aspectRatio: "9:16",
    outputExt: "jpg",
    platforms: "Story · Reels-Cover · TikTok",
  },
  animatedSquare: {
    kind: "animatedSquare",
    label: "Animated 1:1",
    description: "Quadratisches Video für Insta-Feed (~5 Sek)",
    aspectRatio: "1:1",
    outputExt: "mp4",
    platforms: "Insta Feed · Meta Feed",
  },
  reelVertical: {
    kind: "reelVertical",
    label: "Reel 9:16",
    description: "Hochformat-Video für Story / Reels / TikTok (~6 Sek)",
    aspectRatio: "9:16",
    outputExt: "mp4",
    platforms: "Reels · Stories · TikTok · Shorts",
  },
  // Neue Static-Formate
  static_1x1: {
    kind: "static_1x1",
    label: "Static 1:1",
    description: "Quadratisches Standbild für Insta-Feed",
    aspectRatio: "1:1",
    outputExt: "jpg",
    platforms: "Insta Feed · Meta Feed · LinkedIn",
  },
  static_4x5: {
    kind: "static_4x5",
    label: "Static 4:5",
    description: "Vertikales Feed-Bild — höchster CTR auf Meta",
    aspectRatio: "4:5",
    outputExt: "jpg",
    platforms: "Meta Feed (+CTR-Lift)",
  },
  static_16x9: {
    kind: "static_16x9",
    label: "Static 16:9",
    description: "Landscape-Bild für LinkedIn / Display",
    aspectRatio: "16:9",
    outputExt: "jpg",
    platforms: "LinkedIn · Google Display · YouTube",
  },
  // Neue Animated-Formate
  reel_1x1: {
    kind: "reel_1x1",
    label: "Animated 1:1 (Reel)",
    description: "Quadratisches Video mit Hook-Animation",
    aspectRatio: "1:1",
    outputExt: "mp4",
    platforms: "Insta Feed · Meta Feed",
  },
  reel_16x9: {
    kind: "reel_16x9",
    label: "Animated 16:9",
    description: "Landscape-Video für YouTube / Display",
    aspectRatio: "16:9",
    outputExt: "mp4",
    platforms: "YouTube · Google Display · LinkedIn",
  },
};

// ---------------------------------------------------------------------------
// Pool pro Kind. Jeder Eintrag = ein Creatomate-Template, das du im
// Render-UI auswählen kannst. Neue Templates fügst du hier hinzu:
//   1. Eintrag in TEMPLATE_POOL ergänzen mit eigenem slot + envVar.
//   2. Env-Var in .env.local + Vercel setzen (echte Creatomate-UUID).
//   3. fertig — taucht automatisch im Dropdown auf.
//
// slot: eindeutiger Identifier (nicht ändern, wird in DB persistiert).
// envVar: Name der Env-Var mit der Creatomate-UUID.
// ---------------------------------------------------------------------------

type TemplateSlotConfig = {
  slot: string;
  kind: TemplateKind;
  label: string;
  description: string;
  envVar: string;
};

const TEMPLATE_POOL: TemplateSlotConfig[] = [
  // ── Static 9:16 ────────────────────────────────────────────────────────
  {
    slot: "static_default",
    kind: "staticSquare",
    label: "Default",
    description: "Standard-Layout — Headline oben, Produktbild unten.",
    envVar: "CREATOMATE_TEMPLATE_STATIC_SQUARE",
  },
  {
    slot: "static_bold",
    kind: "staticSquare",
    label: "Bold Headline",
    description: "Große Headline auf farbigem Hintergrund.",
    envVar: "CREATOMATE_TEMPLATE_STATIC_BOLD",
  },
  {
    slot: "static_minimal",
    kind: "staticSquare",
    label: "Minimal",
    description: "Wenig Text, viel Whitespace, premium Look.",
    envVar: "CREATOMATE_TEMPLATE_STATIC_MINIMAL",
  },

  // ── Animated 1:1 ───────────────────────────────────────────────────────
  {
    slot: "animated_default",
    kind: "animatedSquare",
    label: "Default",
    description: "Standard-Animation — Headline-Slide + Produktbild-Reveal.",
    envVar: "CREATOMATE_TEMPLATE_ANIMATED_SQUARE",
  },
  {
    slot: "animated_zoom",
    kind: "animatedSquare",
    label: "Zoom-In",
    description: "Kameralinse-Zoom auf Produktbild, Headline-Fade.",
    envVar: "CREATOMATE_TEMPLATE_ANIMATED_ZOOM",
  },

  // ── Reel 9:16 ──────────────────────────────────────────────────────────
  {
    slot: "reel_default",
    kind: "reelVertical",
    label: "Default",
    description: "Standard-Reel-Layout mit Hook-Headline + CTA-End-Card.",
    envVar: "CREATOMATE_TEMPLATE_REEL_VERTICAL",
  },
  {
    slot: "reel_bold",
    kind: "reelVertical",
    label: "Bold Hook",
    description: "Dramatischer 3-Sek-Hook mit Bold-Headline-Reveal.",
    envVar: "CREATOMATE_TEMPLATE_REEL_BOLD",
  },
  {
    slot: "reel_ugc",
    kind: "reelVertical",
    label: "UGC-Style",
    description: "Authentischer User-Generated-Content-Look, Untertitel.",
    envVar: "CREATOMATE_TEMPLATE_REEL_UGC",
  },
  {
    slot: "reel_mein_neues_template",
    kind: "reelVertical",
    label: "Mein neues Template",
    description: "Beschreibung für das Dropdown.",
    envVar: "CREATOMATE_TEMPLATE_REEL_MEIN_NEUES_TEMPLATE",
  },

  // ── Static 1:1 (RF1 — Insta Feed Square) ──────────────────────────────
  {
    slot: "static_1x1_default",
    kind: "static_1x1",
    label: "Default",
    description: "Quadratisches Standbild für Insta-Feed.",
    envVar: "CREATOMATE_TEMPLATE_STATIC_1X1",
  },
  {
    slot: "static_1x1_bold",
    kind: "static_1x1",
    label: "Bold Headline",
    description: "Große Headline mit farbigem Block.",
    envVar: "CREATOMATE_TEMPLATE_STATIC_1X1_BOLD",
  },

  // ── Static 4:5 (RF1 — Meta Feed Portrait) ─────────────────────────────
  {
    slot: "static_4x5_default",
    kind: "static_4x5",
    label: "Default",
    description: "Vertikales 4:5 Feed-Bild für Meta-Feed (+22 % CTR).",
    envVar: "CREATOMATE_TEMPLATE_STATIC_4X5",
  },
  {
    slot: "static_4x5_bold",
    kind: "static_4x5",
    label: "Bold Hook",
    description: "Großer Hook oben, Produktbild unten.",
    envVar: "CREATOMATE_TEMPLATE_STATIC_4X5_BOLD",
  },

  // ── Static 16:9 (RF1 — LinkedIn / Display Landscape) ──────────────────
  {
    slot: "static_16x9_default",
    kind: "static_16x9",
    label: "Default",
    description: "Landscape-Bild für LinkedIn-Feed / Google Display.",
    envVar: "CREATOMATE_TEMPLATE_STATIC_16X9",
  },
  {
    slot: "static_16x9_minimal",
    kind: "static_16x9",
    label: "Minimal",
    description: "Subtile Headline + großer Whitespace.",
    envVar: "CREATOMATE_TEMPLATE_STATIC_16X9_MINIMAL",
  },

  // ── Reel 1:1 (RF1 — Square Video für IG Feed) ─────────────────────────
  {
    slot: "reel_1x1_default",
    kind: "reel_1x1",
    label: "Default",
    description: "Quadratisches Video mit Hook-Animation.",
    envVar: "CREATOMATE_TEMPLATE_REEL_1X1",
  },

  // ── Reel 16:9 (RF1 — Landscape Video YouTube/Display) ─────────────────
  {
    slot: "reel_16x9_default",
    kind: "reel_16x9",
    label: "Default",
    description: "Landscape-Video für YouTube-Ads / Display.",
    envVar: "CREATOMATE_TEMPLATE_REEL_16X9",
  },
];

// Public type for client-side use. envVar bleibt drin, aber das ist nur der
// NAME der Env-Var (kein Geheimnis) — hilft dem User zu sehen, was er setzen muss.
export type TemplateOption = {
  slot: string;
  kind: TemplateKind;
  label: string;
  description: string;
  envVar: string;
  available: boolean; // ist die Env-Var gesetzt?
};

// SERVER-ONLY: liefert ALLE Slots eines Kinds (auch die ohne Env-Var).
// Available-Flag zeigt, ob die Env-Var aktiv ist. Die echte UUID bleibt
// ausschließlich serverseitig.
export function getTemplatePool(kind: TemplateKind): TemplateOption[] {
  return TEMPLATE_POOL.filter((t) => t.kind === kind).map((t) => ({
    slot: t.slot,
    kind: t.kind,
    label: t.label,
    description: t.description,
    envVar: t.envVar,
    available: cleanEnv(process.env[t.envVar]).length > 0,
  }));
}

/**
 * Bereinigt Whitespace, Anführungszeichen und unsichtbare Zeichen aus
 * Env-Werten — sonst scheitert Creatomate stillschweigend mit 400, wenn
 * z.B. eine UUID in .env.local mit Quotes oder einem Tab umrahmt ist.
 */
function cleanEnv(raw: string | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/^["'‘’“”]+|["'‘’“”]+$/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

// SERVER-ONLY: pool für alle Kinds zusammen
export function getAllTemplatePools(): Record<TemplateKind, TemplateOption[]> {
  return {
    staticSquare: getTemplatePool("staticSquare"),
    animatedSquare: getTemplatePool("animatedSquare"),
    reelVertical: getTemplatePool("reelVertical"),
    static_1x1: getTemplatePool("static_1x1"),
    static_4x5: getTemplatePool("static_4x5"),
    static_16x9: getTemplatePool("static_16x9"),
    reel_1x1: getTemplatePool("reel_1x1"),
    reel_16x9: getTemplatePool("reel_16x9"),
  };
}

// SERVER-ONLY: Slot → Creatomate-UUID (oder null wenn unbekannt/Env fehlt).
export function getTemplateBySlot(
  slot: string,
): { slot: string; kind: TemplateKind; label: string; creatomateId: string } | null {
  const cfg = TEMPLATE_POOL.find((t) => t.slot === slot);
  if (!cfg) return null;
  const creatomateId = cleanEnv(process.env[cfg.envVar]);
  if (!creatomateId) return null;
  return {
    slot: cfg.slot,
    kind: cfg.kind,
    label: cfg.label,
    creatomateId,
  };
}

/**
 * SERVER-ONLY: Diagnose-Helper für UI-Fehlermeldungen.
 * Gibt detailliert zurück WARUM ein Slot fehlschlagen würde.
 */
export function diagnoseSlot(slot: string): {
  exists: boolean;
  envVar: string | null;
  envVarSet: boolean;
  envVarRaw: string;
  resolvedId: string;
  hint: string;
} {
  const cfg = TEMPLATE_POOL.find((t) => t.slot === slot);
  if (!cfg) {
    return {
      exists: false,
      envVar: null,
      envVarSet: false,
      envVarRaw: "",
      resolvedId: "",
      hint: `Slot "${slot}" ist nicht in TEMPLATE_POOL definiert.`,
    };
  }
  const rawValue = process.env[cfg.envVar] ?? "";
  const cleaned = cleanEnv(rawValue);
  const envVarSet = rawValue.length > 0;
  let hint = "OK";
  if (!envVarSet) {
    hint = `Env-Var ${cfg.envVar} ist NICHT gesetzt. Lege sie in .env.local (lokal) und in Vercel-Settings (Production) an, Wert = Creatomate-Template-UUID.`;
  } else if (!cleaned) {
    hint = `Env-Var ${cfg.envVar} ist gesetzt, enthält aber nach Trim/Quote-Strip nichts mehr. Prüfe ob nur Anführungszeichen/Whitespace drin steht.`;
  } else if (cleaned !== rawValue) {
    hint = `Env-Var ${cfg.envVar} hatte Whitespace/Quotes drumherum — wurde bereinigt. Wenn Creatomate trotzdem 400 sagt, ist die UUID falsch oder das Template gelöscht.`;
  }
  return {
    exists: true,
    envVar: cfg.envVar,
    envVarSet,
    envVarRaw: rawValue,
    resolvedId: cleaned,
    hint,
  };
}

// SERVER-ONLY: Default-Slot pro Kind (= erstes verfügbares Template).
export function getDefaultSlot(kind: TemplateKind): string | null {
  const pool = getTemplatePool(kind);
  return pool.find((p) => p.available)?.slot ?? null;
}

/**
 * SERVER-ONLY: Liefert die Env-Var-Namen ALLER Slots eines Kinds.
 * Hilft für klarere Fehlermeldungen wenn keiner verfügbar ist.
 */
export function getEnvVarsForKind(kind: TemplateKind): string[] {
  return TEMPLATE_POOL.filter((t) => t.kind === kind).map((t) => t.envVar);
}

/**
 * SERVER-ONLY: Findet doppelte Creatomate-Template-UUIDs.
 *
 * Häufiger User-Fehler: dieselbe UUID in mehrere Env-Vars copy-pasten →
 * Renders verschiedener Formate produzieren immer das gleiche Output (weil
 * Creatomate immer dasselbe Template rendert).
 *
 * Returns: Array von Gruppen, wo mehrere Slots auf die GLEICHE UUID zeigen.
 *   [{ uuid, slots: [{ slot, envVar, kind }] }, …]
 *
 * Leeres Array = alle Slots haben unique UUIDs (oder sind nicht gesetzt).
 */
export function findSharedTemplateIds(): {
  uuid: string;
  slots: { slot: string; envVar: string; kind: TemplateKind }[];
}[] {
  const byUuid = new Map<
    string,
    { slot: string; envVar: string; kind: TemplateKind }[]
  >();
  for (const t of TEMPLATE_POOL) {
    const uuid = cleanEnv(process.env[t.envVar]);
    if (!uuid) continue;
    const arr = byUuid.get(uuid) ?? [];
    arr.push({ slot: t.slot, envVar: t.envVar, kind: t.kind });
    byUuid.set(uuid, arr);
  }
  const dupes: {
    uuid: string;
    slots: { slot: string; envVar: string; kind: TemplateKind }[];
  }[] = [];
  for (const [uuid, slots] of byUuid.entries()) {
    if (slots.length > 1) dupes.push({ uuid, slots });
  }
  return dupes;
}

// SERVER-ONLY: Backwards-compat: alte API. Liefert UUID für Default-Slot.
export function getTemplateId(kind: TemplateKind): string {
  const slot = getDefaultSlot(kind);
  if (!slot) return "";
  return getTemplateBySlot(slot)?.creatomateId ?? "";
}

// SERVER-ONLY: welche Kinds haben mindestens ein VERFÜGBARES Template
export function getTemplateAvailability(): Record<TemplateKind, boolean> {
  return {
    staticSquare: getTemplatePool("staticSquare").some((p) => p.available),
    animatedSquare: getTemplatePool("animatedSquare").some((p) => p.available),
    reelVertical: getTemplatePool("reelVertical").some((p) => p.available),
    static_1x1: getTemplatePool("static_1x1").some((p) => p.available),
    static_4x5: getTemplatePool("static_4x5").some((p) => p.available),
    static_16x9: getTemplatePool("static_16x9").some((p) => p.available),
    reel_1x1: getTemplatePool("reel_1x1").some((p) => p.available),
    reel_16x9: getTemplatePool("reel_16x9").some((p) => p.available),
  };
}
