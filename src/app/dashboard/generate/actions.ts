"use server";

import { experimental_generateImage as generateImage, generateObject } from "ai";
import { openai } from "@/lib/ai/openai-client";
import { google, googleKeyIsValid } from "@/lib/ai/google-client";
import { generateSceneWithProduct } from "@/lib/ai/gemini-image";
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  ADDRESSINGS,
  ANGLES,
  AWARENESS,
  AWARENESS_PROMPT_HINTS,
  EMPTY_PRODUCT_FACTS,
  FORBIDDEN_WORDS,
  FRAMES,
  FRAMEWORKS,
  HOOKS,
  IMAGE_SOURCES,
  IMAGE_STYLES,
  MACHINES,
  PERSONAS,
  PERSUASION_LEVERS,
  PLATFORMS,
  TONES,
  adCopySchema,
  generatedVariantSchema,
  hasProductFacts,
  productFactsSchema,
  type AddressingValue,
  type AngleValue,
  type AwarenessValue,
  type FrameValue,
  type FrameworkValue,
  type GeneratedVariant,
  type GenerateInput,
  type GenerateState,
  type HookValue,
  type ImageStyleValue,
  type MachineValue,
  type PersonaValue,
  type PersuasionLeverValue,
  type PlatformValue,
  type ProductFacts,
  type SaveState,
} from "./schema";
import { buildVariantPlan, type VariantPlan } from "./variant-plan";
import { scoreCreative } from "@/lib/score/creative";

const STORAGE_BUCKET = "creative-images";

const inputSchema = z.object({
  product: z.string().trim().max(500).default(""),
  audience: z.string().trim().max(300).default(""),
  tone: z.enum(TONES),
  machine: z.enum(MACHINES.map((m) => m.value) as [MachineValue, ...MachineValue[]]),
  angle: z.enum(ANGLES.map((a) => a.value) as [AngleValue, ...AngleValue[]]),
  websiteText: z.string().max(3000).optional().or(z.literal("")),
  variantCount: z.coerce.number().int().min(1).max(10).default(3),
  imageSource: z.enum(IMAGE_SOURCES).default("ai"),
  customImageUrl: z.string().url().optional().or(z.literal("")),
  imageStyle: z
    .enum(IMAGE_STYLES.map((s) => s.value) as [ImageStyleValue, ...ImageStyleValue[]])
    .default("auto"),
  // Phase A — neue Pflicht/Optional-Felder
  awareness: z.coerce.number().int().min(1).max(5).default(3),
  framework: z
    .enum(FRAMEWORKS.map((f) => f.value) as [FrameworkValue, ...FrameworkValue[]])
    .default("PAS"),
  persuasionLevers: z
    .array(
      z.enum(
        PERSUASION_LEVERS.map((l) => l.value) as [
          PersuasionLeverValue,
          ...PersuasionLeverValue[],
        ],
      ),
    )
    .max(2)
    .default([]),
  hookHint: z
    .enum(HOOKS.map((h) => h.value) as [HookValue, ...HookValue[]])
    .optional(),
  frame: z
    .enum(FRAMES.map((f) => f.value) as [FrameValue, ...FrameValue[]])
    .default("neutral"),
  persona: z
    .enum(PERSONAS.map((p) => p.value) as [PersonaValue, ...PersonaValue[]])
    .optional(),
  addressing: z
    .enum(ADDRESSINGS as unknown as [AddressingValue, ...AddressingValue[]])
    .default("du"),
  platform: z
    .enum(PLATFORMS.map((p) => p.value) as [PlatformValue, ...PlatformValue[]])
    .default("universal"),
  imageVariantCount: z.coerce.number().int().min(1).max(4).default(1),
  urgency: z.coerce.boolean().default(false),
  productFactsJson: z.string().optional().or(z.literal("")),
});

function buildVariantPrompt(args: {
  plan: VariantPlan;
  awareness: AwarenessValue;
  machine: MachineValue;
  angle: AngleValue;
  websiteText: string | undefined;
  imageStyle: ImageStyleValue;
  variantNumber: number;
  variantTotal: number;
  retryFeedback?: string;
  frame: FrameValue;
  addressing: AddressingValue;
  persona?: PersonaValue;
  platform: PlatformValue;
  urgency: boolean;
  productFacts?: ProductFacts | null;
  metaInsights?: MetaPromptInsights;
}): string {
  const {
    plan,
    awareness,
    machine,
    angle,
    websiteText,
    imageStyle,
    variantNumber,
    variantTotal,
    retryFeedback,
    frame,
    addressing,
    persona,
    platform,
    urgency,
    productFacts,
    metaInsights,
  } = args;

  const machineMeta = MACHINES.find((m) => m.value === machine)!;
  const angleMeta = ANGLES.find((a) => a.value === angle)!;
  const styleMeta = IMAGE_STYLES.find((s) => s.value === imageStyle)!;
  const awarenessMeta = AWARENESS.find((a) => a.value === awareness)!;
  const personaMeta = persona ? PERSONAS.find((p) => p.value === persona) : undefined;
  const platformMeta = PLATFORMS.find((p) => p.value === platform)!;
  const addressingLine =
    addressing === "sie"
      ? `\nANREDE (HART): Verwende durchgehend die formale Anrede "Sie" (groß geschrieben). KEIN "Du" — auch nicht in CTAs.`
      : `\nANREDE (HART): Verwende durchgehend die direkte Anrede "Du" (groß geschrieben). KEIN "Sie".`;
  const personaSection =
    personaMeta && personaMeta.value !== "custom"
      ? `\nZIELGRUPPEN-PROFIL (verbindlich):
- ${personaMeta.label} — ${personaMeta.audience}
- Trust-Signal das ziehen muss: ${personaMeta.trustSignal}
`
      : "";

  // M6 — Posts-Top-Hooks aus Meta-Import als Inspiration (NICHT 1:1 kopieren!)
  const postsSection =
    metaInsights && metaInsights.postsTopHooks.length > 0
      ? `
DEINE TOP-PERFORMER-HOOKS (aus deinen letzten Meta-Posts — als Inspiration, NICHT 1:1 kopieren):
${metaInsights.postsTopHooks
  .slice(0, 3)
  .map((h) => `- ${h.label}: "${h.example}" (kam ${h.count}× vor)`)
  .join("\n")}
→ Bevorzuge ähnliche Strukturen — aber bleibe beim vorgegebenen Hook-Pattern dieser Variante.
`
      : "";

  // M7 — Audience-Hint aus Meta Insights als Sub-Targeting-Info.
  const audienceSection =
    metaInsights && metaInsights.audience
      ? (() => {
          const a = metaInsights.audience!;
          const lines: string[] = [];
          if (a.topAgeRange) lines.push(`- Alter: ${a.topAgeRange}`);
          if (a.topGender) lines.push(`- Gender-Skew: ${a.topGender}`);
          if (a.topLocations.length)
            lines.push(`- Top-Locations: ${a.topLocations.slice(0, 3).join(", ")}`);
          if (a.topInterests.length)
            lines.push(`- Top-Interessen: ${a.topInterests.slice(0, 5).join(", ")}`);
          if (a.topJobs.length)
            lines.push(`- Top-Jobs: ${a.topJobs.slice(0, 3).join(", ")}`);
          if (lines.length === 0) return "";
          return `
DEINE ECHTE ZIELGRUPPE (aus Meta Audience Insights):
${lines.join("\n")}
→ Sprache, Tonalität und Beispiele an diese Zielgruppe anpassen.
`;
        })()
      : "";

  // Doc 6.4 — verbindlicher Produktfakten-Block. Wenn vorhanden, MUSS die
  // Headline den Produktnamen und die Subline eine konkrete Zahl aus Preis/Specs
  // enthalten — sonst Score-Strafe und Retry.
  const hasFacts = hasProductFacts(productFacts);
  // C3 — Hero-Pflicht-Werte aus Doc 3.1 (Specific Number +187 %, B/A +162 %, SP +84 %)
  const heroSection =
    hasFacts && productFacts && productFacts.heroNumber
      ? `
HERO-ZAHL (PFLICHT · höchster CTR-Hebel laut Motion 2024 +187 %):
- "${productFacts.heroNumber}" MUSS in Headline ODER Subline 1:1 vorkommen — exakt so geschrieben.
- Nicht umschreiben, nicht runden, nicht weglassen.
`
      : "";
  const beforeAfterSection =
    hasFacts && productFacts && productFacts.beforeAfter
      ? `
BEFORE/AFTER-DATEN (zwingt Reveal-Hook · +162 % Lift):
- "${productFacts.beforeAfter}"
- Headline ODER Subline MUSS das Vorher-vs-Nachher abbilden (z. B. "Vorher X → Nachher Y").
`
      : "";
  const socialProofSection =
    hasFacts && productFacts && productFacts.socialProof
      ? `
SOCIAL-PROOF (zwingt Beweis-Lever · +84 % Lift):
- "${productFacts.socialProof}"
- Body ODER Subline MUSS diesen Beweis 1:1 zitieren (Anzahl/Marke/Quelle).
`
      : "";
  const factsSection =
    hasFacts && productFacts
      ? `
PRODUKT-FAKTEN (verbindlich · KEINE Erfindungen · Pflicht-Quelle für Zahlen/Specs):
${productFacts.name ? `- Produkt: ${productFacts.name}` : ""}
${productFacts.price ? `- Preis: ${productFacts.price}` : ""}
${productFacts.gebinde ? `- Gebinde: ${productFacts.gebinde}` : ""}
${productFacts.specs.length ? `- Specs: ${productFacts.specs.join(" · ")}` : ""}
${productFacts.oemApprovals.length ? `- OEM-Freigaben: ${productFacts.oemApprovals.join(" · ")}` : ""}
${productFacts.usps.length ? `- USPs: ${productFacts.usps.join(" · ")}` : ""}
${productFacts.compatibleMachines.length ? `- Kompatibel mit: ${productFacts.compatibleMachines.join(" · ")}` : ""}
${heroSection}${beforeAfterSection}${socialProofSection}
PFLICHT-REGELN bei Produkt-Fakten:
1. Headline MUSS den Produktnamen aus der Liste exakt oder als sinnvolle Kurzform enthalten.
2. Subline MUSS mindestens EINE konkrete Zahl aus Preis ODER Specs enthalten.
3. Body SOLL mindestens EINE OEM-Freigabe ODER DIN-/ISO-Norm aus der Liste nennen, sofern vorhanden.
4. Erfinde KEINE Preise, Specs oder OEM-Freigaben. Nur die oben gelisteten verwenden.
`
      : "";

  // Plattform-Constraints (Doc 5.4)
  const platformSection = `
PLATTFORM: ${platformMeta.label} (${platformMeta.aspectRatio})
- Headline-Limit: ${platformMeta.headlineMax} Zeichen — HART (Plattform-Cut).
- Body-Limit: ${platformMeta.bodyMax} Zeichen — HART.
${platformMeta.hookBias.length ? `- Hook-Bias für diese Plattform: ${platformMeta.hookBias.join("/")} (Plan oben hat einen anderen Hook — folge IMMER dem Plan, aber im Tonfall zur Plattform passen).` : ""}
`;

  const urgencyLine = urgency
    ? `\nURGENCY (HART): CTA MUSS ein Urgency-Wort enthalten: "jetzt", "direkt", "sofort", "gleich" oder eine konkrete Deadline. KEIN weiches CTA.`
    : "";
  const styleLine = styleMeta.promptSuffix
    ? `\n- Pflicht-Style-Suffix: "${styleMeta.promptSuffix}"`
    : "";

  const websiteSection = websiteText
    ? `\nZUSATZ-KONTEXT VON DER KUNDEN-WEBSITE (gekürzt, nicht 1:1 zitieren):\n${websiteText.slice(0, 3000)}\n`
    : "";

  const leverLabel = plan.lever
    ? PERSUASION_LEVERS.find((l) => l.value === plan.lever)?.label ?? plan.lever
    : "keiner";

  const retrySection = retryFeedback
    ? `\nFEEDBACK ZUM VORIGEN VERSUCH (verbessere genau diese Punkte!):\n${retryFeedback}\n`
    : "";

  // B6 — Drehort/Szenerie aus ProductFacts wörtlich in den Image-Prompt
  const sceneOverrideLine =
    hasFacts && productFacts && productFacts.scene
      ? `\n  Drehort (PFLICHT in der Szene): ${productFacts.scene} — wörtlich als Setting verwenden, kein generisches Stockfoto.`
      : "";

  // B5 — Mensch + Produkt-Interaktion (Doc 6.4 +44 % CTR).
  // Bei Personas mit klarem Beruf erzwingen wir „real hands of {beruf}".
  const personaHandsMap: Partial<Record<PersonaValue, string>> = {
    franz_landwirt: "real weathered hands of a farmer (jacket, dirt under nails) interacting with the product",
    klaus_werkstatt: "real grease-stained hands of a mechanic in workshop coveralls interacting with the product",
    gerhard_lohnunternehmer: "real working hands of an agricultural contractor handling the product near a tractor",
    thomas_transport: "real driver hands holding the product near a truck cab",
    michael_industrie: "real engineer hands in industrial setting checking the product",
    andreas_bau: "real construction worker hands with dust handling the product on a building site",
  };
  const personaHandsHint = persona ? personaHandsMap[persona] : undefined;
  const personaHandsLine = personaHandsHint
    ? `\n  Mensch-im-Bild (PFLICHT): ${personaHandsHint}. Gesicht muss nicht voll im Bild sein — Hände + Schulteransatz reichen. Wirkt authentisch, nicht gestellt.`
    : "";

  // Loss-Aversion vs Gain-Frame (Doc 3.3)
  const frameRule =
    frame === "loss"
      ? `\nFRAME (HART): Loss Aversion — Body und/oder Subline betonen, was die Zielgruppe VERLIERT wenn sie NICHT handelt (Geld, Zeit, Maschinen-Lebensdauer, Ausfälle).`
      : frame === "gain"
        ? `\nFRAME (HART): Gain Frame — Body und/oder Subline betonen, was die Zielgruppe GEWINNT wenn sie handelt (Standzeit, Effizienz, Ersparnis).`
        : "";

  return `Du bist Performance-Marketing-Texter für einen österreichischen Schmierstoff-Hersteller mit Direktvertrieb.

BRAND-KERN (subtil einweben, nicht in jedem Text wiederholen):
- Direktkauf vom Hersteller = günstiger, ohne Zwischenhändler
- Made in Austria, Familienunternehmen seit 1946
- Hochwertige Schmierstoffe, Öle, Fette für Maschinen und Fahrzeuge

PFLICHT-SPRACHE:
- Deutsch, bodenständig + kompetent, kein Marketing-Geschwätz
- Aktive CTAs im Imperativ: "Jetzt bestellen!", "Direkt sichern!"
- Keine Anglizismen ohne Grund
${addressingLine}
${personaSection}${postsSection}${audienceSection}${factsSection}${platformSection}${urgencyLine}
MASCHINEN-KONTEXT: ${machineMeta.label}
ANGLE: ${angleMeta.label}
${angleMeta.voiceHint}
${websiteSection}
================================================================
HARTE REGELN FÜR DIESE VARIANTE (Variante ${variantNumber} von ${variantTotal}):
================================================================${frameRule}

AWARENESS-LEVEL der Zielgruppe: ${awareness} (${awarenessMeta.label})
→ ${AWARENESS_PROMPT_HINTS[awareness]}

HEADLINE muss EXAKT diese Hook-Struktur erfüllen:
→ ${plan.hook.label}: ${plan.hook.structure}
   Beispiel-Seed (NICHT kopieren, nur als Pattern-Vorbild):
   "${plan.hook.exampleSeed}"

BODY folgt diesem Copy-Framework:
→ ${plan.framework.label}
   Skelett: ${plan.framework.skeleton}

PERSUASION-HEBEL der dieser Variante (muss in Body ODER Subline sichtbar landen):
→ ${leverLabel}

VERBOTENE WÖRTER (komplett vermeiden in Headline/Subline/Body):
${FORBIDDEN_WORDS.join(", ")}

WEITERE HARTE REGELN:
- Headline kurz und knackig, endet NICHT mit Punkt, keine Beschreibung
- Subline muss MINDESTENS EINE messbare Einheit enthalten: h, %, EUR, €, Grad, °, L, kg, km, Bh
- CTA beginnt mit einem Imperativ-Verb (z. B. "Sichere", "Bestelle", "Hol", "Spare")
- Default-CTA-Stil für dieses Awareness-Level: "${awarenessMeta.ctaDefault}"

LÄNGEN-VORGABEN (HART · Plattform-Standard):
- headline: max ${platformMeta.headlineMax} Zeichen (${platformMeta.label}) — drüber wird abgeschnitten!
- subline: max 80 Zeichen — passt in Stories/Reels-Overlay
- body: max ${platformMeta.bodyMax} Zeichen, 1–2 kurze Sätze (folge dem Framework-Skelett kompakt!)
- cta: max 20 Zeichen, aktiver Imperativ (Button-Format)
- imagePrompt: ENGLISCH, max 800 Zeichen.
  Erzeuge eine Szene, die zum konkreten Produkt + Zielgruppe passt — NICHT zu einer
  generischen Kategorie.${
    productFacts?.gebinde
      ? `
  WICHTIG zur Gebinde-Größe (PFLICHT befolgen):
   - Gebinde: "${productFacts.gebinde}" — die Szene MUSS zur realen physischen Größe passen.
   - Bei 1000L IBC / 200L Fass: industrielle Szene (Lagerhalle, Hof, Stapler, Palette) — kein Hand-hält-Flasche, kein Tisch-Setting.
   - Bei 60L / 20L: Werkstatt/Garage, jemand stellt den Eimer/Kanister ab, kein Display.
   - Bei 5L / 1L: handheld, jemand hält ihn, normale Hand-Größe.
   - Beschreibe im Prompt EXPLIZIT die Größe ("massive 1000L IBC tote dominating the frame", "large 200L drum standing next to person", "1-liter bottle held in hand").
`
      : ""
  } Beispiele:
   - Motorradöl → Motorrad/Biker-Szene
   - LKW-Diesel → LKW/Highway-Szene
   - Werkstatt-Produkt → Werkstatt mit Hebebühne
   - Hydraulik-Produkt → Industrie/Hydraulik-Setting
   - Kosmetik → entsprechende Lifestyle-Szene
   - Lebensmittel → entsprechende Food-Szene
   - usw. — entscheide aus dem Produkt-Kontext oben!
  Maschinen-Kontext-Hinweis (optional, falls passend): ${machineMeta.label} → ${machineMeta.sceneHint}
  (Aber NUR verwenden wenn es zum Produkt passt — sonst frei wählen!)${sceneOverrideLine}${personaHandsLine}
  Pflicht-Elemente:
   - Authentische, NICHT-werbliche Szene — wirkt wie ein candid Phone-Shot oder Doku-Foto, NICHT wie ein Werbefoto.
   - Stil-Basis: "authentic real-world scene, available light, candid moment, natural skin texture, ${platformMeta.aspectRatio} composition for ${platformMeta.label}"${styleLine}
   - Pflicht-Suffix: "no text, no logos, no watermarks, no readable signage, no studio polish, no commercial advertising look, no plastic perfect surfaces, no fake bokeh, no airbrush, no stock-photo cliché"
  Kein konkreter Brand-Name. Produkt-Container generisch beschreiben (z. B. "yellow lubricant canister", "perfume bottle", "food packaging" — je nach Produkt).
${retrySection}
OUTPUT: ausschließlich im JSON-Schema. Keine Erklärungen, keine Markdown-Codeblöcke.`;
}

// ---------------------------------------------------------------------------
// Pro-Variante: 1× Copy + 1× Bild (je nach Source)
// ---------------------------------------------------------------------------
async function generateOneVariant(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  variantNumber: number; // 1-basiert
  variantTotal: number;
  plan: VariantPlan;
  awareness: AwarenessValue;
  product: string;
  audience: string;
  tone: string;
  machine: MachineValue;
  angle: AngleValue;
  websiteText: string | undefined;
  imageStyle: ImageStyleValue;
  sharedProductImageUrl: string | undefined;
  frame: FrameValue;
  addressing: AddressingValue;
  persona?: PersonaValue;
  platform: PlatformValue;
  imageVariantCount: number;
  urgency: boolean;
  productFacts: ProductFacts | null;
  metaInsights?: MetaPromptInsights;
}): Promise<GeneratedVariant> {
  const {
    supabase,
    userId,
    variantNumber,
    variantTotal,
    plan,
    awareness,
    product,
    audience,
    tone,
    machine,
    angle,
    websiteText,
    imageStyle,
    sharedProductImageUrl,
    frame,
    addressing,
    persona,
    platform,
    imageVariantCount,
    urgency,
    productFacts,
    metaInsights,
  } = args;

  // 1) Copy mit Retry-Loop (Doc 3.8)
  const userPrompt = `Produkt / Service: ${product}
Zielgruppe: ${audience}
Ton: ${tone}
Maschinen-Kontext: ${machine}
Angle: ${angle}
Du bist Variante ${variantNumber} von ${variantTotal}.`;

  let bestCandidate: z.infer<typeof generatedVariantSchema> | null = null;
  let bestScore = -1;
  let bestIssues: string[] = [];
  let retryFeedback = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    const systemPrompt = buildVariantPrompt({
      plan,
      awareness,
      machine,
      angle,
      websiteText,
      imageStyle,
      variantNumber,
      variantTotal,
      retryFeedback: retryFeedback || undefined,
      frame,
      addressing,
      persona,
      platform,
      urgency,
      productFacts,
      metaInsights,
    });

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: generatedVariantSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: attempt === 0 ? 0.95 : 0.6,
    });

    // Visual-Cue aus Maschine bauen, damit der +10-Bild-Bonus zieht.
    const machineCue = MACHINES.find((m) => m.value === machine)?.label
      ?.split("/")[0]
      ?.trim()
      .toLowerCase();
    const { score, issues } = scoreCreative(object, plan.hook.value, {
      visualCues: machineCue,
      productFacts,
    });

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = object;
      bestIssues = issues;
    }

    if (score >= 60) break;

    retryFeedback = `Letzter Output hatte Score ${score}/100. Probleme: ${issues.join("; ")}. Behebe diese explizit im nächsten Versuch.`;
  }

  const finalCopy = bestCandidate!;

  // 2) Bild — je nach Source. Bei AI + imageVariantCount > 1 werden mehrere
  //    Stile parallel generiert (Doc 4.6).
  let imageUrl: string | undefined;
  let imageUrls: string[] | undefined;
  let imageError: string | undefined;

  // AI-Szene mit Gemini Nano Banana.
  // - Wenn productImageUrl gesetzt: Multi-Image-Edit-Modus → Produkt wird
  //   nativ in die Szene komponiert (echtes Label, korrekte Schatten, kein
  //   nachträgliches Overlay nötig).
  // - Sonst: klassische Text-zu-Bild-Generierung.
  const styles = buildImageStyleRotation(imageStyle, imageVariantCount);
  const geminiAspect = platformToGeminiAspect(platform);
  // B2/B3 — Authentisch statt Werbefoto-Polish (Doc 6.4 + Motion 2024 +22 % CTR).
  // Wir nennen explizit Smartphone-Vokabular und verbieten "studio polish",
  // "commercial advertising look", "plastic perfect" — das sind die Phrasen,
  // die Diffusion-Modelle in den künstlichen Werbe-Modus schalten.
  const QUALITY_SUFFIX = sharedProductImageUrl
    ? "shot on iPhone 15 Pro back camera, natural skin texture with visible pores, candid documentary moment, real-world imperfections, available light only, slight handheld motion, photorealistic, realistic shadows on product matching the scene lighting. NEGATIVE: no text overlays, no captions, no watermarks, no studio polish, no commercial advertising look, no plastic perfect surfaces, no overly symmetric composition, no fake bokeh, no airbrush, no stock-photo cliché, no extra product duplicates, no deformed objects, no AI artifacts, no lowres."
    : "shot on iPhone 15 Pro back camera, natural skin texture with visible pores, candid documentary moment, real-world imperfections, available light only, slight handheld motion, photorealistic. NEGATIVE: no text, no captions, no watermarks, no logos, no readable signage, no studio polish, no commercial advertising look, no plastic perfect surfaces, no overly symmetric composition, no fake bokeh, no airbrush, no stock-photo cliché, no deformed objects, no AI artifacts, no lowres.";
  const settled = await Promise.allSettled(
    styles.map((styleSuffix) =>
      generateAiImage(
        supabase,
        userId,
        applyStyleSuffix(
          finalCopy.imagePrompt,
          `${styleSuffix} ${QUALITY_SUFFIX}`,
        ),
        geminiAspect,
        sharedProductImageUrl,
        productFacts?.gebinde,
      ),
    ),
  );
  const urls: string[] = [];
  const errors: string[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") {
      if (r.value.ok) urls.push(r.value.url);
      else errors.push(r.value.error);
    } else {
      errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }
  if (urls.length > 0) {
    imageUrl = urls[0];
    imageUrls = urls;
  } else if (errors.length > 0) {
    imageError = errors[0];
  }

  return {
    ...finalCopy,
    index: variantNumber,
    imageUrl,
    imageUrls,
    productImageUrl: sharedProductImageUrl,
    imageError,
    score: bestScore,
    scoreIssues: bestIssues,
    hook: plan.hook.value,
    framework: plan.framework.value,
    lever: plan.lever,
  };
}

// Reihenfolge der Bild-Stile bei imageVariantCount > 1 (Doc 4.6):
// UGC Phone, Documentary, On-Location Raw, Golden Hour — der User-gewählte Stil
// rückt nach vorn. Reihenfolge ist nach erwartetem CTR-Lift sortiert (Motion 2024).
function buildImageStyleRotation(
  userStyle: ImageStyleValue,
  count: number,
): string[] {
  const DEFAULTS: ImageStyleValue[] = [
    "ugc_phone",
    "documentary",
    "on_location_raw",
    "golden_hour",
  ];
  if (count <= 1) {
    const meta = IMAGE_STYLES.find((s) => s.value === userStyle);
    return [meta?.promptSuffix ?? ""];
  }
  const ordered: ImageStyleValue[] = [];
  if (userStyle !== "auto" && DEFAULTS.includes(userStyle)) {
    ordered.push(userStyle);
    DEFAULTS.forEach((s) => {
      if (s !== userStyle) ordered.push(s);
    });
  } else {
    ordered.push(...DEFAULTS);
  }
  return ordered.slice(0, count).map((v) => {
    const meta = IMAGE_STYLES.find((s) => s.value === v);
    return meta?.promptSuffix ?? "";
  });
}

// Hängt einen Stil-Suffix an einen bestehenden Bild-Prompt an, ohne den
// LLM-generierten Inhalt zu zerstören.
function applyStyleSuffix(basePrompt: string, suffix: string): string {
  if (!suffix.trim()) return basePrompt;
  return `${basePrompt.trim()}\n${suffix}`;
}

// ---------------------------------------------------------------------------
// generateAdCopy — Hauptaction, parallelisiert pro Variante
// ---------------------------------------------------------------------------
export async function generateAdCopy(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  // persuasionLevers kommt als mehrere FormData-Entries gleichen Namens
  const leversRaw = formData.getAll("persuasionLevers").map(String).filter(Boolean);
  const hookHintRaw = String(formData.get("hookHint") ?? "");
  const personaRaw = String(formData.get("persona") ?? "");
  const urgencyRaw = String(formData.get("urgency") ?? "");

  const parsed = inputSchema.safeParse({
    product: formData.get("product"),
    audience: formData.get("audience"),
    tone: formData.get("tone"),
    machine: formData.get("machine"),
    angle: formData.get("angle"),
    websiteText: formData.get("websiteText") ?? "",
    variantCount: formData.get("variantCount") ?? "3",
    imageSource: formData.get("imageSource") ?? "ai",
    customImageUrl: formData.get("customImageUrl") ?? "",
    imageStyle: formData.get("imageStyle") ?? "auto",
    awareness: formData.get("awareness") ?? "3",
    framework: formData.get("framework") ?? "PAS",
    persuasionLevers: leversRaw,
    hookHint: hookHintRaw || undefined,
    frame: formData.get("frame") ?? "neutral",
    persona: personaRaw || undefined,
    addressing: formData.get("addressing") ?? "du",
    platform: formData.get("platform") ?? "universal",
    imageVariantCount: formData.get("imageVariantCount") ?? "1",
    urgency: urgencyRaw === "on" || urgencyRaw === "true" || urgencyRaw === "1",
    productFactsJson: String(formData.get("productFacts") ?? ""),
  });

  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      error: "Bitte fülle alle Felder korrekt aus.",
      fieldErrors: {
        product: flat.product?.[0],
        audience: flat.audience?.[0],
        tone: flat.tone?.[0],
        machine: flat.machine?.[0],
        angle: flat.angle?.[0],
        variantCount: flat.variantCount?.[0],
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      error: "OPENAI_API_KEY ist nicht gesetzt (Server-Env-Var fehlt).",
    };
  }

  const {
    product,
    audience,
    tone,
    machine,
    angle,
    websiteText,
    variantCount,
    imageSource,
    customImageUrl,
    imageStyle,
    awareness,
    framework,
    persuasionLevers,
    hookHint,
    frame,
    persona,
    addressing,
    platform,
    imageVariantCount,
    urgency,
    productFactsJson,
  } = parsed.data;

  // ProductFacts aus Hidden-JSON-Field parsen (silent fail wenn invalid)
  let productFacts: ProductFacts | null = null;
  if (productFactsJson) {
    try {
      const raw = JSON.parse(productFactsJson);
      const parsedFacts = productFactsSchema.safeParse(raw);
      if (parsedFacts.success && hasProductFacts(parsedFacts.data)) {
        productFacts = parsedFacts.data;
      }
    } catch {
      // ignore
    }
  }
  void EMPTY_PRODUCT_FACTS;

  // Phase A: deterministischer Variant-Plan (orthogonale Achsen-Rotation)
  // Stufe-1-Lernschleife: User-Hook-Präferenzen aus Ratings einlesen.
  // Stufe-2-Lernschleife: Ads-Performance-CTR aus Meta-Imports.
  // Beide Quellen werden gemergt und an den Plan-Generator gegeben.
  const [manualPrefs, metaInsights] = await Promise.all([
    getUserHookPreferences(user.id),
    getMetaPromptInsights(user.id),
  ]);
  const hookPreferences = mergeHookPreferences(manualPrefs, metaInsights.adsHookBoost);
  const plans = buildVariantPlan(
    variantCount,
    awareness as AwarenessValue,
    framework,
    persuasionLevers,
    hookHint,
    hookPreferences,
  );

  const cleanedCustomUrl =
    customImageUrl && customImageUrl.length > 0 ? customImageUrl : undefined;
  const cleanedWebsite =
    websiteText && websiteText.length > 0 ? websiteText : undefined;

  // Produktbild-Overlay (Upload oder URL) — wird beim Speichern in der
  // Library als product_image_url für Creatomate übernommen. AI-Szene wird
  // immer separat generiert.
  let sharedProductImageUrl: string | undefined;
  if (imageSource === "upload") {
    sharedProductImageUrl = cleanedCustomUrl;
  } else if (imageSource === "url") {
    if (!cleanedCustomUrl) {
      return { ok: false, error: "Bitte gib eine Produktbild-URL ein." };
    }
    const mirrored = await mirrorExternalImage(
      supabase,
      user.id,
      cleanedCustomUrl,
    );
    if (!mirrored.ok) {
      return { ok: false, error: mirrored.error };
    }
    sharedProductImageUrl = mirrored.url;
  }

  // Parallel ausführen — jede Variante = 1 Copy-Call + ggf. 1 Bild-Call.
  const settled = await Promise.allSettled(
    plans.map((plan, i) =>
      generateOneVariant({
        supabase,
        userId: user.id,
        variantNumber: i + 1,
        variantTotal: variantCount,
        plan,
        awareness: awareness as AwarenessValue,
        product,
        audience,
        tone,
        machine,
        angle,
        websiteText: cleanedWebsite,
        imageStyle,
        sharedProductImageUrl,
        frame: frame as FrameValue,
        addressing: addressing as AddressingValue,
        persona: persona as PersonaValue | undefined,
        platform: platform as PlatformValue,
        imageVariantCount,
        urgency,
        productFacts,
        metaInsights,
      }),
    ),
  );

  const variants: GeneratedVariant[] = [];
  const failures: string[] = [];
  settled.forEach((res, idx) => {
    if (res.status === "fulfilled") {
      variants.push(res.value);
    } else {
      const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
      failures.push(`Variante ${idx + 1}: ${msg}`);
    }
  });

  if (variants.length === 0) {
    return {
      ok: false,
      error: failures.join(" · ") || "Keine Variante konnte generiert werden.",
    };
  }

  // Projekt-ID (optional) aus dem ProjectPicker durchreichen, sodass die
  // VariantCards beim Save direkt das Projekt mitgeben können.
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const projectIdRaw = String(formData.get("projectId") ?? "").trim();
  const projectId =
    projectIdRaw.length > 0 && uuidRe.test(projectIdRaw)
      ? projectIdRaw
      : undefined;
  const folderIdRaw = String(formData.get("folderId") ?? "").trim();
  const folderId =
    folderIdRaw.length > 0 && uuidRe.test(folderIdRaw) ? folderIdRaw : undefined;

  const input: GenerateInput = {
    product,
    audience,
    tone,
    machine,
    angle,
    websiteText: cleanedWebsite,
    variantCount,
    imageSource,
    customImageUrl: cleanedCustomUrl,
    imageStyle,
    awareness: awareness as AwarenessValue,
    framework,
    persuasionLevers,
    hookHint,
    frame: frame as FrameValue,
    persona: persona as PersonaValue | undefined,
    addressing: addressing as AddressingValue,
    productFacts,
    platform: platform as PlatformValue,
    imageVariantCount,
    urgency,
    projectId,
    folderId,
  };

  return {
    ok: true,
    variants: variants.sort((a, b) => a.index - b.index),
    input,
    // Wenn EINIGE Varianten failed: Banner mit Hinweis
    ...(failures.length > 0
      ? { error: `${failures.length} Variante(n) fehlgeschlagen: ${failures.join(" · ")}` }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------
// Plattform-Aspekt-Ratio → Gemini-AspectRatio (Gemini unterstützt nur 1:1,
// 16:9, 9:16, 3:4, 4:3). 4:5 wird auf 3:4 gemappt, 1.91:1 auf 16:9.
type GeminiAspect = "1:1" | "16:9" | "9:16" | "3:4" | "4:3";

function platformToGeminiAspect(platform: PlatformValue): GeminiAspect {
  switch (platform) {
    case "meta_reels":
    case "tiktok":
      return "9:16";
    case "meta_feed":
      return "3:4"; // 4:5 closest match
    case "linkedin":
    case "google_display":
      return "16:9"; // 1.91:1 closest match
    case "universal":
    default:
      return "1:1";
  }
}

async function generateAiImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  prompt: string,
  aspect: GeminiAspect = "1:1",
  productImageUrl?: string,
  gebinde?: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // Nur Google Gemini 2.5 Flash Image ("Nano Banana"). Kein Fallback.
  if (!googleKeyIsValid) {
    return {
      ok: false,
      error:
        "GOOGLE_GENERATIVE_AI_API_KEY fehlt oder ungültig — Bild-Generierung nicht möglich.",
    };
  }
  try {
    let bytes: Uint8Array;
    let mediaType: string;

    if (productImageUrl) {
      // Multi-Image-Edit: Produktbild als Referenz, native Komposition.
      // gebinde wird durchgereicht → Nano Banana kennt die reale Skala.
      const result = await generateSceneWithProduct(prompt, productImageUrl, gebinde);
      if (!result.ok) return { ok: false, error: result.error };
      bytes = result.bytes;
      mediaType = result.mediaType;
    } else {
      // Klassischer Text-zu-Bild-Pfad (kein Produktbild).
      const { image } = await generateImage({
        model: google.image("gemini-2.5-flash-image"),
        prompt,
        aspectRatio: aspect,
      });
      bytes = image.uint8Array;
      mediaType = image.mediaType || "image/png";
    }

    const ext = mediaType.includes("png") ? "png" : "jpg";
    const path = `${userId}/preview/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, bytes, {
        contentType: mediaType,
        upsert: true,
        cacheControl: "0",
      });
    if (upErr) throw new Error(upErr.message);
    const { data: pub } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);
    return { ok: true, url: `${pub.publicUrl}?v=${Date.now()}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Bildfehler.";
    const isQuota = /quota|rate.?limit|429|billing/i.test(msg);
    return {
      ok: false,
      error: isQuota
        ? "Gemini-Limit/Billing-Problem. Copy ist trotzdem fertig."
        : `Bild konnte nicht erzeugt werden: ${msg}`,
    };
  }
}

async function mirrorExternalImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  url: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "image/*" },
    });
    if (!res.ok) {
      return { ok: false, error: `Bild-Fetch fehlgeschlagen (HTTP ${res.status}).` };
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return {
        ok: false,
        error: `URL liefert kein Bild zurück (Content-Type: ${contentType || "leer"}).`,
      };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 10 * 1024 * 1024) {
      return { ok: false, error: "Bild zu groß (> 10 MB)." };
    }
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const path = `${userId}/preview/url-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, buf, {
        contentType,
        upsert: true,
        cacheControl: "0",
      });
    if (upErr) return { ok: false, error: `Upload-Fehler: ${upErr.message}` };
    const { data: pub } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);
    return { ok: true, url: `${pub.publicUrl}?v=${Date.now()}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Netzwerk-Fehler.";
    const isTimeout = /aborted|timeout/i.test(msg);
    return {
      ok: false,
      error: isTimeout
        ? "Bild-URL-Fetch hat länger als 5 Sek. gebraucht — abgebrochen."
        : `Bild-URL konnte nicht geladen werden: ${msg}`,
    };
  }
}

// ---------------------------------------------------------------------------
// saveCreative — eine einzelne Variante in die Library packen
// ---------------------------------------------------------------------------
const savePayloadSchema = z.object({
  product: z.string().min(1).max(500),
  audience: z.string().min(1).max(300),
  tone: z.enum(TONES),
  machine: z.enum(MACHINES.map((m) => m.value) as [MachineValue, ...MachineValue[]]),
  angle: z.enum(ANGLES.map((a) => a.value) as [AngleValue, ...AngleValue[]]),
  variantIndex: z.coerce.number().int().min(1).max(10),
  headline: z.string().min(1).max(60),
  subline: z.string().min(1).max(120),
  body: z.string().min(1).max(300),
  cta: z.string().min(1).max(30),
  imagePrompt: z.string().max(800).optional().or(z.literal("")),
  previewImageUrl: z.string().url().optional().or(z.literal("")),
  productImageUrl: z.string().url().optional().or(z.literal("")),
  // N3: optional Projekt — wenn leer/ungültig wird project_id NULL
  projectId: z.string().uuid().optional().or(z.literal("")),
  // F4: optional Folder — leer/ungültig → folder_id NULL
  folderId: z.string().uuid().optional().or(z.literal("")),
});

export async function saveCreative(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsed = savePayloadSchema.safeParse({
    product: formData.get("product"),
    audience: formData.get("audience"),
    tone: formData.get("tone"),
    machine: formData.get("machine"),
    angle: formData.get("angle"),
    variantIndex: formData.get("variantIndex"),
    headline: formData.get("headline"),
    subline: formData.get("subline"),
    body: formData.get("body"),
    cta: formData.get("cta"),
    imagePrompt: formData.get("imagePrompt") ?? "",
    previewImageUrl: formData.get("previewImageUrl") ?? "",
    productImageUrl: formData.get("productImageUrl") ?? "",
    projectId: formData.get("projectId") ?? "",
    folderId: formData.get("folderId") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Speicher-Daten unvollständig. " +
        parsed.error.issues.slice(0, 2).map((i) => i.message).join("; "),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const {
    product,
    audience,
    tone,
    machine,
    angle,
    variantIndex,
    headline,
    subline,
    body,
    cta,
    imagePrompt,
    previewImageUrl,
    productImageUrl,
    projectId,
    folderId,
  } = parsed.data;

  const adCopy = adCopySchema.parse({
    headline,
    subline,
    variants: [{ body, cta }],
    imagePrompt: imagePrompt || "no-prompt",
  });

  const promptText = `Produkt: ${product}
Zielgruppe: ${audience}
Ton: ${tone}
Maschine: ${machine}
Angle: ${angle}
Variante: ${variantIndex}`;

  const { data: creativeRow, error: insertErr } = await supabase
    .from("creatives")
    .insert({
      user_id: user.id,
      project_id: projectId && projectId.length > 0 ? projectId : null,
      folder_id: folderId && folderId.length > 0 ? folderId : null,
      prompt: promptText,
      output: JSON.stringify(adCopy),
      status: "completed",
    })
    .select("id")
    .single();
  if (insertErr || !creativeRow) {
    return {
      ok: false,
      error: `DB-Fehler: ${insertErr?.message ?? "unbekannt"}`,
    };
  }

  // Preview-Bild (KI-Szene) als Variante-0 in den finalen Pfad kopieren.
  // Produktbild-Overlay landet im selben Row (product_image_url-Spalte).
  let savedSceneUrl: string | null = null;
  if (previewImageUrl) {
    try {
      const res = await fetch(previewImageUrl, { cache: "no-store" });
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        const mediaType = res.headers.get("content-type") ?? "image/png";
        const ext = mediaType.includes("png") ? "png" : "jpg";
        const finalPath = `${user.id}/${creativeRow.id}/0.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(finalPath, buf, {
            contentType: mediaType,
            upsert: true,
            cacheControl: "0",
          });
        if (!upErr) {
          const { data: pub } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(finalPath);
          savedSceneUrl = `${pub.publicUrl}?v=${Date.now()}`;
        }
      }
    } catch {
      // soft-fail — Creative bleibt trotzdem gespeichert
    }
  }

  if (savedSceneUrl || productImageUrl) {
    await supabase.from("creative_images").upsert(
      {
        user_id: user.id,
        creative_id: creativeRow.id,
        variant_index: 0,
        image_url: savedSceneUrl ?? "",
        image_prompt: imagePrompt || null,
        provider: "gemini",
        product_image_url: productImageUrl || null,
      },
      { onConflict: "creative_id,variant_index" },
    );
  }

  revalidatePath("/dashboard/library");
  return {
    ok: true,
    savedId: creativeRow.id,
    savedVariantIndex: variantIndex,
  };
}

// ---------------------------------------------------------------------------
// saveAllVariants — alle Varianten eines Generierungs-Runs als 1 Bundle
// in 1 creatives-Row speichern. Die output.variants[] enthält alle
// (body, cta) Paare; jede Variante kriegt einen creative_images-Eintrag
// mit eigenem variant_index.
// ---------------------------------------------------------------------------
export type BundleSaveState = {
  ok: boolean;
  error?: string;
  savedId?: string;
  savedCount?: number;
};

const bundleVariantSchema = z.object({
  index: z.coerce.number().int().min(1).max(10),
  body: z.string().min(1).max(300),
  cta: z.string().min(1).max(30),
  imagePrompt: z.string().max(800).optional().or(z.literal("")),
  previewImageUrl: z.string().url().optional().or(z.literal("")),
  productImageUrl: z.string().url().optional().or(z.literal("")),
});

const bundlePayloadSchema = z.object({
  product: z.string().min(1).max(500),
  audience: z.string().min(1).max(300),
  tone: z.enum(TONES),
  machine: z.enum(MACHINES.map((m) => m.value) as [MachineValue, ...MachineValue[]]),
  angle: z.enum(ANGLES.map((a) => a.value) as [AngleValue, ...AngleValue[]]),
  headline: z.string().min(1).max(60),
  subline: z.string().min(1).max(120),
  variants: z.array(bundleVariantSchema).min(1).max(10),
  projectId: z.string().uuid().optional().or(z.literal("")),
  folderId: z.string().uuid().optional().or(z.literal("")),
});

export async function saveAllVariants(
  _prev: BundleSaveState,
  formData: FormData,
): Promise<BundleSaveState> {
  // variants kommt als JSON-String, weil FormData Arrays nicht sauber kann
  let variantsRaw: unknown[];
  try {
    const v = String(formData.get("variantsJson") ?? "[]");
    const parsed = JSON.parse(v);
    if (!Array.isArray(parsed)) throw new Error("variants not array");
    variantsRaw = parsed;
  } catch {
    return { ok: false, error: "variantsJson ungültig." };
  }

  const parsed = bundlePayloadSchema.safeParse({
    product: formData.get("product"),
    audience: formData.get("audience"),
    tone: formData.get("tone"),
    machine: formData.get("machine"),
    angle: formData.get("angle"),
    headline: formData.get("headline"),
    subline: formData.get("subline"),
    variants: variantsRaw,
    projectId: formData.get("projectId") ?? "",
    folderId: formData.get("folderId") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Bundle-Daten unvollständig: " +
        parsed.error.issues.slice(0, 2).map((i) => i.message).join("; "),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const {
    product,
    audience,
    tone,
    machine,
    angle,
    headline,
    subline,
    variants,
    projectId,
    folderId,
  } = parsed.data;

  // adCopy-JSON mit ALLEN Varianten zusammen
  const adCopy = adCopySchema.parse({
    headline,
    subline,
    variants: variants.map((v) => ({ body: v.body, cta: v.cta })),
    imagePrompt: variants[0].imagePrompt || "no-prompt",
  });

  const promptText = `Bundle · Produkt: ${product}
Zielgruppe: ${audience}
Ton: ${tone}
Maschine: ${machine}
Angle: ${angle}
${variants.length} Varianten`;

  const { data: creativeRow, error: insertErr } = await supabase
    .from("creatives")
    .insert({
      user_id: user.id,
      project_id: projectId && projectId.length > 0 ? projectId : null,
      folder_id: folderId && folderId.length > 0 ? folderId : null,
      prompt: promptText,
      output: JSON.stringify(adCopy),
      status: "completed",
    })
    .select("id")
    .single();
  if (insertErr || !creativeRow) {
    return {
      ok: false,
      error: `DB-Fehler: ${insertErr?.message ?? "unbekannt"}`,
    };
  }

  // Pro Variante: Preview-Bild in finalen Pfad kopieren + creative_images-Row
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    let savedSceneUrl: string | null = null;
    if (v.previewImageUrl) {
      try {
        const res = await fetch(v.previewImageUrl, { cache: "no-store" });
        if (res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer());
          const mediaType = res.headers.get("content-type") ?? "image/png";
          const ext = mediaType.includes("png") ? "png" : "jpg";
          const finalPath = `${user.id}/${creativeRow.id}/${i}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(finalPath, buf, {
              contentType: mediaType,
              upsert: true,
              cacheControl: "0",
            });
          if (!upErr) {
            const { data: pub } = supabase.storage
              .from(STORAGE_BUCKET)
              .getPublicUrl(finalPath);
            savedSceneUrl = `${pub.publicUrl}?v=${Date.now()}`;
          }
        }
      } catch {
        // soft-fail: Bundle bleibt erhalten, einzelnes Bild fehlt
      }
    }

    if (savedSceneUrl || v.productImageUrl) {
      await supabase.from("creative_images").upsert(
        {
          user_id: user.id,
          creative_id: creativeRow.id,
          variant_index: i,
          image_url: savedSceneUrl ?? "",
          image_prompt: v.imagePrompt || null,
          provider: "gemini",
          product_image_url: v.productImageUrl || null,
        },
        { onConflict: "creative_id,variant_index" },
      );
    }
  }

  revalidatePath("/dashboard/library");
  if (projectId) revalidatePath(`/dashboard/projects/${projectId}`);

  return {
    ok: true,
    savedId: creativeRow.id,
    savedCount: variants.length,
  };
}

// ---------------------------------------------------------------------------
// rateVariant — Stufe-1-Lernschleife.
// User klickt 👍/👎 pro Variante. Wir persistieren die Achsen-Metadaten
// (Hook/Framework/Lever/Persona/Platform) plus rating in creative_feedback.
// Beim nächsten Generate-Lauf liest variant-plan.ts den User-Score pro Hook
// und gewichtet die Hook-Auswahl entsprechend.
// ---------------------------------------------------------------------------
export type RatingState = {
  ok: boolean;
  error?: string;
  variantIndex?: number;
  rating?: 1 | -1;
};

const rateVariantSchema = z.object({
  creativeId: z.string().uuid().optional().or(z.literal("")),
  variantIndex: z.coerce.number().int().min(1).max(10),
  hook: z.string().max(40).optional().or(z.literal("")),
  framework: z.string().max(40).optional().or(z.literal("")),
  lever: z.string().max(40).optional().or(z.literal("")),
  persona: z.string().max(40).optional().or(z.literal("")),
  platform: z.string().max(40).optional().or(z.literal("")),
  rating: z.coerce.number().int().refine((r) => r === 1 || r === -1, {
    message: "Rating muss +1 oder -1 sein.",
  }),
});

export async function rateVariant(
  _prev: RatingState,
  formData: FormData,
): Promise<RatingState> {
  const parsed = rateVariantSchema.safeParse({
    creativeId: formData.get("creativeId") ?? "",
    variantIndex: formData.get("variantIndex"),
    hook: formData.get("hook") ?? "",
    framework: formData.get("framework") ?? "",
    lever: formData.get("lever") ?? "",
    persona: formData.get("persona") ?? "",
    platform: formData.get("platform") ?? "",
    rating: formData.get("rating"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Rating-Daten.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };

  const {
    creativeId,
    variantIndex,
    hook,
    framework,
    lever,
    persona,
    platform,
    rating,
  } = parsed.data;

  const { error: insertErr } = await supabase
    .from("creative_feedback")
    .insert({
      user_id: user.id,
      creative_id: creativeId || null,
      variant_index: variantIndex,
      hook: hook || null,
      framework: framework || null,
      lever: lever || null,
      persona: persona || null,
      platform: platform || null,
      rating: rating as 1 | -1,
    });

  if (insertErr) {
    return { ok: false, error: `DB-Fehler: ${insertErr.message}` };
  }

  return {
    ok: true,
    variantIndex,
    rating: rating as 1 | -1,
  };
}

// Hilfsfunktion (server-only): User-Hook-Präferenzen aus creative_feedback.
// Liefert Map<HookValue, score> mit avg-Rating pro Hook (1..−1).
export async function getUserHookPreferences(
  userId: string,
): Promise<Map<HookValue, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creative_feedback")
    .select("hook, rating")
    .eq("user_id", userId)
    .not("hook", "is", null);

  const map = new Map<HookValue, number>();
  if (error || !data) return map;

  const sums = new Map<string, { sum: number; n: number }>();
  for (const row of data) {
    const h = row.hook as string;
    const r = row.rating as number;
    const cur = sums.get(h) ?? { sum: 0, n: 0 };
    cur.sum += r;
    cur.n += 1;
    sums.set(h, cur);
  }
  for (const [hook, { sum, n }] of sums) {
    if (n > 0) map.set(hook as HookValue, sum / n);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Phase 2: Meta-CSV-Imports laden + zu Prompt-Insights distillieren.
// Nimmt den jeweils NEUESTEN Import pro Kind (max 1 von posts/audience),
// damit der Prompt nicht überlastet wird. Ads-Performance fließt separat
// in die Hook-Preferences-Map (Stufe-2-Lernschleife).
// ---------------------------------------------------------------------------
export type MetaPromptInsights = {
  postsTopHooks: Array<{ label: string; example: string; count: number }>;
  postsTopPhrases: string[];
  audience: {
    topAgeRange: string;
    topGender: string;
    topInterests: string[];
    topLocations: string[];
    topJobs: string[];
  } | null;
  // Hook → CTR-Boost (–1..+1) für die Variant-Plan-Sortierung.
  adsHookBoost: Map<HookValue, number>;
};

export async function getMetaPromptInsights(
  userId: string,
): Promise<MetaPromptInsights> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("meta_imports")
    .select("kind, insights, created_at")
    .eq("user_id", userId)
    .in("kind", ["posts", "ads_performance", "audience"])
    .order("created_at", { ascending: false });

  const result: MetaPromptInsights = {
    postsTopHooks: [],
    postsTopPhrases: [],
    audience: null,
    adsHookBoost: new Map(),
  };
  if (!data) return result;

  // Pro Kind: nur neuester Import zählt
  const seenKinds = new Set<string>();
  for (const row of data) {
    const kind = row.kind as string;
    if (seenKinds.has(kind)) continue;
    seenKinds.add(kind);
    const ins = (row.insights ?? {}) as Record<string, unknown>;

    if (kind === "posts") {
      result.postsTopHooks = (ins.topHooks as Array<{
        label: string;
        example: string;
        count: number;
      }>) ?? [];
      result.postsTopPhrases = (ins.topPhrases as string[]) ?? [];
    } else if (kind === "audience") {
      result.audience = {
        topAgeRange: (ins.topAgeRange as string) ?? "",
        topGender: (ins.topGender as string) ?? "",
        topInterests: (ins.topInterests as string[]) ?? [],
        topLocations: (ins.topLocations as string[]) ?? [],
        topJobs: (ins.topJobs as string[]) ?? [],
      };
    } else if (kind === "ads_performance") {
      // CTR-Map normalisieren auf -1..+1 Skala relativ zum Mittel.
      const map = (ins.hookCtrMap as Array<{ hook: HookValue; avgCtr: number }>) ?? [];
      if (map.length > 0) {
        const ctrs = map.map((m) => m.avgCtr);
        const mean = ctrs.reduce((a, b) => a + b, 0) / ctrs.length;
        const max = Math.max(...ctrs, mean + 0.0001);
        const min = Math.min(...ctrs, mean - 0.0001);
        for (const m of map) {
          // CTR > Mittel → positiver Boost, CTR < Mittel → negativ.
          const range = m.avgCtr >= mean ? max - mean : mean - min;
          const boost = range > 0 ? (m.avgCtr - mean) / range : 0;
          result.adsHookBoost.set(m.hook, boost);
        }
      }
    }
  }
  return result;
}

// Kombiniert manuelles 👍/👎 (Stufe 1) mit Ads-CTR-Boost (Stufe 2).
// Ads-Boost wiegt doppelt, weil echte Performance > Subjektive Bewertung.
// Kein export — "use server"-Files erlauben nur async Funktions-Exporte.
function mergeHookPreferences(
  manual: Map<HookValue, number>,
  adsBoost: Map<HookValue, number>,
): Map<HookValue, number> {
  const merged = new Map<HookValue, number>(manual);
  for (const [hook, boost] of adsBoost) {
    const cur = merged.get(hook) ?? 0;
    merged.set(hook, cur + boost * 2);
  }
  return merged;
}
