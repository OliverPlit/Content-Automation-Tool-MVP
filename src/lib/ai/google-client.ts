/**
 * Sanitized Google Generative AI client.
 *
 * Gleiche Problematik wie bei OpenAI: wenn der GOOGLE_GENERATIVE_AI_API_KEY
 * non-ASCII-Zeichen enthält (typografische Quotes, NBSP, Zero-Width-Spaces
 * o. Ä.), schmeißt `fetch()` beim Setzen des `x-goog-api-key`-Headers
 * "Cannot convert argument to a ByteString …".
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";

function sanitizeApiKey(raw: string | undefined): string {
  if (!raw) return "";
  let v = raw.trim();
  v = v.replace(/^["'‘’“”]+/, "");
  v = v.replace(/["'‘’“”]+$/, "");
  v = v.replace(/[^\x20-\x7E]/g, "");
  return v.trim();
}

const rawKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const cleanKey = sanitizeApiKey(rawKey);

if (rawKey && rawKey !== cleanKey) {
  console.warn(
    `[google-client] GOOGLE_GENERATIVE_AI_API_KEY enthielt non-ASCII oder Quotes ` +
      `— bereinigt (roh: ${rawKey.length} chars, clean: ${cleanKey.length} chars).`,
  );
}

if (cleanKey) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = cleanKey;
}

export const googleKeyIsValid = cleanKey.length >= 20;

export const google = createGoogleGenerativeAI({
  apiKey: cleanKey,
});
