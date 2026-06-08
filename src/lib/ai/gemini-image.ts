/**
 * Szenen-Generator mit nativer Produkt-Composite.
 *
 * Frühere Version: Gemini-Nano-Banana hat das Produktbild als Input bekommen
 * und die Szene + Produkt zusammen NEU generiert ("Multi-Image-Edit").
 * Problem: Label, Farben und Proportionen des Produkts wurden trotz Prompt-
 * Locks vom Modell modifiziert.
 *
 * NEU (IC-1): Wir generieren die Szene OHNE Produkt und legen das
 * Originalbild server-seitig pixelgenau drauf (sharp). Resultat: das
 * Produkt bleibt 100 % identisch zum Upload — kein Re-Render, kein
 * Re-Color, keine modifizierten Labels.
 *
 * NEU (IC-3): Vor dem Composite wird ein (nahezu) einfarbiger Hintergrund
 * des Produktbildes per Edge-Flood-Fill entfernt, damit das Produkt OHNE
 * sichtbare Box/Sticker-Kante in die Szene eingewoben wird. Ein dezenter
 * Kontaktschatten lässt es in der Szene „stehen" statt zu schweben. Die
 * Produkt-Pixel selbst (Farben, Label, Proportionen, Maßstab) bleiben dabei
 * unverändert — es werden ausschließlich Hintergrundpixel transparent.
 *
 * Trade-off: Lighting matcht nicht 1:1 mit der Szene (weil das Produkt nicht
 * von der Szene "weiß"). Dafür ist die Marken-Identität geschützt — was der
 * User explizit haben will.
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

/**
 * Aspektratio-Typ — Superset, damit alle Caller (inkl. @ai-sdk/google
 * GeminiAspect mit „4:3" etc.) ohne Cast durchkommen.
 */
export type SceneAspect =
  | "1:1"
  | "4:5"
  | "3:4"
  | "4:3"
  | "9:16"
  | "16:9"
  | "1.91:1";

// ---------------------------------------------------------------------------
// Gebinde → relative Produkt-Größe in der Szene.
// Größere Behälter sollen prominenter sein, kleine eher zurückhaltend.
// Werte = Anteil an Szenen-Höhe (0–1). Nur als Layout-Hint, nicht für Gemini.
// ---------------------------------------------------------------------------
const GEBINDE_SIZE_TABLE: { match: RegExp; heightRatio: number }[] = [
  { match: /1000\s*l|ibc|cubic[\s-]?tote|m³|m3/i, heightRatio: 0.75 },
  { match: /200\s*l|drum\s*200|fass\s*200/i,      heightRatio: 0.65 },
  { match: /60\s*l|drum\s*60|fass\s*60/i,         heightRatio: 0.55 },
  { match: /20\s*l|kanister\s*20|jerry/i,         heightRatio: 0.45 },
  { match: /10\s*l|kanister\s*10/i,               heightRatio: 0.40 },
  { match: /\b5\s*l|kanister\s*5/i,               heightRatio: 0.35 },
  { match: /\b1\s*l|liter\b|flasche|bottle/i,     heightRatio: 0.30 },
];

function pickHeightRatio(gebinde: string | undefined): number {
  if (!gebinde) return 0.4;
  const lower = gebinde.toLowerCase();
  for (const { match, heightRatio } of GEBINDE_SIZE_TABLE) {
    if (match.test(lower)) return heightRatio;
  }
  return 0.4;
}

/**
 * Generiert eine neue Szene und legt das Produktbild pixelgenau drauf.
 *
 * @param prompt           Szenen-Beschreibung (ohne Produkt-Re-Rendering!)
 * @param productImageUrl  Public-URL des Produktbildes (Supabase-Storage o.ä.)
 * @param gebinde          Optional — bestimmt nur die relative Größe im Composite
 * @param aspect           Szenen-Aspektratio (Default 1:1)
 */
export async function generateSceneWithProduct(
  prompt: string,
  productImageUrl: string,
  gebinde?: string,
  aspect: SceneAspect = "1:1",
): Promise<SceneGenResult> {
  if (!client) {
    return {
      ok: false,
      error:
        "GOOGLE_GENERATIVE_AI_API_KEY fehlt — Szenen-Generierung nicht möglich.",
    };
  }

  // ── 1) Szene OHNE Produkt-Referenz generieren ────────────────────────
  // Prompt-Locks zur Produkt-Identität sind raus (irrelevant — wir geben
  // Gemini gar kein Produkt-Bild als Input). Stattdessen Hinweis auf
  // freien Platz unten Mitte, damit das Composite nicht über interessante
  // Bild-Inhalte fällt.
  let sceneBytes: Uint8Array = new Uint8Array(0);
  let sceneMime = "image/png";
  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `${prompt}\n\n` +
                `COMPOSITION HINT:\n` +
                `- Aspect ratio: ${aspect}.\n` +
                `- Leave the LOWER-CENTER zone (bottom ~40 % of the frame, ~60 % wide, centered) visually CLEAN and UNCLUTTERED — a product will be composited there. No important faces, no foreground objects, no text in that area.\n` +
                `- The background and surroundings should still feel rich and authentic so the product looks placed IN the scene, not against a blank wall.\n` +
                `- DO NOT render ANY product in the scene: no oil canisters, no jerry cans, no bottles, no cans, no drums, no packaging, no boxes, no labels, no branded goods of any kind. The only product will be added later by compositing — the scene itself must contain ZERO products.\n` +
                `- The surface in the lower-center must be an empty, clean ground/table/floor where a single product can stand.\n\n` +
                `STYLE:\n` +
                `- Documentary realism, available light only, candid handheld feel.\n` +
                `- NOT a commercial advertising shot, NO studio polish, NO airbrush.\n` +
                `- NEGATIVE: no extra products, no canisters, no jerry cans, no bottles, no cans, no drums, no packaging, no duplicate objects, no text overlays, no watermarks, no captions, no fake bokeh, no stock-photo cliché.`,
            },
          ],
        },
      ],
      config: {
        responseModalities: ["IMAGE"],
      },
    });

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    let found = false;
    for (const part of parts) {
      const inline = part.inlineData;
      if (inline?.data) {
        sceneBytes = new Uint8Array(Buffer.from(inline.data, "base64"));
        sceneMime = inline.mimeType ?? "image/png";
        found = true;
        break;
      }
    }
    if (!found) {
      return {
        ok: false,
        error: "Gemini hat kein Szenen-Bild zurückgegeben (nur Text).",
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gemini-Fehler.";
    const isQuota = /quota|rate.?limit|429|billing/i.test(msg);
    return {
      ok: false,
      error: isQuota
        ? "Gemini-Limit/Billing-Problem. In Google AI Studio prüfen."
        : `Szenen-Generierung fehlgeschlagen: ${msg}`,
    };
  }

  // ── 2) Produktbild laden ────────────────────────────────────────────
  let productBuffer: Buffer;
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
    const ab = await res.arrayBuffer();
    if (ab.byteLength > 16 * 1024 * 1024) {
      return { ok: false, error: "Produktbild zu groß (> 16 MB)." };
    }
    productBuffer = Buffer.from(ab);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Netzwerk-Fehler.";
    return { ok: false, error: `Produktbild-Fetch fehlgeschlagen: ${msg}` };
  }

  // ── 3) Composite via sharp ──────────────────────────────────────────
  // Wir resizen das Produkt auf einen sinnvollen Anteil der Szenen-Höhe
  // (gebinde-basiert), stellen den Hintergrund frei und positionieren
  // bottom-center mit 5 % Margin. Aspect/Maßstab bleibt erhalten (fit: inside).
  try {
    // dynamic import — sharp ist eine Native-Lib und sollte nicht eager
    // im Edge-Bundle landen.
    const sharp = (await import("sharp")).default;

    const sceneSharp = sharp(Buffer.from(sceneBytes));
    const sceneMeta = await sceneSharp.metadata();
    const sceneW = sceneMeta.width ?? 1024;
    const sceneH = sceneMeta.height ?? 1024;

    const heightRatio = pickHeightRatio(gebinde);
    const targetProductHeight = Math.round(sceneH * heightRatio);
    // Falls Produkt sehr breit wäre und über die Szene hinausragt → fit:inside
    const maxProductWidth = Math.round(sceneW * 0.7);

    const productResized = await sharp(productBuffer)
      .resize({
        height: targetProductHeight,
        width: maxProductWidth,
        fit: "inside",
        withoutEnlargement: false,
      })
      .png() // sicher transparente Bereiche behalten
      .toBuffer({ resolveWithObject: true });

    const prodW = productResized.info.width;
    const prodH = productResized.info.height;

    // Hintergrund freistellen → Produkt wird OHNE Box/Sticker-Kante eingewoben.
    // Schlägt das fehl oder ist der Hintergrund kein einfarbiger Studio-BG,
    // bleibt das Produktbild unverändert (kein Risiko, nichts kaputt zu machen).
    const { png: productCutRaw } = await cutoutBackground(productResized.data);

    // Szenen-Farbprofil (Kanal-Mittelwerte + Luminanz) als Ziel-„Filter"
    // bestimmen — damit das Produkt denselben Look/Weißabgleich wie die Szene
    // bekommt und nicht wie aus einem anderen Foto wirkt.
    let sceneMean: [number, number, number] = [128, 128, 128];
    let sceneLum = 128;
    try {
      const st = await sharp(Buffer.from(sceneBytes)).stats();
      const c = st.channels;
      if (c.length >= 3) {
        sceneMean = [c[0].mean, c[1].mean, c[2].mean];
        sceneLum = 0.299 * c[0].mean + 0.587 * c[1].mean + 0.114 * c[2].mean;
      }
    } catch {
      // Defaults behalten
    }

    // Produkt an den Szenen-Look angleichen (dezenter Filter/Weißabgleich —
    // Produkt-Identität bleibt klar erkennbar).
    const productCut = await gradeProductToScene(productCutRaw, sceneMean);

    const left = Math.max(0, Math.round((sceneW - prodW) / 2));
    const top = Math.max(
      0,
      Math.round(sceneH - prodH - sceneH * 0.05), // 5 % Boden-Margin
    );

    // Layer-Stack: erst der passende Bodenschatten (Deckkraft an Szenen-
    // helligkeit gekoppelt), dann das freigestellte Produkt darüber.
    const layers: Array<{ input: Buffer; top: number; left: number }> = [];
    const ground = await buildGroundShadow(productCut, prodW, prodH, sceneLum);
    if (ground) {
      layers.push({
        input: ground.buffer,
        left: Math.max(0, left + Math.round((prodW - ground.width) / 2)),
        top: Math.min(
          sceneH - ground.height,
          top + prodH - Math.round(ground.height * 0.55),
        ),
      });
    }
    layers.push({ input: productCut, top, left });

    const baseComposite = await sceneSharp.composite(layers).toBuffer();

    // (4) Sharp-Harmonisierung (Fallback-Ergebnis): feines Film-Korn über das
    // GANZE Bild legt einen gemeinsamen Textur-Layer über Produkt UND Szene —
    // das killt den „zu sauber/zu scharf"-Sticker-Look am stärksten.
    let harmonized = baseComposite;
    try {
      const amp = 14;
      const px = sceneW * sceneH;
      const noiseRaw = Buffer.allocUnsafe(px * 3);
      for (let i = 0; i < px; i++) {
        const n = 128 + Math.round((Math.random() * 2 - 1) * amp);
        const v = n < 0 ? 0 : n > 255 ? 255 : n;
        noiseRaw[i * 3] = v;
        noiseRaw[i * 3 + 1] = v;
        noiseRaw[i * 3 + 2] = v;
      }
      const noisePng = await sharp(noiseRaw, {
        raw: { width: sceneW, height: sceneH, channels: 3 },
      })
        .png()
        .toBuffer();
      harmonized = await sharp(baseComposite)
        .composite([{ input: noisePng, blend: "soft-light" }])
        .toBuffer();
    } catch {
      harmonized = baseComposite;
    }

    // (5) Relight-Pass (Default): das Composite geht einmal zurück an Gemini,
    // das NUR Licht/Schatten/Farbstimmung des Produkts an die Szene angleicht
    // (Label/Logo/Form per Prompt gesperrt). Realistischstes Ergebnis.
    // (6) Guard: Struktur-Vergleich der Produkt-Region — weicht sie zu stark ab
    // (Label zerstört), wird auf das harmonisierte Composite zurückgefallen.
    const region = { left, top, prodW, prodH };
    let finalBuf = harmonized;
    let finalMime = sceneMime;
    const relit = await relightComposite(harmonized, sceneW, sceneH);
    if (relit) {
      const sim = await regionEdgeCorrelation(harmonized, relit, region);
      if (sim >= 0.4) {
        finalBuf = relit;
        finalMime = "image/png";
      }
    }

    return {
      ok: true,
      bytes: new Uint8Array(finalBuf),
      mediaType: finalMime,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sharp-Composite-Fehler.";
    return { ok: false, error: `Composite fehlgeschlagen: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// generateProductInScene — REALISMUS-Modus (Default): das Produktbild wird als
// Referenz an Gemini 2.5 Flash Image gegeben und das Modell generiert das
// Produkt NATIV in die Szene (echte Tiefenschärfe, Golden-Hour-Licht, echter
// Bodenschatten — wie ein echtes Foto, statt aufgeklebt). Trade-off: das Label
// kann minimal abweichen. Für pixelgenaues Label → generateSceneWithProduct.
// ---------------------------------------------------------------------------
export async function generateProductInScene(
  prompt: string,
  productImageUrl: string,
  gebinde?: string,
  aspect: SceneAspect = "1:1",
): Promise<SceneGenResult> {
  if (!client) {
    return {
      ok: false,
      error:
        "GOOGLE_GENERATIVE_AI_API_KEY fehlt — Bild-Generierung nicht möglich.",
    };
  }

  // Produktbild laden (als Referenz für die native Platzierung).
  let productBuffer: Buffer;
  let productMime = "image/png";
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
    const ct = res.headers.get("content-type") ?? "";
    if (ct.startsWith("image/")) productMime = ct.split(";")[0].trim();
    const ab = await res.arrayBuffer();
    if (ab.byteLength > 16 * 1024 * 1024) {
      return { ok: false, error: "Produktbild zu groß (> 16 MB)." };
    }
    productBuffer = Buffer.from(ab);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Netzwerk-Fehler.";
    return { ok: false, error: `Produktbild-Fetch fehlgeschlagen: ${msg}` };
  }

  const sizeHint = gebinde
    ? `Realistic real-world scale for a ${gebinde} container.`
    : "Realistic real-world scale.";

  const instruction =
    `PLACE THE ATTACHED PRODUCT into a photorealistic scene and render the final photograph.\n\n` +
    `SCENE / STYLE:\n${prompt}\n\n` +
    `PRODUCT PLACEMENT (critical):\n` +
    `- The attached product is the HERO in the foreground, standing on natural ground, fully visible. ${sizeHint}\n` +
    `- Photorealistic, shot on a 50mm f/1.8 lens: SHALLOW DEPTH OF FIELD — the product is tack-sharp, the background is softly blurred (natural bokeh).\n` +
    `- One consistent light source (warm golden-hour directional light); add a realistic, grounded contact shadow that anchors the product to the surface.\n` +
    `- Keep the product's exact shape, proportions, label text, logo and colors — readable and unchanged.\n` +
    `- The background may show a contextual environment (machine, field, workshop) but MUST NOT contain any other product, canister, bottle, drum or packaging.\n` +
    `- Aspect ratio: ${aspect}.\n\n` +
    `NEGATIVE: no studio polish, no commercial advertising look, no plastic-perfect surfaces, no duplicate products, no extra canisters or bottles, no text overlays, no watermarks, no deformed product, no AI artifacts, no lowres.\n` +
    `Output only the final photograph.`;

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: productMime, data: productBuffer.toString("base64") } },
            { text: instruction },
          ],
        },
      ],
      config: { responseModalities: ["IMAGE"] },
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData;
      if (inline?.data) {
        return {
          ok: true,
          bytes: new Uint8Array(Buffer.from(inline.data, "base64")),
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
        : `Bild-Generierung fehlgeschlagen: ${msg}`,
    };
  }
}

// ---------------------------------------------------------------------------
// cropToAspect — schneidet ein Bild MITTIG (cover) auf das exakte Ziel-Seiten-
// verhältnis, ohne zu skalieren. Garantiert, dass die Ausgabe im gewählten
// Plattform-/Wunschformat vorliegt, egal was das Modell zurückgegeben hat.
// ratio = Breite / Höhe (z. B. 4:5 → 0.8 · 9:16 → 0.5625 · 1.91:1 → 1.91).
// ---------------------------------------------------------------------------
export async function cropToAspect(
  bytes: Uint8Array,
  ratio: number,
): Promise<Uint8Array> {
  if (!Number.isFinite(ratio) || ratio <= 0) return bytes;
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(Buffer.from(bytes)).metadata();
    const w0 = meta.width ?? 0;
    const h0 = meta.height ?? 0;
    if (w0 < 2 || h0 < 2) return bytes;
    const curR = w0 / h0;
    if (Math.abs(curR - ratio) < 0.01) return bytes; // schon korrekt
    let W: number;
    let H: number;
    if (curR > ratio) {
      H = h0; // zu breit → Breite beschneiden
      W = Math.round(h0 * ratio);
    } else {
      W = w0; // zu hoch → Höhe beschneiden
      H = Math.round(w0 / ratio);
    }
    W = Math.max(1, Math.min(W, w0));
    H = Math.max(1, Math.min(H, h0));
    const left = Math.max(0, Math.round((w0 - W) / 2));
    const top = Math.max(0, Math.round((h0 - H) / 2));
    const out = await sharp(Buffer.from(bytes))
      .extract({ left, top, width: W, height: H })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return bytes;
  }
}

// ---------------------------------------------------------------------------
// relightComposite — schickt das fertige Composite zurück an Gemini 2.5 Flash
// Image und lässt NUR Licht/Schatten/Farbstimmung des Produkts an die Szene
// angleichen. Label, Logo, Form, Position und der Hintergrund sind per Prompt
// hart gesperrt. Liefert null bei jedem Fehler → Aufrufer nutzt das Fallback.
// ---------------------------------------------------------------------------
const RELIGHT_INSTRUCTION =
  "You are a professional VFX compositor. The attached image is a real product photo composited into a scene — the product currently looks pasted-on / like a sticker. Your task: make ONLY the product sit naturally in the scene. " +
  "DO: match the product's lighting direction, color temperature, contrast, exposure and grain to the surrounding scene; add a realistic grounded contact shadow consistent with the scene's main light; add a subtle light-wrap so scene light bleeds onto the product edges; soften the over-sharp cut edge slightly. " +
  "ABSOLUTE CONSTRAINTS — do NOT violate: keep the product's label text, logo, brand name, graphics, colors, shape, proportions and position EXACTLY identical; do NOT redesign or re-letter the label; do NOT add, remove, move or duplicate any object; do NOT change the background scene; keep the exact same framing and aspect ratio. " +
  "Output only the edited image, same dimensions.";

async function relightComposite(
  compositePng: Buffer,
  w: number,
  h: number,
): Promise<Buffer | null> {
  if (!client) return null;
  try {
    const b64 = Buffer.from(compositePng).toString("base64");
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/png", data: b64 } },
            { text: RELIGHT_INSTRUCTION },
          ],
        },
      ],
      config: { responseModalities: ["IMAGE"] },
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData;
      if (inline?.data) {
        const sharp = (await import("sharp")).default;
        // Auf exakte Composite-Maße bringen (Gemini kann skalieren).
        return await sharp(Buffer.from(inline.data, "base64"))
          .resize(w, h, { fit: "fill" })
          .png()
          .toBuffer();
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// regionEdgeCorrelation — Struktur-Ähnlichkeit der Produkt-Region zwischen zwei
// Bildern via Laplace-Kanten + Pearson-Korrelation. Relighting ändert Helligkeit/
// Farbe, aber NICHT die Kantenstruktur (Label-Text, Form) → hohe Korrelation.
// Ein zerstörtes Label senkt die Korrelation deutlich. Bereich [-1..1].
// Bei Fehlern → 1 (Relight akzeptieren, da als Default gewählt).
// ---------------------------------------------------------------------------
async function regionEdgeCorrelation(
  aPng: Buffer,
  bPng: Buffer,
  region: { left: number; top: number; prodW: number; prodH: number },
): Promise<number> {
  try {
    const sharp = (await import("sharp")).default;
    const size = 96;
    const laplace = [0, -1, 0, -1, 4, -1, 0, -1, 0];
    const prep = async (buf: Buffer): Promise<Uint8Array> => {
      const out = await sharp(buf)
        .extract({
          left: region.left,
          top: region.top,
          width: region.prodW,
          height: region.prodH,
        })
        .resize(size, size, { fit: "fill" })
        .greyscale()
        .convolve({ width: 3, height: 3, kernel: laplace })
        .raw()
        .toBuffer();
      return new Uint8Array(out);
    };
    const A = await prep(aPng);
    const B = await prep(bPng);
    const n = Math.min(A.length, B.length);
    if (n === 0) return 1;
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < n; i++) {
      sa += A[i];
      sb += B[i];
    }
    const ma = sa / n;
    const mb = sb / n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i++) {
      const xa = A[i] - ma;
      const xb = B[i] - mb;
      num += xa * xb;
      da += xa * xa;
      db += xb * xb;
    }
    if (da === 0 || db === 0) return 1;
    return num / Math.sqrt(da * db);
  } catch {
    return 1;
  }
}

// ---------------------------------------------------------------------------
// cutoutBackground — entfernt einen (nahezu) einfarbigen Hintergrund per
// Edge-Flood-Fill und gibt ein PNG mit Transparenz zurück. Es werden NUR
// zusammenhängende Hintergrundpixel vom Rand aus transparent gesetzt — das
// Produkt selbst (Farben, Label, helle Innenflächen) bleibt unangetastet.
//
// Defensive Guards: Ist der Rand bereits transparent (schon freigestellt),
// der Hintergrund nicht einfarbig (echtes Foto) oder würde die Entfernung das
// Produkt auffressen, wird das Bild unverändert (removed=false) zurückgegeben.
// ---------------------------------------------------------------------------
async function cutoutBackground(
  input: Buffer,
): Promise<{ png: Buffer; removed: boolean }> {
  const sharp = (await import("sharp")).default;
  const passthrough = async () => ({
    png: await sharp(input).ensureAlpha().png().toBuffer(),
    removed: false,
  });
  try {
    const { data, info } = await sharp(input)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    if (info.channels !== 4 || w < 4 || h < 4) return passthrough();

    // (a) Bereits freigestellt? Viel Transparenz am Rand → nichts tun.
    let borderClear = 0;
    let borderCount = 0;
    const checkClear = (x: number, y: number) => {
      borderCount++;
      if (data[(y * w + x) * 4 + 3] < 250) borderClear++;
    };
    for (let x = 0; x < w; x++) {
      checkClear(x, 0);
      checkClear(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      checkClear(0, y);
      checkClear(w - 1, y);
    }
    if (borderClear / Math.max(1, borderCount) > 0.5) return passthrough();

    // (b) Referenz-Hintergrundfarbe aus Ecken + Kantenmitten + Uniformitäts-Check.
    const pts: Array<[number, number]> = [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1],
      [w >> 1, 0],
      [w >> 1, h - 1],
      [0, h >> 1],
      [w - 1, h >> 1],
    ];
    const cols = pts.map(([x, y]) => {
      const i = (y * w + x) * 4;
      return [data[i], data[i + 1], data[i + 2]] as const;
    });
    let br = 0;
    let bg = 0;
    let bb = 0;
    for (const [r, g, b] of cols) {
      br += r;
      bg += g;
      bb += b;
    }
    br /= cols.length;
    bg /= cols.length;
    bb /= cols.length;
    let spread = 0;
    for (const [r, g, b] of cols) {
      const d = Math.hypot(r - br, g - bg, b - bb);
      if (d > spread) spread = d;
    }
    // Rand nicht einfarbig → echtes Szenenfoto, kein simpler BG: nichts tun.
    if (spread > 60) return passthrough();

    // (c) Flood-Fill vom Rand: zusammenhängende Hintergrund-Pixel → alpha 0.
    const tol2 = 46 * 46;
    const matches = (i: number) => {
      const dr = data[i] - br;
      const dg = data[i + 1] - bg;
      const db = data[i + 2] - bb;
      return dr * dr + dg * dg + db * db <= tol2;
    };
    const visited = new Uint8Array(w * h);
    const stack: number[] = [];
    const seed = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const p = y * w + x;
      if (visited[p] || !matches(p * 4)) return;
      visited[p] = 1;
      stack.push(p);
    };
    for (let x = 0; x < w; x++) {
      seed(x, 0);
      seed(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      seed(0, y);
      seed(w - 1, y);
    }
    let removed = 0;
    while (stack.length) {
      const p = stack.pop() as number;
      data[p * 4 + 3] = 0;
      removed++;
      const x = p % w;
      const y = (p - x) / w;
      seed(x + 1, y);
      seed(x - 1, y);
      seed(x, y + 1);
      seed(x, y - 1);
    }
    const ratio = removed / (w * h);
    // Nichts Sinnvolles entfernt ODER fast alles weg (Produkt ~ BG-Farbe).
    if (ratio < 0.02 || ratio > 0.95) return passthrough();

    // (d) Weiche Kante: Alpha leicht blurren gegen harte Treppen/Fransen.
    const cutRaw = Buffer.from(data);
    const rgb = await sharp(cutRaw, {
      raw: { width: w, height: h, channels: 4 },
    })
      .removeAlpha()
      .raw()
      .toBuffer();
    const alpha = await sharp(cutRaw, {
      raw: { width: w, height: h, channels: 4 },
    })
      .extractChannel(3)
      .blur(0.8)
      .raw()
      .toBuffer();
    const png = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
      .joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } })
      .png()
      .toBuffer();
    return { png, removed: true };
  } catch {
    return passthrough();
  }
}

// ---------------------------------------------------------------------------
// gradeProductToScene — gleicht den Look des freigestellten Produkts dezent an
// das Farbprofil der Szene an (gemeinsamer „Filter"/Weißabgleich), damit es
// nicht wie aus einem anderen Foto wirkt. Per-Kanal-Gain Richtung Szenen-
// Mittelwert, geclamped + nur teilweise angewendet (STRENGTH) — Produkt-
// Identität (Label, Markenfarben) bleibt klar erkennbar. Transparente Pixel
// werden nicht angefasst.
// ---------------------------------------------------------------------------
async function gradeProductToScene(
  cutoutPng: Buffer,
  sceneMean: [number, number, number],
): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(cutoutPng)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    if (info.channels !== 4) return cutoutPng;

    // Produkt-Mittelwerte NUR über opake Pixel (transparente nicht zählen).
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let n = 0;
    for (let p = 0; p < w * h; p++) {
      if (data[p * 4 + 3] < 16) continue;
      sr += data[p * 4];
      sg += data[p * 4 + 1];
      sb += data[p * 4 + 2];
      n++;
    }
    if (n === 0) return cutoutPng;
    const pr = sr / n;
    const pg = sg / n;
    const pb = sb / n;

    const STRENGTH = 0.55; // 0 = unverändert · 1 = exakter Szenen-Weißabgleich
    const gain = (s: number, p: number) => {
      if (p <= 1) return 1;
      let g = s / p;
      g = Math.max(0.7, Math.min(1.4, g)); // extreme Shifts vermeiden
      return 1 + (g - 1) * STRENGTH;
    };
    const gR = gain(sceneMean[0], pr);
    const gG = gain(sceneMean[1], pg);
    const gB = gain(sceneMean[2], pb);
    if (
      Math.abs(gR - 1) < 0.01 &&
      Math.abs(gG - 1) < 0.01 &&
      Math.abs(gB - 1) < 0.01
    ) {
      return cutoutPng; // praktisch nichts zu tun
    }

    const clamp = (x: number) => (x < 0 ? 0 : x > 255 ? 255 : Math.round(x));
    for (let p = 0; p < w * h; p++) {
      if (data[p * 4 + 3] < 16) continue;
      data[p * 4] = clamp(data[p * 4] * gR);
      data[p * 4 + 1] = clamp(data[p * 4 + 1] * gG);
      data[p * 4 + 2] = clamp(data[p * 4 + 2] * gB);
    }
    return await sharp(Buffer.from(data), {
      raw: { width: w, height: h, channels: 4 },
    })
      .png()
      .toBuffer();
  } catch {
    return cutoutPng;
  }
}

// ---------------------------------------------------------------------------
// buildGroundShadow — passender, flacher Bodenschatten aus der Alpha-Maske des
// Produkts: gestaucht auf Boden-Höhe und an der Basis platziert, sodass das
// Produkt „steht" statt zu schweben. Deckkraft ist an die Szenen-Luminanz
// gekoppelt (dunkle Szene → dezenter, helle Szene → sichtbarer). Liefert null,
// wenn es keine echte Freistellung gibt (sonst gäbe es einen Schatten-Kasten).
// ---------------------------------------------------------------------------
async function buildGroundShadow(
  cutoutPng: Buffer,
  w: number,
  h: number,
  sceneLum: number,
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(cutoutPng).metadata();
    if (!meta.hasAlpha) return null;
    const stats = await sharp(cutoutPng).stats();
    const alphaStat = stats.channels[3];
    if (!alphaStat || alphaStat.min > 250) return null; // voll-opak → kein Schatten

    // Deckkraft an Szenenhelligkeit koppeln (≈0.22 … 0.5).
    const opacity = Math.max(
      0.22,
      Math.min(0.5, 0.22 + (sceneLum / 255) * 0.32),
    );
    const sigma = Math.max(2, Math.round(h * 0.04));
    const shadowH = Math.max(6, Math.round(h * 0.16)); // flacher Bodenschatten

    // Alpha-Maske → vertikal gestaucht, weichgezeichnet, auf Deckkraft skaliert.
    const alphaMask = await sharp(cutoutPng)
      .extractChannel(3)
      .resize({ width: w, height: shadowH, fit: "fill" })
      .blur(sigma)
      .linear(opacity, 0)
      .raw()
      .toBuffer();

    const black = Buffer.alloc(w * shadowH * 3, 0);
    const buffer = await sharp(black, {
      raw: { width: w, height: shadowH, channels: 3 },
    })
      .joinChannel(alphaMask, {
        raw: { width: w, height: shadowH, channels: 1 },
      })
      .png()
      .toBuffer();

    return { buffer, width: w, height: shadowH };
  } catch {
    return null;
  }
}
