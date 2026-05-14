import { z } from "zod";

// ---------------------------------------------------------------------------
// Tonfall (bestehend)
// ---------------------------------------------------------------------------
export const TONES = [
  "professionell",
  "locker",
  "verspielt",
  "premium",
  "direkt",
] as const;

// ---------------------------------------------------------------------------
// Maschinen-Kontext — bestimmt Bild-Szene + Texter-Subkontext
// ---------------------------------------------------------------------------
export const MACHINES = [
  {
    value: "landwirtschaft",
    label: "Landwirtschaft / Traktor",
    sceneHint:
      "tractor on a freshly harvested field, golden hour lighting, agricultural setting, yellow lubricant canister visible in the foreground",
  },
  {
    value: "werkstatt",
    label: "Werkstatt / KFZ",
    sceneHint:
      "professional auto repair workshop, dramatic side lighting, car on a hydraulic lift, professional oil bottles on shelf",
  },
  {
    value: "lkw",
    label: "LKW / Transport",
    sceneHint:
      "heavy-duty truck on a highway at dawn, industrial landscape, motion blur, yellow lubricant canister near a service area",
  },
  {
    value: "industrie",
    label: "Industrie / Hydraulik",
    sceneHint:
      "industrial pipes and hydraulic systems, warm orange and yellow industrial lighting, oil drum next to machinery",
  },
  {
    value: "motorrad",
    label: "Motorrad",
    sceneHint:
      "motorcycle on a mountain road, close-up detail of engine and chain, lubricant bottle visible",
  },
  {
    value: "bau",
    label: "Baumaschinen",
    sceneHint:
      "excavator or wheel loader on a construction site, dramatic dust and light, lubricant drum nearby, powerful industrial mood",
  },
  {
    value: "winterdienst",
    label: "Winterdienst / Forst",
    sceneHint:
      "snow groomer or forestry machine in snowy alpine landscape, blue-cold light, yellow lubricant canister in foreground",
  },
] as const;

export type MachineValue = (typeof MACHINES)[number]["value"];

// ---------------------------------------------------------------------------
// Angles — Werbe-Botschaft-Richtung
// ---------------------------------------------------------------------------
export const ANGLES = [
  {
    value: "direkt",
    label: "Direkt vom Hersteller",
    voiceHint:
      "Direktkauf-Vorteil: günstiger, schneller, ohne Zwischenhändler. Phrasen wie 'ohne Umwege', 'direkt beim Hersteller'.",
  },
  {
    value: "tradition",
    label: "Qualität & Tradition",
    voiceHint:
      "Seit-1946-Story, österreichische Qualität, Generationen-Erfahrung. Vertrauen über Geschichte aufbauen.",
  },
  {
    value: "performance",
    label: "Maschinen-Performance",
    voiceHint:
      "Schutz, Leistung, Lebensdauer der Maschine. Technisch konkret aber kurz, kein Marketing-Geschwätz.",
  },
  {
    value: "preis",
    label: "Preis / Angebot",
    voiceHint:
      "Konkreter Sparen-Hook, Mengenrabatt, Aktion. Aktiver CTA: 'Jetzt sichern!', 'Direkt bestellen!'.",
  },
  {
    value: "saison",
    label: "Saisonal / Aktuell",
    voiceHint:
      "Erntezeit, Wintervorbereitung, Frühjahrs-Check. Zeitnaher Anlass als Aufhänger.",
  },
  {
    value: "nachhaltigkeit",
    label: "Nachhaltigkeit",
    voiceHint:
      "Bio-Öle, biologisch abbaubar, regionale Produktion. Sachlich bleiben, kein Greenwashing.",
  },
] as const;

export type AngleValue = (typeof ANGLES)[number]["value"];

// ---------------------------------------------------------------------------
// Output-Schema (Ad-Copy) — kürzere Limits, Bild-Prompt mit drin
// ---------------------------------------------------------------------------
export const adVariantSchema = z.object({
  body: z.string().min(1).max(300),
  cta: z.string().min(1).max(30),
});

export const adCopySchema = z.object({
  headline: z.string().min(1).max(60),
  subline: z.string().min(1).max(120),
  variants: z.array(adVariantSchema).min(1).max(10),
  // Optional + Default für Backward-Compat: Legacy-Rows (vor diesem Feature)
  // haben kein imagePrompt; neue Generierungen befüllen es immer.
  imagePrompt: z.string().max(800).optional().default(""),
});

export type AdCopy = z.infer<typeof adCopySchema>;
export type AdVariant = z.infer<typeof adVariantSchema>;

// ---------------------------------------------------------------------------
// State-Typen
// ---------------------------------------------------------------------------
export type GenerateInput = {
  product: string;
  audience: string;
  tone: (typeof TONES)[number];
  machine: MachineValue;
  angle: AngleValue;
  websiteText?: string;
  variantCount: number;
};

export type GenerateState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<
    Record<
      | "product"
      | "audience"
      | "tone"
      | "machine"
      | "angle"
      | "variantCount",
      string
    >
  >;
  output?: AdCopy;
  input?: GenerateInput;
  imageUrl?: string;
  imageError?: string;
};

export type SaveState = {
  ok: boolean;
  error?: string;
  savedId?: string;
};
