/**
 * Persistiert den Form-State der Generate-Page in localStorage.
 *
 * Nach Reload sind alle Eingaben wieder da. Versionierter Key, sodass wir
 * bei künftigen Schema-Änderungen alte Sessions verwerfen können.
 *
 * Was NICHT gespeichert wird:
 *  - generierte Varianten (genState) — Server-Source-of-Truth, separat in DB
 *  - Lade-/Error-Zustände
 *  - Crawl-Zwischenstände
 */
import type {
  AddressingValue,
  ImageSource,
  PersonaValue,
  PlatformValue,
  ProductFacts,
} from "./schema";

export const GENERATE_SESSION_KEY = "content-tool:generate:session:v1";

export type GenerateSessionData = {
  productText?: string;
  audienceText?: string;
  toneValue?: string;
  machineValue?: string;
  persona?: PersonaValue | null;
  addressing?: AddressingValue;
  platform?: PlatformValue;
  imageVariantCount?: number;
  urgency?: boolean;
  productFacts?: ProductFacts | null;
  imageSource?: ImageSource;
  customImageUrl?: string;
  websiteText?: string;
  /** UUID des Ziel-Projekts. Leerer String = „kein Projekt". */
  projectId?: string;
  /** UUID des Ziel-Folders im Projekt. Leerer String = „kein Folder". */
  folderId?: string;
};

export function loadSession(): GenerateSessionData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GENERATE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as GenerateSessionData;
    }
    return null;
  } catch {
    // Korrupte JSON / Storage-Sperre → einfach ignorieren
    return null;
  }
}

export function saveSession(data: GenerateSessionData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GENERATE_SESSION_KEY, JSON.stringify(data));
  } catch {
    // Quota-exceeded, Privacy-Mode etc. — silently ignore.
    // Nutzer verliert beim Reload State, das ist OK als Fallback.
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GENERATE_SESSION_KEY);
  } catch {
    // ignore
  }
}
