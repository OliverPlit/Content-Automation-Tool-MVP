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

// Strict schema — used by generateObject (OpenAI Structured Outputs verlangt
// alle Felder REQUIRED, .optional() ist da nicht erlaubt).
export const adCopySchema = z.object({
  headline: z.string().min(1).max(60),
  subline: z.string().min(1).max(120),
  variants: z.array(adVariantSchema).min(1).max(10),
  imagePrompt: z.string().min(1).max(800),
});

// Single self-contained creative variant — used for parallel generation,
// where every variant gets its OWN headline + subline + body + cta + image.
export const generatedVariantSchema = z.object({
  headline: z.string().min(1).max(60),
  subline: z.string().min(1).max(120),
  body: z.string().min(1).max(300),
  cta: z.string().min(1).max(30),
  imagePrompt: z.string().min(1).max(800),
});

export type GeneratedVariant = z.infer<typeof generatedVariantSchema> & {
  index: number;
  imageUrl?: string;
  imageError?: string;
};

// Loose schema — zum Parsen aus der DB, damit Legacy-Rows (vor diesem
// Feature) ohne imagePrompt weiter funktionieren. Wird in Library/Render/
// Image-Action-Code verwendet, wo nur GELESEN wird.
export const adCopyLooseSchema = z.object({
  headline: z.string().min(1).max(200),
  subline: z.string().min(1).max(300),
  variants: z
    .array(
      z.object({
        body: z.string().min(1).max(600),
        cta: z.string().min(1).max(60),
      }),
    )
    .min(1)
    .max(10),
  imagePrompt: z.string().max(800).optional().default(""),
});

export type AdCopy = z.infer<typeof adCopySchema>;
export type AdVariant = z.infer<typeof adVariantSchema>;

// ---------------------------------------------------------------------------
// State-Typen
// ---------------------------------------------------------------------------
export const IMAGE_SOURCES = ["ai", "upload", "url"] as const;
export type ImageSource = (typeof IMAGE_SOURCES)[number];

// ---------------------------------------------------------------------------
// Bild-Stil-Presets — werden als Suffix an den AI-Image-Prompt angehängt,
// damit User ohne Prompt-Engineering einen konsistenten Look bekommt.
// ---------------------------------------------------------------------------
export const IMAGE_STYLES = [
  {
    value: "auto",
    label: "🎲 Auto (passt zum Kontext)",
    promptSuffix: "",
    hint: "Lässt das Modell selbst entscheiden, was zur Maschine passt.",
  },
  {
    value: "cinematic",
    label: "🎬 Cinematic",
    promptSuffix:
      "dramatic film lighting, anamorphic lens, deep shadows, cinematic composition, color graded look",
    hint: "Kino-Look — dramatische Schatten, filmische Stimmung.",
  },
  {
    value: "studio",
    label: "📸 Studio Product",
    promptSuffix:
      "professional studio lighting, clean seamless background, sharp focus, premium advertising photography",
    hint: "Studio-Setting — sauberer Hintergrund, scharfer Fokus.",
  },
  {
    value: "golden_hour",
    label: "🌅 Golden Hour",
    promptSuffix:
      "warm golden hour sunset lighting, long soft shadows, atmospheric mood, lens flare",
    hint: "Warmes Abendlicht — emotional, hochwertig.",
  },
  {
    value: "industrial",
    label: "🔧 Industrial Gritty",
    promptSuffix:
      "raw industrial setting, metal textures, dramatic contrast, gritty atmosphere, hard light",
    hint: "Roh-industriell — Werkstatt-Feeling, harter Kontrast.",
  },
  {
    value: "lifestyle",
    label: "🌿 Lifestyle Natural",
    promptSuffix:
      "outdoor lifestyle scene, natural daylight, authentic candid feel, shallow depth of field",
    hint: "Authentischer Outdoor-Look — natürliches Licht, lebensnah.",
  },
] as const;

export type ImageStyleValue = (typeof IMAGE_STYLES)[number]["value"];

export type GenerateInput = {
  product: string;
  audience: string;
  tone: (typeof TONES)[number];
  machine: MachineValue;
  angle: AngleValue;
  websiteText?: string;
  variantCount: number;
  imageSource: ImageSource;
  customImageUrl?: string;
  imageStyle: ImageStyleValue;
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
  variants?: GeneratedVariant[]; // jede Variante = eigenständiges Creative
  input?: GenerateInput;
};

// ---------------------------------------------------------------------------
// Prompt-Template-Daten (zum Vorausfüllen des Generate-Forms)
// ---------------------------------------------------------------------------
export const promptTemplateDataSchema = z.object({
  product: z.string().max(500).optional().or(z.literal("")),
  audience: z.string().max(300).optional().or(z.literal("")),
  tone: z.enum(TONES).optional(),
  machine: z.string().max(40).optional().or(z.literal("")),
  angle: z.string().max(40).optional().or(z.literal("")),
  variantCount: z.coerce.number().int().min(1).max(10).optional(),
  imageStyle: z.string().max(40).optional().or(z.literal("")),
});

export type PromptTemplateData = z.infer<typeof promptTemplateDataSchema>;

export type SaveState = {
  ok: boolean;
  error?: string;
  savedId?: string;
  // Welche Variante wurde gerade gespeichert (1-basierter Index aus dem Grid)
  savedVariantIndex?: number;
};
