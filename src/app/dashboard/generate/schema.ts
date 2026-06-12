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
// Branchen-Quick-Pick — OPTIONALER Stil-Anker für die Bild-Szene.
// "auto" (Default) bedeutet: Szene wird AUS Produkt + Zielgruppe + Angle
// abgeleitet, KEIN Branchen-Bias. Die folgenden Werte sind nur dann hilfreich,
// wenn der User wirklich in einer dieser Branchen ist — sonst lieber "auto"
// lassen. Historisch waren das harte Schmieröl-Defaults; durch "auto" können
// jetzt beliebige Produkte (Kosmetik, Lebensmittel, SaaS, Mode, …) generiert
// werden, ohne dass Werkstatt-/Industrie-Bilder erzwungen werden.
// ---------------------------------------------------------------------------
export const MACHINES = [
  {
    value: "auto",
    label: "Automatisch (aus Produkt herleiten)",
    sceneHint: "",
  },
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
// Strenge Längen-Limits — orientiert an Meta-Ads-Standards für maximalen CTR:
// - Headline 40 Z.: Facebook Mobile cuttet bei 27-40 Zeichen
// - Subline 80 Z.: passt in Stories/Reels-Overlay ohne Truncation
// - Body 150 Z.: Facebook Primary Text optimal ≤125, 150 lässt Puffer
// - CTA 20 Z.: Button-Standard, alles drüber wird umgebrochen
export const adVariantSchema = z.object({
  body: z.string().min(1).max(150),
  cta: z.string().min(1).max(20),
  // Per-Variant-Texte (UV-1).
  // Optional, weil ältere Creatives die Top-Level-headline/subline teilen.
  // Wenn gesetzt, gewinnt Variant-Wert in Render + Workspace.
  headline: z.string().min(1).max(40).optional(),
  subline: z.string().min(1).max(80).optional(),
});

// Strict schema — used by generateObject (OpenAI Structured Outputs verlangt
// alle Felder REQUIRED, .optional() ist da nicht erlaubt).
export const adCopySchema = z.object({
  headline: z.string().min(1).max(40),
  subline: z.string().min(1).max(80),
  variants: z.array(adVariantSchema).min(1).max(10),
  imagePrompt: z.string().min(1).max(800),
});

// Single self-contained creative variant — used for parallel generation,
// where every variant gets its OWN headline + subline + body + cta + image.
export const generatedVariantSchema = z.object({
  headline: z.string().min(1).max(40),
  subline: z.string().min(1).max(80),
  body: z.string().min(1).max(150),
  cta: z.string().min(1).max(20),
  imagePrompt: z.string().min(1).max(800),
});

export type GeneratedVariant = z.infer<typeof generatedVariantSchema> & {
  index: number;
  imageUrl?: string;
  // Phase B (Doc 4.6) — wenn imageVariantCount > 1, alle generierten Bilder.
  // imageUrl bleibt = imageUrls[0] für Backwards-Compat.
  imageUrls?: string[];
  // Produktbild-Overlay (Upload/URL aus Generate-Form) — wird beim Speichern
  // in creative_images.product_image_url gepackt, für Creatomate-Render.
  productImageUrl?: string;
  imageError?: string;
  // Phase A: Pre-Flight Quality-Score (Doc 3.8)
  score?: number;
  scoreIssues?: string[];
  // Plan-Metadaten (welche Achsen die Variante repräsentiert)
  hook?: HookValue;
  framework?: FrameworkValue;
  lever?: PersuasionLeverValue | null;
  // Aufgelöster Bild-Stil dieser Variante (bei "auto" rotiert er pro Variante).
  // Für die Feature-Persistenz (Self-Learning Phase 0).
  imageStyle?: ImageStyleValue;
  // Self-Learning Phase 3 — erwartete CTR (Anteil 0..1) + Daten-Konfidenz.
  predictedCtr?: number;
  predictedCtrConfidence?: number;
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
        // UV-1 — pro Variante eigene Texte (optional, Legacy fallbackt auf root).
        headline: z.string().min(1).max(200).optional(),
        subline: z.string().min(1).max(300).optional(),
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
// Bild-Stil-Presets — werden als Suffix an den AI-Image-Prompt angehängt.
// NEU (Doc 6.4 + Motion 2024): wir setzen auf authentische statt polierte
// Werbefoto-Looks. UGC/Documentary schlagen Studio-Look um +22 % CTR.
// "magazine-grade commercial" / "studio lighting" sind RAUS, weil diese
// Phrasen Diffusion-Modelle in den künstlichen Werbung-Modus schalten.
// ---------------------------------------------------------------------------
export const IMAGE_STYLES = [
  {
    value: "auto",
    label: "🎲 Auto (passt zum Kontext)",
    promptSuffix: "",
    hint: "Lässt das Modell selbst entscheiden.",
  },
  {
    value: "ugc_phone",
    label: "📱 UGC Phone (natürlich)",
    promptSuffix:
      "shot on iPhone 15 Pro back camera, vertical handheld framing, natural daylight, slight grain, candid unposed moment, real environment, no studio lighting",
    hint: "iPhone-Look · candid · handheld. +22 % CTR vs. Studio (Motion 2024).",
  },
  {
    value: "documentary",
    label: "🎞️ Documentary 35mm",
    promptSuffix:
      "documentary photography, 35mm film grain, available light only, natural skin tones, unposed subject, slight motion blur, photojournalistic feel",
    hint: "Filmkorn-Look · available light · erzählerisch.",
  },
  {
    value: "on_location_raw",
    label: "🛠️ On-Location Raw",
    promptSuffix:
      "on-location shot in real workshop or field, raw and unpolished, real props in background, hard ambient light, dust and wear visible, no commercial polish",
    hint: "Echte Werkstatt/Hof · roh · maximal Anti-Werbung-Look.",
  },
  {
    value: "golden_hour",
    label: "🌅 Golden Hour",
    promptSuffix:
      "warm golden hour sunlight, long soft shadows, atmospheric haze, natural lens flare, available light only",
    hint: "Warmes Abendlicht · emotional aber natürlich.",
  },
  {
    value: "lifestyle",
    label: "🌿 Lifestyle Natural",
    promptSuffix:
      "outdoor lifestyle scene, natural daylight, authentic candid feel, shallow depth of field, real-world environment",
    hint: "Outdoor · natürliches Licht · lebensnah.",
  },
] as const;

export type ImageStyleValue = (typeof IMAGE_STYLES)[number]["value"];

// ---------------------------------------------------------------------------
// Awareness-Level (Eugene Schwartz) — Phase A.1
// 5 = Unaware, 1 = Most Aware. Beeinflusst Hook-Pool, Framework-Pool, Default-CTA.
// ---------------------------------------------------------------------------
export const AWARENESS = [
  { value: 5, label: "Unaware — kennt das Problem nicht", ctaDefault: "Mehr erfahren", hint: "Story-getrieben, Frage oder Statistik. Keine direkte Produktanpreisung." },
  { value: 4, label: "Problem-aware — kennt Schmerz, nicht die Lösung", ctaDefault: "Lösung ansehen", hint: "Schmerz-Hook + Mechanismus-Andeutung. Keine reinen Feature-Listen." },
  { value: 3, label: "Solution-aware — vergleicht Lösungen", ctaDefault: "Vergleich starten", hint: "USP + Vergleich + Mechanismus. Kein generisches 'bestes'." },
  { value: 2, label: "Product-aware — vergleicht Anbieter", ctaDefault: "Direkt anfragen", hint: "Beweis + Risikoumkehr + Sozialnachweis. Keine Story-Hooks." },
  { value: 1, label: "Most aware — will nur Preis", ctaDefault: "60L-Fass jetzt sichern", hint: "Preis + Mengenrabatt + Urgency. Keine Story, kein Mechanismus." },
] as const;

export type AwarenessValue = (typeof AWARENESS)[number]["value"];

export const AWARENESS_PROMPT_HINTS: Record<number, string> = Object.fromEntries(
  AWARENESS.map((a) => [a.value, a.hint]),
);

// ---------------------------------------------------------------------------
// 12 strukturierte Hook-Pattern (Doc 3.2)
// ---------------------------------------------------------------------------
export const HOOKS = [
  { value: "question",    label: "Frage mit Du",        awarenessFit: [4, 5],    structure: "Frage, die das Problem im Kopf aktiviert.", exampleSeed: "Wann hast Du Dein Hydrauliköl zuletzt gewechselt?" },
  { value: "negation",    label: "Negation/Stop",       awarenessFit: [3, 4],    structure: "Verhindere einen häufigen Fehler.",         exampleSeed: "Mach diesen Fehler nicht beim Öl-Kauf." },
  { value: "number",      label: "Zahl + Behauptung",   awarenessFit: [2, 3, 4], structure: "Konkrete Zahl als Hook, dann Claim.",       exampleSeed: "1.500 Betriebsstunden mit einem Fass HLP 46." },
  { value: "ifThen",      label: "Wenn-Dann",           awarenessFit: [3, 4],    structure: "Wenn-Bedingung, dann-Imperativ.",           exampleSeed: "Wenn Deine Hydraulik 5+ Jahre alt ist, lies das." },
  { value: "comparison",  label: "Vergleichsbruch",     awarenessFit: [2, 3],    structure: "A vs. B mit Delta-Zahl.",                   exampleSeed: "Werkstattöl vs. Direktware — 30 % Unterschied." },
  { value: "implication", label: "Implikation/Drohung", awarenessFit: [3, 4],    structure: "Konsequenz der Untätigkeit in Geld/Zeit.",  exampleSeed: "Schmieröl-Fehler kosten 3.000 EUR Schaden." },
  { value: "secret",      label: "Geheimnis/Reveal",    awarenessFit: [4, 5],    structure: "Insider-Information.",                       exampleSeed: "Was Hersteller über Billigöl nicht sagen." },
  { value: "avatar",      label: "Spezifischer Avatar", awarenessFit: [3, 4],    structure: "Direkte Adressierung einer Nische.",        exampleSeed: "Für Landwirte mit John Deere 6er-Serie." },
  { value: "season",      label: "Zeitbezug/Saison",    awarenessFit: [3, 4],    structure: "Aktueller Anlass als Aufhänger.",           exampleSeed: "Vor der Ernte — Hydraulik-Check in 5 Minuten." },
  { value: "counter",     label: "Counter-intuitive",   awarenessFit: [4, 5],    structure: "Bewusste Erwartungs-Umkehrung.",            exampleSeed: "Teures Öl macht Maschinen kaputt." },
  { value: "proof",       label: "Beweis-First",        awarenessFit: [1, 2],    structure: "Social Proof als allererstes.",             exampleSeed: "12.000 Bauern. 75 Jahre. Ein Hersteller." },
  { value: "mechanism",   label: "Mechanismus-Hook",    awarenessFit: [2, 3],    structure: "So funktioniert die Lösung physikalisch.",   exampleSeed: "So schützt HLP 46 bei 80 Grad Öltemperatur." },
] as const;

export type HookValue = (typeof HOOKS)[number]["value"];

// ---------------------------------------------------------------------------
// Copy-Frameworks als Skelett-Templates (Doc 3.4)
// ---------------------------------------------------------------------------
export const FRAMEWORKS = [
  { value: "PAS",         label: "PAS — Problem/Aggravate/Solution", awarenessFit: [3, 4],    skeleton: "Body-Satz 1: Problem-Statement (1 Satz). Body-Satz 2: Aggravate — konkrete Konsequenz. Body-Satz 3: Solution mit Produkt-USP." },
  { value: "BAB",         label: "BAB — Before/After/Bridge",        awarenessFit: [4, 5],    skeleton: "Body-Satz 1: Status quo / Pain. Body-Satz 2: Zielzustand. Body-Satz 3: Brücke (= Produkt) erklärt." },
  { value: "FAB",         label: "FAB — Feature/Advantage/Benefit",  awarenessFit: [2, 3],    skeleton: "Body-Satz 1: konkrete Feature/Spec. Body-Satz 2: technischer Vorteil. Body-Satz 3: Nutzen für Maschine/Werkstatt." },
  { value: "mechanism",   label: "Mechanism-First",                  awarenessFit: [3],       skeleton: "Body-Satz 1: Wie wirkt das Produkt physikalisch? Body-Satz 2: Warum führt das zu Ergebnis X? Body-Satz 3: Beweis/Zahl." },
  { value: "halbertAIDA", label: "Halbert AIDA+ (aggressive DR)",    awarenessFit: [1, 2],    skeleton: "Body-Satz 1: Interrupt mit Zahl/Schmerz. Body-Satz 2: Engage mit Detail. Body-Satz 3: konkretes Angebot + Urgency." },
] as const;

export type FrameworkValue = (typeof FRAMEWORKS)[number]["value"];

// ---------------------------------------------------------------------------
// Cialdini-Persuasion-Hebel (Multi-Select, max 2) (Doc 3.3)
// ---------------------------------------------------------------------------
export const PERSUASION_LEVERS = [
  { value: "authority",    label: "Authority (DIN, OEM, 75 Jahre)" },
  { value: "socialProof",  label: "Social Proof (12.000 Werkstätten)" },
  { value: "scarcity",     label: "Scarcity (80 Fass auf Lager)" },
  { value: "lossAversion", label: "Loss Aversion (Verlust-Frame)" },
  { value: "reciprocity",  label: "Reciprocity (Gratis-Bonus)" },
  { value: "commitment",   label: "Commitment (Stell-Dir-vor-Frame)" },
  { value: "unity",        label: "Liking/Unity (Wir-Familienbetriebe)" },
  { value: "anchor",       label: "Anchor (statt X — jetzt Y)" },
] as const;

export type PersuasionLeverValue = (typeof PERSUASION_LEVERS)[number]["value"];

// ---------------------------------------------------------------------------
// Anrede — Du / Sie (Doc 7.4)
// ---------------------------------------------------------------------------
export const ADDRESSINGS = ["du", "sie"] as const;
export type AddressingValue = (typeof ADDRESSINGS)[number];

// ---------------------------------------------------------------------------
// Plattform (Doc 5.4) — bestimmt Headline-Max, Bild-Aspekt-Ratio und Hook-Bias
// ---------------------------------------------------------------------------
export const PLATFORMS = [
  {
    value: "meta_feed",
    label: "Meta Feed",
    emoji: "📘",
    aspectRatio: "4:5" as const,
    headlineMax: 40,
    bodyMax: 150,
    hookBias: ["season", "avatar", "comparison"] as HookValue[],
    hint: "Facebook + Instagram Feed · 4:5 vertikal · Hooks: Saison/Avatar/Vergleich",
  },
  {
    value: "meta_reels",
    label: "Reels / Stories",
    emoji: "🎬",
    aspectRatio: "9:16" as const,
    headlineMax: 30,
    bodyMax: 120,
    hookBias: ["question", "counter", "secret"] as HookValue[],
    hint: "Reels + Stories · 9:16 vollvertikal · Hooks: Frage/Counter/Geheimnis",
  },
  {
    value: "tiktok",
    label: "TikTok",
    emoji: "🎵",
    aspectRatio: "9:16" as const,
    headlineMax: 30,
    bodyMax: 100,
    hookBias: ["question", "secret", "counter"] as HookValue[],
    hint: "TikTok · 9:16 · UGC-Style · Hooks: Frage/Geheimnis/Counter · 3-Sek-Regel",
  },
  {
    value: "linkedin",
    label: "LinkedIn",
    emoji: "💼",
    aspectRatio: "1.91:1" as const,
    headlineMax: 40,
    bodyMax: 150,
    hookBias: ["proof", "mechanism", "number"] as HookValue[],
    hint: "LinkedIn Feed · 1.91:1 · B2B-Industrie · Hooks: Beweis/Mechanismus/Zahl",
  },
  {
    value: "google_display",
    label: "Google Display",
    emoji: "🔎",
    aspectRatio: "1.91:1" as const,
    headlineMax: 30,
    bodyMax: 90,
    hookBias: ["number", "comparison", "proof"] as HookValue[],
    hint: "Google Display · responsive · kurze Headlines · Hooks: Zahl/Vergleich/Beweis",
  },
  {
    value: "universal",
    label: "Universal",
    emoji: "🌐",
    aspectRatio: "1:1" as const,
    headlineMax: 40,
    bodyMax: 150,
    hookBias: [] as HookValue[],
    hint: "Plattform-agnostisch · 1:1 · keine Hook-Gewichtung.",
  },
] as const;

export type PlatformValue = (typeof PLATFORMS)[number]["value"];

// ---------------------------------------------------------------------------
// ProductFacts — Doc 6.2: strukturierte Produktfakten aus Crawl.
// Wenn vorhanden, werden sie als verbindlicher Block in den Prompt injiziert.
// ---------------------------------------------------------------------------
export const productFactsSchema = z.object({
  name: z.string().max(200).default(""),
  price: z.string().max(80).default(""),
  gebinde: z.string().max(80).default(""),
  specs: z.array(z.string().max(80)).max(8).default([]),
  oemApprovals: z.array(z.string().max(80)).max(8).default([]),
  usps: z.array(z.string().max(120)).max(6).default([]),
  compatibleMachines: z.array(z.string().max(60)).max(8).default([]),
  // ---- C1: Hero-Pflicht-Werte (Doc 3.1) ----
  // EINE Spezifik-Zahl, die in Headline/Subline zwingend auftauchen muss.
  // Schaltet "Specific Number"-Hook (+187 % Lift laut Motion 2024) frei.
  heroNumber: z.string().max(60).default(""),
  // Optionales Before/After ("Vorher 40 % Verschleiß → Nachher 6 %") —
  // schaltet "Before/After Reveal"-Hook (+162 % Lift) frei.
  beforeAfter: z.string().max(160).default(""),
  // Optionales Social-Proof ("7.412 Werkstätten setzen auf …") —
  // schaltet "Social Proof"-Hook (+84 % Lift) + Cialdini-Lever frei.
  socialProof: z.string().max(140).default(""),
  // ---- B6: Drehort/Szenerie ----
  // Wörtlich in den Image-Prompt eingewoben — sorgt für echte Locations
  // statt Generic-Studio. "Werkstatt", "Bauernhof", "Garage" usw.
  scene: z.string().max(80).default(""),
});

export type ProductFacts = z.infer<typeof productFactsSchema>;

export const EMPTY_PRODUCT_FACTS: ProductFacts = {
  name: "",
  price: "",
  gebinde: "",
  specs: [],
  oemApprovals: [],
  usps: [],
  compatibleMachines: [],
  heroNumber: "",
  beforeAfter: "",
  socialProof: "",
  scene: "",
};

export function hasProductFacts(f: ProductFacts | null | undefined): f is ProductFacts {
  if (!f) return false;
  return Boolean(
    f.name ||
      f.price ||
      f.gebinde ||
      f.specs.length ||
      f.oemApprovals.length ||
      f.usps.length ||
      f.compatibleMachines.length ||
      f.heroNumber ||
      f.beforeAfter ||
      f.socialProof ||
      f.scene,
  );
}

// ---------------------------------------------------------------------------
// Personas (Doc Kap. 2) — Ein Klick belegt Awareness, Hook-Bias, Anrede,
// Maschinen-Kontext, Tone und Audience-Freitext vor.
// ---------------------------------------------------------------------------
export const PERSONAS = [
  {
    value: "franz_landwirt",
    label: "Franz · Landwirt",
    emoji: "🚜",
    audience:
      "Landwirte 45–65, eigener Hof mit Traktor + Mähdrescher, kaufen 4× pro Jahr im 60L-Fass",
    awareness: 3 as AwarenessValue,
    topHooks: ["season", "avatar"] as HookValue[],
    addressing: "du" as AddressingValue,
    machine: "landwirtschaft" as MachineValue,
    tone: "direkt" as (typeof TONES)[number],
    trustSignal: "Made in Austria, DIN-Norm, Bauern-Testimonials",
    hint: "Solution-aware · Hooks: Saison/Avatar · Du-Anrede",
  },
  {
    value: "klaus_werkstatt",
    label: "Klaus · KFZ-Werkstatt",
    emoji: "🔧",
    audience:
      "KFZ-Werkstatt-Inhaber 35–55, 2–5 Mitarbeiter, monatliche Nachbestellung Motoröl/Getriebeöl",
    awareness: 2 as AwarenessValue,
    topHooks: ["comparison", "proof"] as HookValue[],
    addressing: "du" as AddressingValue,
    machine: "werkstatt" as MachineValue,
    tone: "direkt" as (typeof TONES)[number],
    trustSignal: "OEM-Freigaben (VW, BMW, MB), 48h-Lieferung",
    hint: "Product-aware · Hooks: Vergleich/Beweis · Du-Anrede",
  },
  {
    value: "gerhard_lohnunternehmer",
    label: "Gerhard · Lohnunternehmer",
    emoji: "🌾",
    audience:
      "Lohnunternehmer 50–65, 5–15 Maschinen, 2× pro Jahr Großbestellung in 200L-Fässern",
    awareness: 1 as AwarenessValue,
    topHooks: ["number", "proof"] as HookValue[],
    addressing: "du" as AddressingValue,
    machine: "landwirtschaft" as MachineValue,
    tone: "direkt" as (typeof TONES)[number],
    trustSignal: "Mengenrabatt-Tabelle, 24h-Lieferung, Rechnungskauf",
    hint: "Most aware · Hooks: Zahl/Beweis · Preis-First",
  },
  {
    value: "thomas_transport",
    label: "Thomas · LKW-Flotte",
    emoji: "🚚",
    audience:
      "Transportunternehmer 35–50, 5–15 LKW (MAN/Volvo), 3-Monats-Rhythmus + Saisonöl",
    awareness: 2 as AwarenessValue,
    topHooks: ["number", "comparison"] as HookValue[],
    addressing: "du" as AddressingValue,
    machine: "lkw" as MachineValue,
    tone: "professionell" as (typeof TONES)[number],
    trustSignal: "OEM-Freigaben (MAN M3477, MB 228.51), TÜV",
    hint: "Product-aware · Hooks: Zahl/Vergleich · TCO-Argument",
  },
  {
    value: "michael_industrie",
    label: "Michael · Industrie-Einkäufer",
    emoji: "🏭",
    audience:
      "Technischer Einkäufer Mittelstand-Industrie, 45–58, Jahresrahmenvertrag + monatliche Abrufe",
    awareness: 2 as AwarenessValue,
    topHooks: ["mechanism", "proof"] as HookValue[],
    addressing: "sie" as AddressingValue,
    machine: "industrie" as MachineValue,
    tone: "professionell" as (typeof TONES)[number],
    trustSignal: "PDF-Datenblätter, ISO-Zertifikate, OEM-Liste",
    hint: "Product-aware · Hooks: Mechanismus/Beweis · Sie-Anrede",
  },
  {
    value: "andreas_bau",
    label: "Andreas · Bauunternehmer",
    emoji: "🏗️",
    audience:
      "Bauunternehmer 40–55, 4–10 Maschinen (Bagger, Radlader, Kompressor), saisonale Spitzen",
    awareness: 3 as AwarenessValue,
    topHooks: ["season", "implication"] as HookValue[],
    addressing: "du" as AddressingValue,
    machine: "bau" as MachineValue,
    tone: "direkt" as (typeof TONES)[number],
    trustSignal: "Baustellen-Referenzen, 48h-Lieferung, lokale Präsenz",
    hint: "Solution-aware · Hooks: Saison/Konsequenz · Stillstand-Frame",
  },
  {
    value: "custom",
    label: "Eigene Zielgruppe",
    emoji: "✍️",
    audience: "",
    awareness: 3 as AwarenessValue,
    topHooks: [] as HookValue[],
    addressing: "du" as AddressingValue,
    machine: "industrie" as MachineValue,
    tone: "direkt" as (typeof TONES)[number],
    trustSignal: "",
    hint: "Freie Eingabe — alle Felder manuell setzen.",
  },
] as const;

export type PersonaValue = (typeof PERSONAS)[number]["value"];

// ---------------------------------------------------------------------------
// Verbotene Wörter — Phrasenfilter (Doc 3.8)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Loss-Aversion vs. Gain-Frame Toggle (Doc 3.3)
// Industrie-B2B-Studien: Verlust-Frame +23 % Conversion vs. Gewinn-Frame.
// ---------------------------------------------------------------------------
export const FRAMES = [
  { value: "loss",    label: "Loss Aversion (Verlust-Frame)",    hint: "Betont was die Zielgruppe verliert, wenn sie nicht handelt." },
  { value: "gain",    label: "Gain Frame (Gewinn-Frame)",        hint: "Betont was die Zielgruppe gewinnt, wenn sie handelt." },
  { value: "neutral", label: "Neutral (kein expliziter Frame)",   hint: "Klassische Aussage ohne Frame-Bias." },
] as const;

export type FrameValue = (typeof FRAMES)[number]["value"];

// ---------------------------------------------------------------------------
// Verbotene Wörter — Phrasenfilter (Doc 3.8)
// ---------------------------------------------------------------------------
export const FORBIDDEN_WORDS = [
  "bewährt",
  "perfekt",
  "ideal",
  "hochwertig",
  "innovativ",
  "modern",
  "premium-qualität",
  "professionell",
  "kompetent",
  "zuverlässig",
  "vertrauenswürdig",
  "erstklassig",
] as const;

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
  // Phase A — neue Pflicht/Optional-Felder
  awareness: AwarenessValue;
  framework: FrameworkValue;
  persuasionLevers: PersuasionLeverValue[];
  hookHint?: HookValue;
  frame: FrameValue;
  persona?: PersonaValue;
  addressing: AddressingValue;
  productFacts?: ProductFacts | null;
  platform?: PlatformValue;
  imageVariantCount: number;
  urgency: boolean;
  /** Optional Projekt-Zuordnung pro Save aus dem ProjectPicker (N2). */
  projectId?: string;
  /** Optional Folder/Kampagne innerhalb des Projekts (F4). */
  folderId?: string;
  /** RF-Brand — Logo der gecrawlten Firmenseite (für Render-Theme). */
  logoUrl?: string;
  /** RF-Brand — 4 Farb-Slots aus dem Logo, ins Folder-Brand persistiert. */
  brandColors?: {
    primary: string;
    accent: string;
    background: string;
    text: string;
  } | null;
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
  // Phase A
  awareness: z.coerce.number().int().min(1).max(5).optional(),
  framework: z.string().max(40).optional().or(z.literal("")),
  persuasionLevers: z.array(z.string().max(40)).max(2).optional(),
  hookHint: z.string().max(40).optional().or(z.literal("")),
  frame: z.string().max(20).optional().or(z.literal("")),
  persona: z.string().max(40).optional().or(z.literal("")),
  addressing: z.string().max(8).optional().or(z.literal("")),
  platform: z.string().max(20).optional().or(z.literal("")),
  imageVariantCount: z.coerce.number().int().min(1).max(4).optional(),
  urgency: z.coerce.boolean().optional(),
});

export type PromptTemplateData = z.infer<typeof promptTemplateDataSchema>;

export type SaveState = {
  ok: boolean;
  error?: string;
  savedId?: string;
  // Welche Variante wurde gerade gespeichert (1-basierter Index aus dem Grid)
  savedVariantIndex?: number;
};
