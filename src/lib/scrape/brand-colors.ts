/**
 * Brand-Color-Extraktion aus einem Logo-Bild.
 *
 * Workflow:
 *   1. Logo-URL fetchen (max 2 MB, 5s timeout).
 *   2. Via sharp auf 64x64 raw RGBA herunterskalieren.
 *   3. Pixel-Histogramm mit 5-Bit-Quantisierung pro Kanal (=> 32³ Buckets).
 *   4. Transparente / fast-weiße / fast-schwarze / graue Pixel überspringen.
 *   5. Top-Buckets nach Häufigkeit sortieren.
 *   6. Daraus { primary, accent, background, text } ableiten.
 *
 * Keine externen Color-Libs — `sharp` reicht. Funktioniert nur server-side.
 */
import sharp from "sharp";

export type BrandColors = {
  primary: string;
  accent: string;
  background: string;
  text: string;
};

type Bucket = { r: number; g: number; b: number; count: number };

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const SAMPLE_SIZE = 64; // resize-Ziel — 4096 Pixel reichen für ein Logo
const QUANT_BITS = 5; // 32 levels per Kanal

function quantize(v: number): number {
  return v >> (8 - QUANT_BITS);
}

function dequantize(v: number): number {
  return (v << (8 - QUANT_BITS)) | (1 << (7 - QUANT_BITS));
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function colorDistance(a: Bucket, b: Bucket): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function luminance(r: number, g: number, b: number): number {
  // ITU-R BT.709
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

/**
 * Lädt das Logo, quantisiert, sortiert Top-Farben, leitet 4 Brand-Slots ab.
 * Liefert null wenn das Bild nicht decodierbar ist oder kein dominierender
 * Farbcluster gefunden wurde (z. B. transparenter / monochromer Banner).
 */
export async function extractBrandColors(
  logoUrl: string,
): Promise<BrandColors | null> {
  let buf: Buffer;
  try {
    const res = await fetch(logoUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ContentToolBot/1.0; +https://content-tool.local)",
        Accept: "image/*",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    if (arr.byteLength === 0 || arr.byteLength > MAX_LOGO_BYTES) return null;
    buf = Buffer.from(arr);
  } catch {
    return null;
  }

  let raw: { data: Buffer; info: { width: number; height: number; channels: number } };
  try {
    raw = await sharp(buf)
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "inside", withoutEnlargement: false })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    return null;
  }

  const { data, info } = raw;
  const channels = info.channels; // 4 — wir haben ensureAlpha forciert
  const buckets = new Map<number, Bucket>();

  // Hintergrund-Hellfläche zählen wir SEPARAT, damit wir den Background-Slot
  // davon ableiten können (Logos haben oft weiße Flächen, die wir nicht als
  // "Akzent" zählen wollen — aber als "background" liefern können).
  let lightCount = 0;
  let lightR = 0;
  let lightG = 0;
  let lightB = 0;
  // Dunkel-Pixel (Text/Outlines) ebenfalls separat — für den text-Slot.
  let darkCount = 0;
  let darkR = 0;
  let darkG = 0;
  let darkB = 0;

  for (let i = 0; i < data.length; i += channels) {
    const a = channels === 4 ? data[i + 3] : 255;
    if (a < 32) continue; // transparente Pixel ignorieren
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = luminance(r, g, b);
    const sat = saturation(r, g, b);

    // Sehr hell + niedrige Sättigung = Logo-Background-Fläche
    if (lum > 230 && sat < 0.1) {
      lightCount += 1;
      lightR += r;
      lightG += g;
      lightB += b;
      continue;
    }
    // Sehr dunkel + niedrige Sättigung = Outline/Text
    if (lum < 40 && sat < 0.15) {
      darkCount += 1;
      darkR += r;
      darkG += g;
      darkB += b;
      continue;
    }
    // Grau-Zonen ohne Charakter überspringen (sonst Brand = dirty gray)
    if (sat < 0.15 && lum > 60 && lum < 220) continue;

    const qr = quantize(r);
    const qg = quantize(g);
    const qb = quantize(b);
    const key = (qr << (QUANT_BITS * 2)) | (qg << QUANT_BITS) | qb;
    const cur = buckets.get(key);
    if (cur) {
      cur.count += 1;
      cur.r += r;
      cur.g += g;
      cur.b += b;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  if (buckets.size === 0 && lightCount === 0 && darkCount === 0) return null;

  // Buckets nach Häufigkeit sortieren und mitteln (statt nur quantisiertes Center)
  const sorted: Bucket[] = Array.from(buckets.values())
    .map((b) => ({
      r: Math.round(b.r / b.count),
      g: Math.round(b.g / b.count),
      b: Math.round(b.b / b.count),
      count: b.count,
    }))
    .sort((a, b) => b.count - a.count);

  // Primary = häufigste markante Farbe.
  // Wenn kein markanter Bucket existiert: Fallback aus quantize-Center
  // des hellsten / dunkelsten Pixels — sonst nehmen wir Schwarz/Weiß.
  const primaryBucket: Bucket | null =
    sorted[0] ??
    (lightCount > 0
      ? {
          r: Math.round(lightR / lightCount),
          g: Math.round(lightG / lightCount),
          b: Math.round(lightB / lightCount),
          count: lightCount,
        }
      : darkCount > 0
        ? {
            r: Math.round(darkR / darkCount),
            g: Math.round(darkG / darkCount),
            b: Math.round(darkB / darkCount),
            count: darkCount,
          }
        : null);
  if (!primaryBucket) return null;

  // Accent = zweite Top-Farbe, aber nur wenn sie sich genug vom Primary
  // unterscheidet. Sonst nehmen wir die nächst-fernste aus den Top-6.
  const accentBucket: Bucket =
    sorted.find((b, idx) => idx > 0 && colorDistance(b, primaryBucket) > 60) ??
    sorted[1] ??
    primaryBucket;

  const background: string =
    lightCount > 50
      ? rgbToHex(
          Math.round(lightR / lightCount),
          Math.round(lightG / lightCount),
          Math.round(lightB / lightCount),
        )
      : "#FFFFFF";

  const text: string =
    darkCount > 50
      ? rgbToHex(
          Math.round(darkR / darkCount),
          Math.round(darkG / darkCount),
          Math.round(darkB / darkCount),
        )
      : "#111111";

  void dequantize; // kept for debug — quantisiertes Center wenn man Buckets ohne Mittel nimmt

  return {
    primary: rgbToHex(primaryBucket.r, primaryBucket.g, primaryBucket.b),
    accent: rgbToHex(accentBucket.r, accentBucket.g, accentBucket.b),
    background,
    text,
  };
}

/**
 * Validiert einen externen Hex-Farbcode (z. B. aus User-Input oder Scrape-CSS).
 * Liefert normalisierten Wert "#RRGGBB" oder null.
 */
export function normalizeHex(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/.test(v)) return v.toUpperCase();
  return null;
}
