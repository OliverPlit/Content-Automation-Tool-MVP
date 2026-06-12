/**
 * Scene Inference — branchen-agnostische Szene-Ableitung für Image-Prompts.
 *
 * Statt aus einer fixen Liste (Schmieröl-Domain: Werkstatt, Industrie, LKW, …)
 * leitet ein kleiner LLM-Call aus PRODUKT × ZIELGRUPPE × ANGLE × FRAME die
 * realistische Anwendungs-Szene ab. So funktioniert das Generate auch für
 * Kosmetik, Lebensmittel, SaaS, Mode usw. — nicht nur für KFZ/Industrie.
 *
 * Verwendung in actions.ts (Phase 2): vor dem Image-Prompt-Build wird
 * `inferImageScene()` aufgerufen und das Ergebnis wörtlich in den Prompt
 * eingeflochten — der LLM hat damit konkrete, produkt-passende Szene-Anker
 * statt Branchen-Beispiel-Listen.
 *
 * Caching (Phase 2.3): identische Inputs liefern denselben Hash, damit
 * mehrere Varianten desselben Briefings nur 1× zahlen.
 */
import { z } from "zod";
import { generateObject } from "ai";
import { createHash } from "node:crypto";
import { openai, openaiKeyIsValid } from "./openai-client";

/**
 * SceneSpec — die abgeleitete Bild-Szene. Wird als knapper, denglish-OK
 * Text-Block in den Image-Prompt eingehängt. Felder sind bewusst kurz
 * (max ~120 Zeichen) damit der Gesamt-Prompt unter Gemini-Token-Limit bleibt.
 */
export const sceneSpecSchema = z.object({
  setting: z
    .string()
    .max(140)
    .describe(
      "Der konkrete Ort/Setting wo das Produkt realistisch erlebt wird. " +
        "Englisch. Beispiele: 'modern bathroom counter at morning light', " +
        "'open kitchen with marble countertop', 'home office desk with " +
        "laptop and notebook'. KEIN Studio, KEIN Werbebild.",
    ),
  environment: z
    .string()
    .max(140)
    .describe(
      "1-2 zusätzliche Umgebungsdetails die das Setting glaubwürdig machen " +
        "(natürliche Props, Texturen, Nebensubjekte). Englisch.",
    ),
  lightingMood: z
    .string()
    .max(120)
    .describe(
      "Licht + Stimmung. Englisch, z. B. 'soft window daylight, calm', " +
        "'warm golden hour, optimistic', 'cool overcast, serious'.",
    ),
  humanRole: z
    .string()
    .max(120)
    .describe(
      "Wer ist (optional) im Bild und in welcher Pose? Aus der Zielgruppe " +
        "abgeleitet. Englisch, z. B. 'hands of a young professional " +
        "applying the product', 'a baker in apron in background'. Leer-" +
        "String wenn das Produkt allein im Bild stärker wirkt.",
    ),
  composition: z
    .string()
    .max(120)
    .describe(
      "Komposition/Perspektive passend zum ANGLE/FRAME. Englisch, z. B. " +
        "'close-up macro, shallow depth', 'wide environmental shot', " +
        "'overhead flat-lay'. NICHT immer Close-up.",
    ),
  forbidScenes: z
    .string()
    .max(160)
    .describe(
      "Negative-Hint: welche Szenen WÄREN FALSCH für dieses Produkt — " +
        "kommagetrennte Liste. Englisch, z. B. 'no auto repair workshop, " +
        "no industrial hall, no studio backdrop'. Hilft dem Image-Modell " +
        "gegen Branchen-Bias zu steuern.",
    ),
});

export type SceneSpec = z.infer<typeof sceneSpecSchema>;

export type InferImageSceneInput = {
  product: string;
  audience: string;
  angle: string;
  /** loss / gain / neutral — beeinflusst Mood */
  frame?: string;
  /** authority / social-proof / scarcity / authenticity / … — optional */
  persuasionLever?: string;
  /** Hook-Pattern (comparison / secret / number / question / …) — Komposition-Hint */
  hookLabel?: string;
  /** Image-Style-Label (raw / clean / lifestyle / …) — als Stilanker */
  imageStyleLabel?: string;
  /** Persona-Label (falls explizit gewählt) — als Person-im-Bild-Hint */
  personaLabel?: string;
  /** Plattform-Format (für Composition-Hint) */
  platformLabel?: string;
  /** Crawl-Kontext (max 500 Zeichen wird verwendet) */
  websiteText?: string;
  /** Gebinde-Hinweis, falls vorhanden */
  gebinde?: string;
  /** Branchen-Quick-Pick, falls explizit gewählt ("auto" wird ignoriert) */
  industryHint?: string;
};

const SYSTEM_PROMPT = `Du bist ein Performance-Marketing-Bildkonzepter.
Aus PRODUKT × ZIELGRUPPE × ANGLE × FRAME × PERSUASION-HEBEL × HOOK leitest
du die REALE Anwendungs-Szene für ein Ad-Creative ab — KEIN Studio, KEIN
Werbebild, KEIN generisches Stockfoto.

GRUND-REGEL — Setting:
- Die Szene MUSS zum tatsächlichen Produkt + zur Zielgruppe passen.
- KEIN Branchen-Default (keine KFZ-Werkstatt, keine Industrie-Halle, keine
  Hydraulik-Pipes), wenn das Produkt nicht klar in diese Branche gehört.
- Kosmetik → Lifestyle/Pflege-Setting (Bad, Schminktisch, Lichtdurchflutet).
- Lebensmittel → Küche, Markt, Esstisch.
- SaaS/B2B-Software → Schreibtisch, Co-Working, Laptop.
- Mode → Outdoor/Indoor passend zum Look.
- Schmieröl/Industrie → Maschinen-/Anwendungs-Umgebung.
- 'forbidScenes' explizit ausschließen, was der LLM sonst falsch defaulten
  würde (z. B. 'no auto repair workshop' bei Kosmetik).

FRAME steuert lightingMood UND inhaltliche Stimmung HART:
- loss → kalt, ernst, problem-fokussiert: harte Schatten, kühles overcast
  oder spätes graues Licht. Das Bild zeigt KONSEQUENZ — kaputte/leere/
  verschmutzte/abgenutzte Variante des Anwendungs-Settings (z. B. trockene
  Haut, kaputte Maschine, leerer Kühlschrank, gestresster Schreibtisch).
- gain → warm, optimistisch, ERFOLG: weiches goldenes Licht, ruhig.
  Das Bild zeigt das gepflegte/erfolgreiche/funktionierende Ergebnis
  (gesunde Haut, laufende Maschine, gefüllter Esstisch, ruhiger Workflow).
- neutral → ausgewogen, dokumentarisch: vorhandenes Tageslicht, kein
  emotionales Statement, einfach „so sieht's aus wenn man es nutzt".

PERSUASION-HEBEL steuert composition UND humanRole:
- authority → Expert/Pro im Bild (Hände/Schulteransatz eines Profis aus
  der Zielgruppe), close-up auf Vorgehen.
- social-proof → mehrere Anwender sichtbar oder ein klar relatable
  Anwender, environmentaler Shot.
- scarcity → einzelnes Stück hervorgehoben, klares Solo-Subjekt,
  reduzierte Komposition.
- urgency → Bewegungs-Hint, leichte Unschärfe, Hand-im-Begriff-zu-greifen.
- authenticity → roher Doku-Look, kein Posing, alltägliches Detail.
- novelty → ungewöhnlicher Winkel/Perspektive (overhead, low-angle).
- (Lever nicht angegeben → wähle composition frei nach Setting.)

HOOK steuert composition zusätzlich (optional):
- comparison → split-frame oder side-by-side-Andeutung (zwei Zustände).
- secret/curiosity → close-up macro auf das ungewöhnliche Detail.
- number/proof → das Subjekt klar zentriert, eine Zahl/ein Beweis-Element
  könnte als Prop im Bild liegen (NICHT als Text-Overlay).
- question → offene Komposition mit Raum für Text/Headline.

ZIELGRUPPE → humanRole:
- Person ergibt sich AUS der Audience-Beschreibung (Beruf, Alter,
  Lebenswelt). Englisch, kompakt, z. B. 'hands of a young woman in a
  bathroom applying the cream'.
- Wenn der User eine PERSONA explizit ausgewählt hat, ist sie ein
  Anker — leite humanRole konsistent dazu ab, aber wiederhole sie nicht
  wörtlich.
- Wenn das Produkt allein stärker wirkt (Hero-Shot ohne Mensch),
  humanRole = Leer-String.

OUTPUT: JSON nach Schema. Keine Erklärungen.`;

function buildUserPrompt(input: InferImageSceneInput): string {
  const lines: string[] = [];
  lines.push(`PRODUKT: ${input.product || "(nicht angegeben)"}`);
  lines.push(`ZIELGRUPPE: ${input.audience || "(nicht angegeben)"}`);
  lines.push(`ANGLE: ${input.angle || "(direkt)"}`);
  if (input.frame) lines.push(`FRAME: ${input.frame}`);
  if (input.persuasionLever) lines.push(`PERSUASION-HEBEL: ${input.persuasionLever}`);
  if (input.hookLabel) lines.push(`HOOK: ${input.hookLabel}`);
  if (input.imageStyleLabel) lines.push(`IMAGE-STYLE-WUNSCH: ${input.imageStyleLabel}`);
  if (input.personaLabel) lines.push(`PERSONA (vom User gewählt, als Anker): ${input.personaLabel}`);
  if (input.platformLabel) lines.push(`PLATTFORM-FORMAT: ${input.platformLabel}`);
  if (input.gebinde) lines.push(`GEBINDE: ${input.gebinde}`);
  if (input.industryHint && input.industryHint !== "auto") {
    lines.push(
      `BRANCHEN-QUICK-PICK (User-Wahl, als Anker — nicht erzwingen): ${input.industryHint}`,
    );
  }
  if (input.websiteText) {
    const trimmed = input.websiteText.slice(0, 500);
    lines.push(`WEBSITE-KONTEXT (Auszug):\n${trimmed}`);
  }
  return lines.join("\n");
}

/**
 * Cache-Key aus den Inputs. Identische Briefings → ein LLM-Call,
 * alle Varianten teilen sich denselben SceneSpec.
 */
function cacheKey(input: InferImageSceneInput): string {
  const sig = JSON.stringify({
    p: input.product,
    a: input.audience,
    g: input.angle,
    f: input.frame ?? "",
    l: input.persuasionLever ?? "",
    h: input.hookLabel ?? "",
    s: input.imageStyleLabel ?? "",
    pr: input.personaLabel ?? "",
    plt: input.platformLabel ?? "",
    ge: input.gebinde ?? "",
    i: input.industryHint ?? "",
    w: (input.websiteText ?? "").slice(0, 500),
  });
  return createHash("sha256").update(sig).digest("hex").slice(0, 16);
}

// In-Memory-Cache: pro Server-Prozess. Reicht für eine Generate-Session
// in der mehrere Varianten dieselbe Brief-Basis teilen. Persistenter Cache
// (DB) wäre nice-to-have aber ist Phase-2-Overkill — der LLM-Call ist
// günstig (gpt-4o-mini, ~200 Output-Tokens) und passiert nur 1×/Brief.
const sceneCache = new Map<string, SceneSpec>();

/**
 * Hauptfunktion. Liefert eine inferierte SceneSpec. Bei LLM-Fehler oder
 * fehlendem OpenAI-Key wird ein neutraler Fallback zurückgegeben, der das
 * Image-Modell zu einer realistischen Doku-Foto-Szene führt — ohne
 * Branchen-Default.
 */
export async function inferImageScene(
  input: InferImageSceneInput,
): Promise<SceneSpec> {
  const key = cacheKey(input);
  const cached = sceneCache.get(key);
  if (cached) return cached;

  if (!openaiKeyIsValid) {
    return neutralFallback(input);
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: sceneSpecSchema,
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(input),
      temperature: 0.6,
    });
    sceneCache.set(key, object);
    return object;
  } catch (err) {
    console.warn(
      `[scene-inference] LLM call failed, using neutral fallback:`,
      err instanceof Error ? err.message : err,
    );
    const fallback = neutralFallback(input);
    sceneCache.set(key, fallback);
    return fallback;
  }
}

/**
 * Neutraler Fallback ohne LLM. Liefert eine generische Doku-Foto-Szene
 * ohne Branchen-Anker. Wird verwendet wenn der OPENAI_API_KEY fehlt oder
 * der LLM-Call scheitert — damit Generate niemals an der Inferenz hängt.
 */
function neutralFallback(input: InferImageSceneInput): SceneSpec {
  const mood =
    input.frame === "loss"
      ? "cool overcast daylight, serious mood"
      : input.frame === "gain"
        ? "warm soft daylight, optimistic mood"
        : "natural daylight, calm documentary mood";
  return {
    setting:
      "the real-world place where this product is actually used by the audience described above",
    environment:
      "authentic in-context props that match the product, no studio elements",
    lightingMood: mood,
    humanRole: "",
    composition: "natural environmental shot, no stock-photo composition",
    forbidScenes:
      "no auto repair workshop, no generic industrial hall, no studio backdrop, no stock-photo cliché",
  };
}

/**
 * Hilfs-Renderer: SceneSpec → kompakter Prompt-Block (für actions.ts).
 * Erzeugt einen klaren englischen Block der wörtlich in den Image-Prompt
 * eingehängt wird.
 */
export function renderSceneSpecBlock(spec: SceneSpec): string {
  const lines: string[] = [];
  lines.push(`SCENE (use as the scene anchor):`);
  lines.push(`- Setting: ${spec.setting}`);
  if (spec.environment) lines.push(`- Environment details: ${spec.environment}`);
  if (spec.lightingMood) lines.push(`- Light/Mood: ${spec.lightingMood}`);
  if (spec.humanRole) lines.push(`- Human in frame: ${spec.humanRole}`);
  if (spec.composition) lines.push(`- Composition: ${spec.composition}`);
  if (spec.forbidScenes) lines.push(`- NEGATIVE (do NOT render): ${spec.forbidScenes}`);
  return lines.join("\n");
}
