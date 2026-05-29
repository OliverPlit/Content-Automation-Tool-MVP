/**
 * Sanitized OpenAI client.
 *
 * Wenn der OPENAI_API_KEY in der .env mit typografischen Anführungs-
 * zeichen (' bzw. ", U+2018/U+2019/U+201C/U+201D) umrahmt ist oder
 * unsichtbare non-ASCII-Zeichen enthält (NBSP, Zero-Width-Space, …),
 * weigert sich `fetch()` den Wert als HTTP-Header zu senden:
 *   "Cannot convert argument to a ByteString because the character at
 *    index N has a value of 8216 …"
 *
 * Lösung in zwei Schichten:
 *  1) `process.env.OPENAI_API_KEY` wird **beim Modul-Load** überschrieben,
 *     damit auch Fallback-Pfade im AI-SDK den sauberen Key sehen.
 *  2) Der Provider wird zusätzlich mit explizitem `apiKey` erstellt.
 */
import { createOpenAI } from "@ai-sdk/openai";

function sanitizeApiKey(raw: string | undefined): string {
  if (!raw) return "";
  let v = raw.trim();
  // Außenliegende ASCII- oder typografische Quotes entfernen
  v = v.replace(/^["'‘’“”]+/, "");
  v = v.replace(/["'‘’“”]+$/, "");
  // Nur ASCII-Printable (Code 0x20–0x7E) zulassen
  v = v.replace(/[^\x20-\x7E]/g, "");
  return v.trim();
}

const rawKey = process.env.OPENAI_API_KEY;
const cleanKey = sanitizeApiKey(rawKey);

// Diagnose-Log: einmal pro Server-Start. Zeigt Länge + ob bereinigt wurde,
// nie den Key selbst.
if (rawKey && rawKey !== cleanKey) {
  console.warn(
    `[openai-client] OPENAI_API_KEY enthielt non-ASCII oder Quotes — bereinigt ` +
      `(roh: ${rawKey.length} chars, clean: ${cleanKey.length} chars).`,
  );
}

// Env überschreiben, damit Fallback-Pfade im AI-SDK ebenfalls den sauberen Key nutzen.
if (cleanKey) {
  process.env.OPENAI_API_KEY = cleanKey;
}

export const openaiKeyIsValid = cleanKey.length >= 20;

export const openai = createOpenAI({
  apiKey: cleanKey,
});
