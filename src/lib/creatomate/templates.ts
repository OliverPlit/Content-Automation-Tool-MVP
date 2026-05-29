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

export type TemplateKind = "staticSquare" | "animatedSquare" | "reelVertical";

export type TemplateKindMeta = {
  kind: TemplateKind;
  label: string;
  description: string;
  aspectRatio: string;
  outputExt: "jpg" | "png" | "mp4";
};

export const TEMPLATE_META: Record<TemplateKind, TemplateKindMeta> = {
  staticSquare: {
    kind: "staticSquare",
    label: "Static 9:16",
    description: "Hochformat-Standbild für Story / Reels-Cover (JPG)",
    aspectRatio: "9:16",
    outputExt: "jpg",
  },
  animatedSquare: {
    kind: "animatedSquare",
    label: "Animated 1:1",
    description: "Quadratisches Video für Insta-Feed (MP4, ~5 Sek)",
    aspectRatio: "1:1",
    outputExt: "mp4",
  },
  reelVertical: {
    kind: "reelVertical",
    label: "Reel 9:16",
    description: "Hochformat-Video für Story / Reels / TikTok (MP4, ~6 Sek)",
    aspectRatio: "9:16",
    outputExt: "mp4",
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
}
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
  };
}
