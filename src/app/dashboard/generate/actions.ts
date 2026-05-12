"use server";

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  TONES,
  adCopySchema,
  type GenerateState,
  type SaveState,
} from "./schema";

const inputSchema = z.object({
  product: z.string().trim().min(3, "Produkt muss mind. 3 Zeichen haben.").max(500),
  audience: z.string().trim().min(3, "Zielgruppe muss mind. 3 Zeichen haben.").max(300),
  tone: z.enum(TONES),
});

const SYSTEM_PROMPT = `Du bist ein erfahrener Performance-Marketing-Texter für deutschsprachige Werbung (Meta Ads, Google Ads, TikTok Ads).

Erzeuge auf Basis der Eingabe:
- headline: 1× starker Hook, max. 8 Wörter, ohne Satzpunkt am Ende.
- subline: 1× Ergänzung zur Headline, max. 12 Wörter, verstärkt das Versprechen.
- variants: GENAU 5 unterschiedliche Ad-Copy-Varianten. Jede mit eigenem body (2–3 Sätze, Nutzen statt Features, du-Anrede) und eigenem cta (3–5 Wörter, aktiv, ohne Punkt am Ende).

Die 5 Varianten sollen klar UNTERSCHIEDLICHE Hooks/Angles nutzen — z. B. emotional, rational, sozialer Beweis, Dringlichkeit/Knappheit, Vorher-Nachher / Transformation.

Antworte ausschließlich im vorgegebenen JSON-Schema. Keine Erklärungen, keine Markdown-Auszeichnungen.`;

export async function generateAdCopy(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const parsed = inputSchema.safeParse({
    product: formData.get("product"),
    audience: formData.get("audience"),
    tone: formData.get("tone"),
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
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Nicht eingeloggt." };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      error: "OPENAI_API_KEY ist nicht gesetzt (Server-Env-Var fehlt).",
    };
  }

  const { product, audience, tone } = parsed.data;
  const userPrompt = `Produkt / Service: ${product}
Zielgruppe: ${audience}
Ton: ${tone}`;

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: adCopySchema,
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.9,
    });

    return {
      ok: true,
      output: object,
      input: { product, audience, tone },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unbekannter Fehler bei der Generierung.";
    return { ok: false, error: message };
  }
}

const savePayloadSchema = z.object({
  product: z.string().min(1).max(500),
  audience: z.string().min(1).max(300),
  tone: z.enum(TONES),
  output: adCopySchema,
});

export async function saveCreative(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const rawOutput = formData.get("output");
  if (typeof rawOutput !== "string") {
    return { ok: false, error: "Kein Output zum Speichern." };
  }

  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(rawOutput);
  } catch {
    return { ok: false, error: "Output ist kein gültiges JSON." };
  }

  const parsed = savePayloadSchema.safeParse({
    product: formData.get("product"),
    audience: formData.get("audience"),
    tone: formData.get("tone"),
    output: parsedOutput,
  });
  if (!parsed.success) {
    return { ok: false, error: "Speicher-Daten sind unvollständig." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Nicht eingeloggt." };
  }

  const { product, audience, tone, output } = parsed.data;
  const promptText = `Produkt: ${product}\nZielgruppe: ${audience}\nTon: ${tone}`;

  const { data, error } = await supabase
    .from("creatives")
    .insert({
      user_id: user.id,
      prompt: promptText,
      output: JSON.stringify(output),
      status: "completed",
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: `DB-Fehler: ${error.message}` };
  }

  revalidatePath("/dashboard/library");
  return { ok: true, savedId: data.id };
}
