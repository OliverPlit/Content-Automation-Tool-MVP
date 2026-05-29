/**
 * Nano-Banana Multi-Image-Edit Helper.
 *
 * Verwendet das offizielle @google/genai SDK direkt (nicht @ai-sdk/google),
 * weil Vercel-AI-SDK's generateImage() nur Text-Input akzeptiert. Nano Banana
 * (gemini-2.5-flash-image) kann zusätzlich ein Referenzbild als InlineData-Part
 * entgegennehmen und das Produkt nativ in die generierte Szene komponieren —
 * mit korrekter Skalierung, Schatten und Licht-Match.
 */
import { GoogleGenAI } from "@google/genai";

const apiKey = (process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "")
  .trim()
  .replace(/^["'‘’“”]+|["'‘’“”]+$/g, "")
  .replace(/[^\x20-\x7E]/g, "")
  .trim();

const client = apiKey ? new GoogleGenAI({ apiKey }) : null;

export type SceneGenResult =
  | { ok: true; bytes: Uint8Array; mediaType: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Gebinde → realistische Größen-/Skalen-Beschreibung
// Nano Banana erkennt aus dem Referenzbild allein NICHT, ob ein Behälter
// 1 L oder 1000 L fasst — Container-Form ähnelt sich oft. Wir geben dem
// Modell deshalb eine explizite Real-Welt-Skala als Text mit.
// ---------------------------------------------------------------------------
const GEBINDE_SIZE_HINTS: { match: RegExp; hint: string }[] = [
  // 1000 L IBC (massiv, dominiert die Szene)
  {
    match: /1000\s*l|ibc|cubic[\s-]?tote|kubikmeter|m3|m³/i,
    hint:
      "1000-liter IBC tote in white plastic cage, MASSIVE industrial container approximately 120 cm tall and 100 cm wide, must dominate the scene, larger than an adult person up to chest height, NOT a small bottle or canister — show the real scale of a pallet-sized container",
  },
  // 200 L Fass
  {
    match: /200\s*l|200[\s-]?liter|fass\s*200|drum\s*200/i,
    hint:
      "200-liter steel/plastic drum, large cylindrical barrel approximately 90 cm tall and 60 cm diameter, reaches roughly to an adult's hip, typically blue or yellow, NOT a small canister",
  },
  // 60 L Fass / Eimer
  {
    match: /60\s*l|60[\s-]?liter|fass\s*60|drum\s*60|eimer\s*60/i,
    hint:
      "60-liter drum or large bucket, approximately 50 cm tall, reaches mid-thigh on an adult, larger than a household paint bucket, NOT a small bottle",
  },
  // 20 L Kanister / Eimer
  {
    match: /20\s*l|kanister\s*20|eimer\s*20|bucket\s*20|jerry[\s-]?can/i,
    hint:
      "20-liter canister or bucket, hand-carryable, approximately 35 cm tall, like a standard jerry-can or paint bucket",
  },
  // 10 L Kanister
  {
    match: /10\s*l|kanister\s*10|bottle\s*10/i,
    hint:
      "10-liter handheld canister, approximately 25 cm tall, one-handed carry",
  },
  // 5 L Kanister
  {
    match: /\b5\s*l|kanister\s*5/i,
    hint:
      "5-liter handheld canister, approximately 22 cm tall, similar to a large household cleaning bottle",
  },
  // 1 L Flasche
  {
    match: /\b1\s*l|liter\b|flasche|bottle/i,
    hint:
      "1-liter bottle, approximately 25 cm tall, hand-held, like a standard water bottle",
  },
];

function buildSizeHint(gebinde: string | undefined): string {
  if (!gebinde || gebinde.trim().length === 0) return "";
  for (const { match, hint } of GEBINDE_SIZE_HINTS) {
    if (match.test(gebinde)) return hint;
  }
  // Fallback: gebinde 1:1 ins Prompt, ohne Skalen-Detail
  return `container size: ${gebinde.trim()} — match real-world physical scale`;
}

/**
 * Generiert eine neue Szene mit dem Produktbild nativ eingewoben.
 * @param prompt   — Szenenbeschreibung (Englisch empfohlen)
 * @param productImageUrl — Public-URL des Produktbildes (z. B. Supabase-Storage)
 * @param gebinde — Gebinde-Bezeichnung aus ProductFacts (z. B. „1000L IBC")
 *                  bestimmt die reale Größe des Produkts in der Szene.
 */
export async function generateSceneWithProduct(
  prompt: string,
  productImageUrl: string,
  gebinde?: string,
): Promise<SceneGenResult> {
  if (!client) {
    return {
      ok: false,
      error:
        "GOOGLE_GENERATIVE_AI_API_KEY fehlt — Multi-Image-Edit nicht möglich.",
    };
  }

  // 1. Produktbild laden + zu Base64 konvertieren
  let productBase64: string;
  let productMime: string;
  try {
    const res = await fetch(productImageUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "image/*" },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Produktbild konnte nicht geladen werden (HTTP ${res.status}).`,
      };
    }
    productMime = res.headers.get("content-type") ?? "image/jpeg";
    if (!productMime.startsWith("image/")) productMime = "image/jpeg";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 8 * 1024 * 1024) {
      return { ok: false, error: "Produktbild zu groß (> 8 MB)." };
    }
    productBase64 = Buffer.from(buf).toString("base64");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Netzwerk-Fehler.";
    return { ok: false, error: `Produktbild-Fetch fehlgeschlagen: ${msg}` };
  }

  // 2. Gemini-Call mit Image-Part + Text-Part
  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: productMime,
                data: productBase64,
              },
            },
            {
              text:
                `PRODUCT IDENTITY LOCK (HIGHEST PRIORITY):\n` +
                `The reference image shows the EXACT product. You MUST keep it 100% identical:\n` +
                `- DO NOT redesign, redraw, restyle, or recolor the label.\n` +
                `- DO NOT change the logo, brand name, typography, or any text on the product.\n` +
                `- DO NOT change the container color, shape, cap, or proportions.\n` +
                `- DO NOT modify the liquid color visible through the container.\n` +
                `- DO NOT add new text or labels that are not on the reference.\n` +
                `- DO NOT generate a stylized "ad version" of the product.\n` +
                `- Treat the product as a real physical object that you are PHOTOGRAPHING in a new environment — only re-light and re-position it, never redesign it.\n\n` +
                (gebinde && buildSizeHint(gebinde)
                  ? `REAL-WORLD SCALE (HARD CONSTRAINT):\n- ${buildSizeHint(gebinde)}\n- The product must occupy the screen at this true physical scale relative to any humans or background objects shown.\n\n`
                  : "") +
                `SCENE TO BUILD AROUND THE PRODUCT:\n${prompt}\n\n` +
                `Requirements:\n` +
                "- AUTHENTIC real-world scene, NOT a commercial advertising shot. The product is being actually used by a real person in a real environment.\n" +
                "- Look and feel of a candid smartphone photo or documentary still — available light only, slight handheld feel, real-world imperfections (dust, wear, ambient mess).\n" +
                "- The product must be the visual hero, in sharp focus, at the correct real-world size for its gebinde (see scale constraint above if given).\n" +
                "- Match the lighting direction, color temperature and shadows of the scene to the product so it sits believably in the environment.\n" +
                "- Keep label text on the product crisp, readable, and IDENTICAL to the reference image.\n" +
                "- NEGATIVE: do not modify the label or logo, do not stylize the product, no studio polish, no commercial advertising look, no plastic perfect surfaces, no overly symmetric composition, no fake bokeh, no airbrush, no stock-photo cliché, no text overlays on the scene, no watermarks, no captions, no fictional product variants.",
            },
          ],
        },
      ],
      config: {
        responseModalities: ["IMAGE"],
      },
    });

    // 3. Extract image bytes aus erstem Candidate
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData;
      if (inline?.data) {
        const bytes = new Uint8Array(Buffer.from(inline.data, "base64"));
        return {
          ok: true,
          bytes,
          mediaType: inline.mimeType ?? "image/png",
        };
      }
    }
    return {
      ok: false,
      error: "Gemini hat kein Bild zurückgegeben (nur Text).",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gemini-Fehler.";
    const isQuota = /quota|rate.?limit|429|billing/i.test(msg);
    return {
      ok: false,
      error: isQuota
        ? "Gemini-Limit/Billing-Problem. In Google AI Studio prüfen."
        : `Multi-Image-Edit fehlgeschlagen: ${msg}`,
    };
  }
}
