"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Icon } from "@/components/icon";
import {
  generateAdCopy,
  rateVariant,
  saveAllVariants,
  saveCreative,
  type BundleSaveState,
  type RatingState,
} from "./actions";
import { saveGenerateTemplate } from "../templates/actions";
import { MetaImportZone } from "./meta-import-zone";
import { ScoreBadge } from "./score-badge";
import {
  clearSession,
  loadSession,
  saveSession,
} from "./session-persist";
import {
  ADDRESSINGS,
  ANGLES,
  AWARENESS,
  FRAMES,
  FRAMEWORKS,
  HOOKS,
  IMAGE_STYLES,
  PERSONAS,
  PERSUASION_LEVERS,
  PLATFORMS,
  hasProductFacts,
  type AddressingValue,
  type AngleValue,
  type AwarenessValue,
  type FrameValue,
  type FrameworkValue,
  type GeneratedVariant,
  type GenerateInput,
  type GenerateState,
  type HookValue,
  type ImageSource,
  type ImageStyleValue,
  type MachineValue,
  type PersonaValue,
  type PersuasionLeverValue,
  type PlatformValue,
  type ProductFacts,
  type PromptTemplateData,
  type SaveState,
} from "./schema";

const TONES = [
  { value: "professionell", label: "Professionell", hint: "Sachlich, kompetent" },
  { value: "locker", label: "Locker", hint: "Casual, freundlich" },
  { value: "verspielt", label: "Verspielt", hint: "Mit Humor & Emoji" },
  { value: "premium", label: "Premium", hint: "Elegant, hochwertig" },
  { value: "direkt", label: "Direkt", hint: "Klare Botschaft, Push" },
] as const;

const initialGenerate: GenerateState = { ok: false };
const initialSave: SaveState = { ok: false };
const initialRating: RatingState = { ok: false };

export default function GeneratePage() {
  const [genState, generateAction, generating] = useActionState(
    generateAdCopy,
    initialGenerate,
  );

  // Crawler-State
  const [websiteText, setWebsiteText] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);

  // Form-State — alles was vom Crawl auto-gefüllt wird
  const [productText, setProductText] = useState("");
  const [audienceText, setAudienceText] = useState("");
  const [toneValue, setToneValue] = useState<(typeof TONES)[number]["value"] | undefined>(undefined);
  // Maschinen-Kontext unsichtbar gehalten — wird per Crawl-LLM-Inference gesetzt
  // und steuert die Bild-Szene (sceneHint in schema.ts). Default fallback: industrie
  // (neutralste Szene mit Pipes/Hydraulik, weniger spezifisch als „Traktor")
  const [machineValue, setMachineValue] = useState<MachineValue>("industrie");

  // Persona + Anrede (Doc Kap. 2 + 7.4)
  const [persona, setPersona] = useState<PersonaValue | null>(null);
  const [addressing, setAddressing] = useState<AddressingValue>("du");
  // Re-Mount-Key für die Erweitert-Felder, damit ein Persona-Klick deren
  // initialValue neu liest (Awareness, HookHint).
  const [personaApplyN, setPersonaApplyN] = useState(0);

  // Phase B — Plattform, Bild-Varianten, Urgency, ProductFacts
  const [platform, setPlatform] = useState<PlatformValue>("universal");
  const [imageVariantCount, setImageVariantCount] = useState<number>(1);
  const [urgency, setUrgency] = useState<boolean>(false);
  const [productFacts, setProductFacts] = useState<ProductFacts | null>(null);

  // RF-Brand — Logo + 4 extrahierte Farben aus dem Crawl der Firmenseite.
  // Werden beim Save in den Folder-Brand übernommen, damit Renders die
  // Firmen-Farbgebung tragen.
  type BrandColorsState = {
    primary: string;
    accent: string;
    background: string;
    text: string;
  };
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [brandColors, setBrandColors] = useState<BrandColorsState | null>(null);

  // Bild-Quelle
  const [imageSource, setImageSource] = useState<ImageSource>("ai");
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [imageSourceError, setImageSourceError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  // Einweb-Modus für Produktbilder: realism (Default, fotorealistisch) | exact
  const [embedMode, setEmbedMode] = useState<"realism" | "exact">("realism");
  // Anzahl Varianten (auf Page-Ebene gespiegelt, damit die optionale
  // „Angle pro Variante"-Auswahl die richtige Anzahl Zeilen zeigen kann).
  const [variantCount, setVariantCount] = useState<number>(3);
  // Wizard-Schritt (Akkordeon): 1 = Inhalt · 2 = Format · 3 = Feinschliff.
  // 0 = alle zu. Immer nur einer offen.
  const [step, setStep] = useState<number>(1);
  const toggleStep = (k: number) => setStep((s) => (s === k ? 0 : k));

  // Projekt-Zuordnung (N2). Leerer String = kein Projekt.
  const [projectId, setProjectId] = useState<string>("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  // Folder-Zuordnung (F4) im aktuell gewählten Projekt.
  const [folderId, setFolderId] = useState<string>("");
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);

  // ---- localStorage-Persist (L1+L2) ----------------------------------
  // hydrated = true erst NACH dem ersten Load-Effect; erst dann startet
  // der Auto-Save, sonst überschreiben wir die Storage mit initial-defaults.
  const [hydrated, setHydrated] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);

  useEffect(() => {
    // Beim Mount: gespeicherte Session aus localStorage in State spiegeln.
    // React-19-Lint ist hier zu streng — wir spiegeln externen Storage in
    // State, das ist genau der erlaubte Use-Case (siehe templateLoader unten).
    /* eslint-disable react-hooks/set-state-in-effect */
    const data = loadSession();
    if (data) {
      if (typeof data.productText === "string") setProductText(data.productText);
      if (typeof data.audienceText === "string") setAudienceText(data.audienceText);
      if (typeof data.toneValue === "string")
        setToneValue(data.toneValue as (typeof TONES)[number]["value"]);
      if (typeof data.machineValue === "string")
        setMachineValue(data.machineValue as MachineValue);
      if (data.persona !== undefined) setPersona(data.persona);
      if (data.addressing) setAddressing(data.addressing);
      if (data.platform) setPlatform(data.platform);
      if (typeof data.imageVariantCount === "number")
        setImageVariantCount(data.imageVariantCount);
      if (typeof data.urgency === "boolean") setUrgency(data.urgency);
      if (data.productFacts !== undefined) setProductFacts(data.productFacts);
      if (data.imageSource) setImageSource(data.imageSource);
      if (typeof data.customImageUrl === "string")
        setCustomImageUrl(data.customImageUrl);
      if (typeof data.websiteText === "string") setWebsiteText(data.websiteText);
      if (typeof data.projectId === "string") setProjectId(data.projectId);
      if (typeof data.folderId === "string") setFolderId(data.folderId);
      if (typeof data.logoUrl === "string") setLogoUrl(data.logoUrl);
      if (data.brandColors !== undefined) setBrandColors(data.brandColors);
      setSessionRestored(true);
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Lade Folder des aktuell gewählten Projekts (F4). Reset bei Projektwechsel.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!projectId) {
      setFolders([]);
      setFolderId("");
      return;
    }
    fetch(`/api/projects/${projectId}/folders`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { folders?: { id: string; name: string }[] }) => {
        if (Array.isArray(j.folders)) setFolders(j.folders);
      })
      .catch(() => {
        setFolders([]);
      });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [projectId]);

  // Lade User-Projekte einmal beim Mount (für ProjectPicker)
  useEffect(() => {
    fetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { projects?: { id: string; name: string }[] }) => {
        if (Array.isArray(j.projects)) setProjects(j.projects);
      })
      .catch(() => {
        // silent fail — UI zeigt einfach "kein Projekt"-Default
      });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveSession({
      productText,
      audienceText,
      toneValue,
      machineValue,
      persona,
      addressing,
      platform,
      imageVariantCount,
      urgency,
      productFacts,
      imageSource,
      customImageUrl,
      websiteText,
      projectId,
      folderId,
      logoUrl,
      brandColors,
    });
  }, [
    hydrated,
    productText,
    audienceText,
    toneValue,
    machineValue,
    persona,
    addressing,
    platform,
    imageVariantCount,
    urgency,
    productFacts,
    imageSource,
    customImageUrl,
    websiteText,
    projectId,
    folderId,
    logoUrl,
    brandColors,
  ]);

  const handleResetSession = () => {
    if (
      !window.confirm(
        "Alle Eingaben dieses Formulars zurücksetzen? Die Daten gehen verloren.",
      )
    )
      return;
    clearSession();
    setProductText("");
    setAudienceText("");
    setToneValue(undefined);
    setMachineValue("industrie");
    setPersona(null);
    setAddressing("du");
    setPlatform("universal");
    setImageVariantCount(1);
    setUrgency(false);
    setProductFacts(null);
    setImageSource("ai");
    setCustomImageUrl("");
    setWebsiteText("");
    setProjectId("");
    setFolderId("");
    setLogoUrl("");
    setBrandColors(null);
    setSessionRestored(false);
  };

  // Template-Loader (?template=<id>)
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");

  // Ref auf das Haupt-Form, damit „Als Vorlage speichern" den AKTUELLEN
  // Form-Zustand (inkl. unkontrollierter Selects) per FormData auslesen kann.
  const formRef = useRef<HTMLFormElement>(null);
  // Liste der eigenen Vorlagen für den Vorlagen-Picker oben im Form.
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [savingTpl, startSaveTpl] = useTransition();
  const [tplMsg, setTplMsg] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  // Vorlagen einmal beim Mount laden (für den Picker).
  useEffect(() => {
    fetch("/api/templates", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { templates?: { id: string; name: string }[] }) => {
        if (Array.isArray(j.templates)) setTemplates(j.templates);
      })
      .catch(() => {
        // silent fail — Picker bleibt einfach leer
      });
  }, []);

  // „Als Vorlage speichern" — liest den aktuellen Form-Zustand via Ref,
  // baut die PromptTemplateData und ruft die Server-Action DIREKT auf (kein
  // Form-Submit → der Generate-Lauf wird NICHT ausgelöst).
  const handleSaveTemplate = () => {
    const form = formRef.current;
    if (!form) return;
    const defaultName =
      (productFacts?.name || productText || "").slice(0, 40).trim() ||
      "Meine Vorlage";
    const name = window.prompt("Name für die Vorlage:", defaultName);
    if (name === null) return; // Abbrechen
    if (name.trim().length < 2) {
      setTplMsg({ kind: "err", text: "Name muss mind. 2 Zeichen haben." });
      return;
    }

    const fd = new FormData(form);
    const td: Record<string, unknown> = {};
    const pick = (key: string) => {
      const v = fd.get(key);
      if (v != null && v !== "") td[key] = v;
    };
    [
      "product",
      "audience",
      "tone",
      "machine",
      "angle",
      "variantCount",
      "imageStyle",
      "awareness",
      "framework",
      "hookHint",
      "frame",
      "persona",
      "addressing",
      "platform",
      "imageVariantCount",
    ].forEach(pick);
    const levers = fd.getAll("persuasionLevers").filter((v) => v && v !== "");
    if (levers.length) td.persuasionLevers = levers;
    if (fd.get("urgency")) td.urgency = true;

    const payload = new FormData();
    payload.set("name", name.trim());
    payload.set("templateData", JSON.stringify(td));

    startSaveTpl(async () => {
      const res = await saveGenerateTemplate(payload);
      if (res.ok) {
        setTplMsg({ kind: "ok", text: `Vorlage „${res.name}“ gespeichert.` });
        // Picker-Liste aktualisieren, damit die neue Vorlage sofort auftaucht
        try {
          const r = await fetch("/api/templates", { cache: "no-store" });
          const j = (await r.json()) as {
            templates?: { id: string; name: string }[];
          };
          if (Array.isArray(j.templates)) setTemplates(j.templates);
        } catch {
          // egal — Speichern war erfolgreich
        }
      } else {
        setTplMsg({ kind: "err", text: res.error ?? "Speichern fehlgeschlagen." });
      }
    });
  };
  const [loadedTemplate, setLoadedTemplate] = useState<{
    id: string;
    name: string;
    data: PromptTemplateData;
  } | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  useEffect(() => {
    if (!templateId) return;
    // Diese Effekt-State-Updates sind legitime "Daten aus Fetch in lokalen
    // State spiegeln"-Aufrufe — die React-19-Lint-Regel ist hier zu streng.
    /* eslint-disable react-hooks/set-state-in-effect */
    setTemplateLoading(true);
    setTemplateError(null);
    fetch(`/api/templates/${templateId}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as {
          id?: string;
          name?: string;
          data?: PromptTemplateData;
          error?: string;
        };
        if (!res.ok || !json.id || !json.name) {
          setTemplateError(json.error ?? `Fehler ${res.status}`);
          setLoadedTemplate(null);
        } else {
          setLoadedTemplate({
            id: json.id,
            name: json.name,
            data: json.data ?? {},
          });
        }
      })
      .catch((err) => {
        setTemplateError(err instanceof Error ? err.message : "Netzwerk-Fehler.");
      })
      .finally(() => setTemplateLoading(false));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [templateId]);

  // Wenn ein Template geladen ist, übernehmen wir auch den ImageStyle.
  const formKey = loadedTemplate?.id ?? "default";
  const tplData = loadedTemplate?.data;

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
            Erstellen
          </h1>
          <div className="flex items-center gap-3 text-[12px] text-[var(--color-muted)]">
            <a
              href="/dashboard/generate/bulk"
              className="hover:text-[var(--foreground)] hover:underline"
            >
              Mehrere Produkte? Bulk-Modus
            </a>
            <span aria-hidden>·</span>
            <a
              href="/dashboard/images/new"
              className="hover:text-[var(--foreground)] hover:underline"
            >
              Nur Bild, kein Text
            </a>
            {hydrated && (
              <>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={handleResetSession}
                  className="hover:text-[var(--foreground)] hover:underline"
                  title="Form-Eingaben zurücksetzen"
                >
                  Reset
                </button>
              </>
            )}
          </div>
        </div>
        <p className="mt-1 text-[13px] text-[var(--color-muted)]">
          Inputs links, Ergebnis-Grid rechts. Jede Variante wird parallel
          generiert.
          {sessionRestored && hydrated && (
            <span className="ml-2 text-[var(--foreground)]">
              · Vorherige Eingaben wiederhergestellt
            </span>
          )}
        </p>
      </header>

      {loadedTemplate && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-[13px]">
          <p className="text-[var(--foreground)]">
            Vorlage <strong>{loadedTemplate.name}</strong> geladen — Form ist
            vorausgefüllt. Du kannst alles noch anpassen vor dem Generieren.
          </p>
          <a
            href="/dashboard/generate"
            className="text-xs font-medium text-slate-700 hover:text-slate-900 hover:underline"
          >
            Ohne Vorlage starten
          </a>
        </div>
      )}
      {templateLoading && (
        <div className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          ⏳ Lade Vorlage…
        </div>
      )}
      {templateError && (
        <div className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Vorlage konnte nicht geladen werden: {templateError}
        </div>
      )}

      {/* Phase 2 — Meta-CSV-Import (wirkt auf jeden Generate-Run via Server-Action) */}
      <div className="mb-4">
        <MetaImportZone />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[420px_1fr]">
        {/* --------- Left column: sticky form --------- */}
        <aside className="md:sticky md:top-6 md:self-start">
          <form
            key={formKey}
            ref={formRef}
            action={generateAction}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-slate-900/5"
          >
            <TemplateBar
              templates={templates}
              currentId={templateId}
              onPick={(id) =>
                router.push(
                  id
                    ? `/dashboard/generate?template=${id}`
                    : "/dashboard/generate",
                )
              }
              onSave={handleSaveTemplate}
              saving={savingTpl}
              message={tplMsg}
              onDismiss={() => setTplMsg(null)}
            />

            <WizardStep
              n={1}
              title="Inhalt"
              open={step === 1}
              onToggle={() => toggleStep(1)}
              summary={(
                productFacts?.name ||
                productText ||
                "Produkt, Persona, Zielgruppe…"
              ).slice(0, 34)}
            >
            <Field label="Produkt / Service" error={genState.fieldErrors?.product}>
              {/* A3 — eine Quelle der Wahrheit. Wenn Produktfakten existieren,
                  ist facts.name die Quelle und das Textarea syncs bidirektional. */}
              <CharCountTextarea
                name="product"
                rows={3}
                maxLength={500}
                value={
                  productFacts?.name?.length
                    ? productFacts.name
                    : productText || tplData?.product || ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setProductText(v);
                  if (productFacts) {
                    setProductFacts({ ...productFacts, name: v });
                  }
                }}
                placeholder="z.B. WODOIL Hydrauliköl HLP 46, 200-Liter-Fass"
              />
              {productFacts?.name?.length ? (
                <p className="mt-1 text-[10px] text-slate-700/80">
                  ✓ Synchronisiert mit Produktfakten unten
                </p>
              ) : null}
            </Field>

            <WebsiteUrlField
              websiteText={websiteText}
              setWebsiteText={setWebsiteText}
              crawling={crawling}
              setCrawling={setCrawling}
              error={crawlError}
              setError={setCrawlError}
              setProductText={setProductText}
              setAudienceText={setAudienceText}
              setImageSource={setImageSource}
              setCustomImageUrl={setCustomImageUrl}
              setMachineValue={setMachineValue}
              setToneValue={setToneValue}
              setProductFacts={setProductFacts}
              setLogoUrl={setLogoUrl}
              setBrandColors={setBrandColors}
              logoUrl={logoUrl}
              brandColors={brandColors}
            />
            <input type="hidden" name="websiteText" value={websiteText} />
            <input type="hidden" name="logoUrl" value={logoUrl} />
            <input
              type="hidden"
              name="brandColors"
              value={brandColors ? JSON.stringify(brandColors) : ""}
            />

            <ProductFactsCard facts={productFacts} onChange={setProductFacts} />
            <input
              type="hidden"
              name="productFacts"
              value={
                productFacts && hasProductFacts(productFacts)
                  ? JSON.stringify(productFacts)
                  : ""
              }
            />

            <PersonaPicker
              value={persona}
              onPick={(p) => {
                setPersona(p.value);
                setAddressing(p.addressing);
                setMachineValue(p.machine);
                if (p.value !== "custom") {
                  setAudienceText(p.audience);
                  setToneValue(p.tone);
                }
                setPersonaApplyN((n) => n + 1);
              }}
            />
            <input type="hidden" name="persona" value={persona ?? ""} />
            <input type="hidden" name="addressing" value={addressing} />

            <Field label="Zielgruppe" error={genState.fieldErrors?.audience}>
              <CharCountInput
                name="audience"
                type="text"
                maxLength={300}
                value={audienceText || tplData?.audience || ""}
                onChange={(e) => {
                  setAudienceText(e.target.value);
                  setPersona("custom");
                }}
                placeholder="Wähle oben eine Persona oder schreib selbst"
              />
            </Field>

            {/* Maschinen-Kontext + Werbe-Angle aus UI entfernt — werden via hidden
                input gesetzt. Machine kommt aus LLM-Inference beim Crawl, sonst
                Fallback "industrie". Angle Default "direkt". */}
            <input type="hidden" name="machine" value={machineValue} />
            <input type="hidden" name="angle" value="direkt" />
            </WizardStep>

            <WizardStep
              n={2}
              title="Format & Varianten"
              open={step === 2}
              onToggle={() => toggleStep(2)}
              summary={`${
                PLATFORMS.find((p) => p.value === platform)?.label ?? "Plattform"
              } · ${variantCount}×`}
            >
            <PlatformPicker value={platform} onChange={setPlatform} />
            <input type="hidden" name="platform" value={platform} />

            {/* Kompakte Selects 2-spaltig → weniger Scrollen */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ProjectPicker
                value={projectId}
                onChange={(v) => {
                  setProjectId(v);
                  if (v !== projectId) setFolderId("");
                }}
                projects={projects}
              />
              {projectId && (
                <FolderPicker
                  value={folderId}
                  onChange={setFolderId}
                  folders={folders}
                  projectId={projectId}
                />
              )}
              <ImageStyleField
                initialValue={tplData?.imageStyle as ImageStyleValue | undefined}
              />
              <ImageVariantCountField
                value={imageVariantCount}
                onChange={setImageVariantCount}
              />
            </div>
            {/* Hidden inputs außerhalb des Grids (keine Layout-Zellen) */}
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="folderId" value={folderId} />
            <input
              type="hidden"
              name="imageVariantCount"
              value={imageVariantCount}
            />

            <VariantCountField
              error={genState.fieldErrors?.variantCount}
              initialValue={tplData?.variantCount}
              onChange={setVariantCount}
            />

            <PerVariantAngles count={variantCount} />
            </WizardStep>

            <WizardStep
              n={3}
              title="Feinschliff"
              open={step === 3}
              onToggle={() => toggleStep(3)}
              summary="Erweitert · Bild-Quelle · optional"
            >
            <details className="rounded-lg border border-[var(--color-line)] bg-white open:bg-white">
              <summary className="cursor-pointer select-none rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]">
                Erweiterte Einstellungen
                <span className="ml-2 text-[11px] font-normal text-[var(--color-muted)]">
                  (auto aus Persona — nur ändern wenn nötig)
                </span>
              </summary>
              <div className="space-y-4 border-t border-slate-200 p-4">
                {/* A2 — Persona-Defaults als Chips. Edit-Field nur sichtbar
                    nach „ändern"-Klick, bleibt aber immer im DOM (Form-Daten). */}
                <PersonaOverride
                  key={`po-addr-${personaApplyN}`}
                  label="Anrede"
                  chipText={addressing === "du" ? "Du" : "Sie"}
                  fromPersona={Boolean(persona && persona !== "custom")}
                >
                  <AddressingField value={addressing} onChange={setAddressing} />
                </PersonaOverride>

                <UrgencyToggle value={urgency} onChange={setUrgency} />
                <input
                  type="hidden"
                  name="urgency"
                  value={urgency ? "on" : ""}
                />

                <PersonaOverride
                  key={`po-tone-${personaApplyN}`}
                  label="Ton"
                  chipText={
                    TONES.find((t) => t.value === toneValue)?.label ??
                    "Professionell"
                  }
                  fromPersona={Boolean(persona && persona !== "custom")}
                >
                  <ToneField
                    initialValue={tplData?.tone}
                    value={toneValue}
                    onChange={setToneValue}
                  />
                </PersonaOverride>

                <PersonaOverride
                  key={`po-aw-${personaApplyN}`}
                  label="Awareness-Level"
                  chipText={(() => {
                    const personaMeta = persona
                      ? PERSONAS.find((p) => p.value === persona)
                      : undefined;
                    const aw = personaMeta?.awareness ?? 3;
                    const meta = AWARENESS.find((a) => a.value === aw);
                    return meta
                      ? `Stufe ${meta.value} — ${meta.label}`
                      : "Stufe 3";
                  })()}
                  fromPersona={Boolean(persona && persona !== "custom")}
                >
                  <AwarenessField
                    key={`aw-${personaApplyN}`}
                    initialValue={
                      persona
                        ? PERSONAS.find((p) => p.value === persona)?.awareness
                        : (tplData?.awareness as AwarenessValue | undefined)
                    }
                  />
                </PersonaOverride>

                <FrameworkField
                  initialValue={tplData?.framework as FrameworkValue | undefined}
                />
                <PersuasionLeversField
                  initialValue={
                    (tplData?.persuasionLevers as PersuasionLeverValue[] | undefined) ?? []
                  }
                />

                <PersonaOverride
                  key={`po-hh-${personaApplyN}`}
                  label="Hook-Pattern"
                  chipText={(() => {
                    const personaMeta =
                      persona && persona !== "custom"
                        ? PERSONAS.find((p) => p.value === persona)
                        : undefined;
                    const hookVal = personaMeta?.topHooks[0];
                    if (!hookVal) return "Auto-Rotation";
                    return (
                      HOOKS.find((h) => h.value === hookVal)?.label ??
                      "Auto-Rotation"
                    );
                  })()}
                  fromPersona={Boolean(persona && persona !== "custom")}
                >
                  <HookHintField
                    key={`hh-${personaApplyN}`}
                    initialValue={
                      persona && persona !== "custom"
                        ? (PERSONAS.find((p) => p.value === persona)?.topHooks[0] as
                            | HookValue
                            | undefined)
                        : (tplData?.hookHint as HookValue | undefined)
                    }
                  />
                </PersonaOverride>

                <FrameField
                  initialValue={tplData?.frame as FrameValue | undefined}
                />
              </div>
            </details>

            <ImageSourceField
              source={imageSource}
              setSource={setImageSource}
              customImageUrl={customImageUrl}
              setCustomImageUrl={setCustomImageUrl}
              uploading={uploadingImage}
              setUploading={setUploadingImage}
              error={imageSourceError}
              setError={setImageSourceError}
            />
            <input type="hidden" name="imageSource" value={imageSource} />
            <input
              type="hidden"
              name="customImageUrl"
              value={imageSource === "ai" ? "" : customImageUrl}
            />
            <input type="hidden" name="embedMode" value={embedMode} />

            {imageSource !== "ai" && (
              <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                <label className="block text-xs font-medium text-slate-700">
                  Produkt einweben — Modus
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {(
                    [
                      {
                        v: "realism",
                        t: "Realismus",
                        h: "Das Modell platziert das Produkt fotorealistisch in die Szene (Tiefenschärfe, Licht, Schatten gematcht). Label kann minimal abweichen.",
                      },
                      {
                        v: "exact",
                        t: "Label exakt",
                        h: "Produkt pixelgenau einkopiert + Relight. Label garantiert identisch, wirkt aber ggf. etwas flacher.",
                      },
                    ] as const
                  ).map((o) => {
                    const on = embedMode === o.v;
                    return (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setEmbedMode(o.v)}
                        title={o.h}
                        className={
                          "rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition " +
                          (on
                            ? "bg-slate-800 text-white ring-slate-800"
                            : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")
                        }
                      >
                        {o.t}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  {embedMode === "realism"
                    ? "Fotorealistisch eingewoben — wie ein echtes Foto (empfohlen)."
                    : "Label garantiert pixelgenau — dafür weniger „im Bild“."}
                </p>
              </div>
            )}
            </WizardStep>

            {genState.error && (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {genState.error}
              </p>
            )}

            <div className="sticky bottom-0 z-10 -mx-5 -mb-5 space-y-1 rounded-b-2xl border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur-sm">
            <button
              type="submit"
              disabled={generating || uploadingImage}
              className="w-full rounded-lg bg-gradient-to-br from-slate-800 to-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-900/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {generating
                ? "Generiere Copy + KI-Szenen parallel…"
                : genState.ok
                  ? "Erneut generieren"
                  : "Generieren"}
            </button>
            <p className="text-center text-[10px] text-slate-400">
              Pro Variante: ~0,01 € Text + ~4 ¢ KI-Szene
              {imageSource !== "ai"
                ? embedMode === "realism"
                  ? " · Produkt fotorealistisch eingewoben"
                  : " · Produkt pixelgenau (Composite + Relight)"
                : ""}
            </p>
            </div>
          </form>
        </aside>

        {/* --------- Right column: variant cards grid --------- */}
        <main>
          {!genState.ok || !genState.variants || genState.variants.length === 0 ? (
            <EmptyState pending={generating} />
          ) : (
            <ResultsGrid variants={genState.variants} input={genState.input!} />
          )}
        </main>
      </div>
    </div>
  );
}

// ===========================================================================
// Results Grid
// ===========================================================================
function ResultsGrid({
  variants,
  input,
}: {
  variants: GeneratedVariant[];
  input: GenerateInput;
}) {
  const imageCount = variants.filter((v) => v.imageUrl).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
          {variants.length} Variante{variants.length === 1 ? "" : "n"} generiert
          {imageCount > 0 && (
            <span className="ml-2 text-xs font-medium text-slate-500">
              ({imageCount} mit Bild)
            </span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {imageCount > 1 && <DownloadAllButton variants={variants} />}
          {variants.length > 1 && (
            <BundleSaveButton variants={variants} input={input} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {variants.map((v) => (
          <VariantCard
            key={v.index}
            variant={v}
            input={input}
            projectId={input.projectId ?? ""}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BundleSaveButton (B2) — speichert ALLE Varianten in 1 creatives-Row.
// Erspart das einzelne Klicken pro Variante.
// ---------------------------------------------------------------------------
const initialBundleState: BundleSaveState = { ok: false };

function BundleSaveButton({
  variants,
  input,
}: {
  variants: GeneratedVariant[];
  input: GenerateInput;
}) {
  const [state, action, pending] = useActionState(
    saveAllVariants,
    initialBundleState,
  );
  // Root-Headline/Subline = die der ersten Variante (Legacy + Library-List
  // braucht einen Fallback fürs Headline-Thumbnail). Pro-Variant-Headlines
  // gehen ZUSÄTZLICH im Payload mit — Render zieht später die richtige.
  const headline = variants[0]?.headline ?? "";
  const subline = variants[0]?.subline ?? "";
  const payload = variants.map((v) => {
    const previewImageUrl =
      (v.imageUrls && v.imageUrls[0]) ?? v.imageUrl ?? "";
    return {
      index: v.index,
      body: v.body,
      cta: v.cta,
      // UV-2 — Per-Variant-Texte ins Bundle-Payload.
      headline: v.headline,
      subline: v.subline,
      imagePrompt: v.imagePrompt,
      previewImageUrl,
      productImageUrl: v.productImageUrl ?? "",
    };
  });

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="product" value={input.product} />
      <input type="hidden" name="audience" value={input.audience} />
      <input type="hidden" name="tone" value={input.tone} />
      <input type="hidden" name="machine" value={input.machine} />
      <input type="hidden" name="angle" value={input.angle} />
      <input type="hidden" name="headline" value={headline} />
      <input type="hidden" name="subline" value={subline} />
      <input type="hidden" name="projectId" value={input.projectId ?? ""} />
      <input type="hidden" name="folderId" value={input.folderId ?? ""} />
      <input type="hidden" name="logoUrl" value={input.logoUrl ?? ""} />
      <input
        type="hidden"
        name="brandColors"
        value={input.brandColors ? JSON.stringify(input.brandColors) : ""}
      />
      <input type="hidden" name="variantsJson" value={JSON.stringify(payload)} />

      {state.ok && state.savedId && (
        <a
          href={`/dashboard/library/${state.savedId}`}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--foreground)] hover:opacity-70"
        >
          <Icon name="check" className="size-3" />
          Bündel gespeichert ({state.savedCount})
        </a>
      )}
      {state.error && (
        <span className="text-[12px] text-slate-700">{state.error}</span>
      )}

      <button
        type="submit"
        disabled={pending || state.ok}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--foreground)] px-3.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? "Speichere…"
          : state.ok
            ? (<><Icon name="check" className="size-3.5" /> Gespeichert</>)
            : (<><Icon name="rectangle-stack" className="size-3.5" /> Alle {variants.length} als Bündel speichern</>)}
      </button>
    </form>
  );
}

function VariantCard({
  variant,
  input,
  projectId,
}: {
  variant: GeneratedVariant;
  input: GenerateInput;
  projectId: string;
}) {
  const [saveState, saveAction, saving] = useActionState(
    saveCreative,
    initialSave,
  );
  const justSaved = saveState.ok && saveState.savedVariantIndex === variant.index;
  const allImages = variant.imageUrls ?? (variant.imageUrl ? [variant.imageUrl] : []);
  const [activeImage, setActiveImage] = useState(0);
  const [imgLoadFailed, setImgLoadFailed] = useState(false);
  const shownImage = allImages[activeImage] ?? variant.imageUrl;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-900/5 transition-shadow hover:shadow-lg">
      {/* Bild */}
      <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
        {shownImage && !imgLoadFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shownImage}
            alt={`Variante ${variant.index}`}
            className="h-full w-full object-cover"
            onError={() => setImgLoadFailed(true)}
            onLoad={() => setImgLoadFailed(false)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-slate-500">
            {shownImage && imgLoadFailed ? (
              <>
                <span className="text-2xl">🖼️</span>
                <span className="font-medium text-slate-700">
                  Bild kann nicht geladen werden
                </span>
                <span className="break-all text-[10px] text-slate-400">
                  {shownImage}
                </span>
                <a
                  href={shownImage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-slate-700 underline"
                >
                  URL im Browser öffnen
                </a>
              </>
            ) : variant.imageError ? (
              <span>⚠️ {variant.imageError}</span>
            ) : (
              <span>kein Bild</span>
            )}
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-slate-900/90 px-2.5 py-0.5 text-xs font-bold text-white shadow">
          Variante {variant.index}
        </span>
        <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
          <ScoreBadge score={variant.score} issues={variant.scoreIssues} />
          {variant.hook && (
            <span
              className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow ring-1 ring-slate-200"
              title={`Hook: ${variant.hook} · Framework: ${variant.framework ?? "—"}${variant.lever ? ` · Hebel: ${variant.lever}` : ""}`}
            >
              {variant.hook}
            </span>
          )}
        </div>
      </div>

      {/* Bild-Stil-Thumbnails bei imageVariantCount > 1 */}
      {allImages.length > 1 && (
        <div className="flex gap-1 border-t border-slate-100 bg-slate-50 px-2 py-1.5">
          {allImages.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              onClick={() => {
                setActiveImage(i);
                setImgLoadFailed(false);
              }}
              className={
                "h-10 w-10 overflow-hidden rounded border transition " +
                (i === activeImage
                  ? "border-slate-700 ring-2 ring-slate-300"
                  : "border-slate-300 opacity-70 hover:opacity-100")
              }
              title={`Bild ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Stil ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Rating-Bar (Stufe 1 Lernschleife) */}
      <RatingBar variant={variant} input={input} />

      {/* Text-Block */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Headline
        </p>
        <p className="text-base font-bold text-slate-900">{variant.headline}</p>

        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          Subline
        </p>
        <p className="text-sm text-slate-700">{variant.subline}</p>

        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          Ad-Copy
        </p>
        <p className="whitespace-pre-line text-sm text-slate-800">{variant.body}</p>

        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          CTA
        </p>
        <p className="text-sm font-semibold text-slate-800">{variant.cta}</p>

        {/* Action-Buttons */}
        <div className="mt-auto flex flex-wrap gap-2 pt-3">
          {variant.imageUrl && (
            <DownloadVariantButton
              url={variant.imageUrl}
              filename={`variante-${variant.index}.png`}
            />
          )}
          <form action={saveAction} className="flex-1">
            <input type="hidden" name="product" value={input.product} />
            <input type="hidden" name="audience" value={input.audience} />
            <input type="hidden" name="tone" value={input.tone} />
            <input type="hidden" name="machine" value={input.machine} />
            <input type="hidden" name="angle" value={input.angle} />
            <input type="hidden" name="variantIndex" value={variant.index} />
            <input type="hidden" name="headline" value={variant.headline} />
            <input type="hidden" name="subline" value={variant.subline} />
            <input type="hidden" name="body" value={variant.body} />
            <input type="hidden" name="cta" value={variant.cta} />
            <input type="hidden" name="imagePrompt" value={variant.imagePrompt} />
            <input
              type="hidden"
              name="previewImageUrl"
              value={shownImage ?? ""}
            />
            <input
              type="hidden"
              name="productImageUrl"
              value={variant.productImageUrl ?? ""}
            />
            {/* N4: Projekt-Zuordnung pro Save (kommt aus dem ProjectPicker) */}
            <input type="hidden" name="projectId" value={projectId} />
            {/* F4: Folder-Zuordnung (optional) */}
            <input
              type="hidden"
              name="folderId"
              value={input.folderId ?? ""}
            />
            {/* RF-Brand: Logo + Farben aus dem Crawl ans Save weiterreichen */}
            <input type="hidden" name="logoUrl" value={input.logoUrl ?? ""} />
            <input
              type="hidden"
              name="brandColors"
              value={input.brandColors ? JSON.stringify(input.brandColors) : ""}
            />
            <button
              type="submit"
              disabled={saving || justSaved}
              className="w-full rounded-md bg-gradient-to-br from-slate-800 to-slate-950 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {saving
                ? "Speichere…"
                : justSaved
                  ? "✓ Gespeichert"
                  : "In Library speichern"}
            </button>
          </form>
        </div>

        {saveState.error && saveState.savedVariantIndex === undefined && (
          <p className="mt-1 text-xs text-slate-700">{saveState.error}</p>
        )}
        {justSaved && saveState.savedId && (
          <a
            href={`/dashboard/library/${saveState.savedId}`}
            className="mt-1 text-xs text-slate-700 hover:text-slate-900"
          >
            → Zum Eintrag in der Library
          </a>
        )}

        <details className="mt-1">
          <summary className="cursor-pointer text-[10px] text-slate-400 hover:text-slate-600">
            🖼️ Verwendeter Bild-Prompt (en)
          </summary>
          <p className="mt-1 text-[10px] text-slate-500">{variant.imagePrompt}</p>
        </details>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RatingBar — 👍 / 👎 pro Variante. Schickt die Achsen-Metadaten an
// rateVariant, damit der Variant-Plan-Generator beim nächsten Lauf bevorzugte
// Hooks häufiger zieht.
// ---------------------------------------------------------------------------
function RatingBar({
  variant,
  input,
}: {
  variant: GeneratedVariant;
  input: GenerateInput;
}) {
  const [state, action, pending] = useActionState(rateVariant, initialRating);
  const myRating =
    state.ok && state.variantIndex === variant.index ? state.rating : null;
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Lernen lassen
      </span>
      <div className="flex gap-1">
        <form action={action}>
          <input type="hidden" name="variantIndex" value={variant.index} />
          <input type="hidden" name="hook" value={variant.hook ?? ""} />
          <input type="hidden" name="framework" value={variant.framework ?? ""} />
          <input type="hidden" name="lever" value={variant.lever ?? ""} />
          <input type="hidden" name="persona" value={input.persona ?? ""} />
          <input type="hidden" name="platform" value={input.platform ?? ""} />
          <input type="hidden" name="rating" value="1" />
          <button
            type="submit"
            disabled={pending}
            className={
              "rounded-md px-2 py-1 text-sm transition " +
              (myRating === 1
                ? "bg-slate-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-700")
            }
            title="Hook merken (bei zukünftigen Generierungen bevorzugt)"
          >
            👍
          </button>
        </form>
        <form action={action}>
          <input type="hidden" name="variantIndex" value={variant.index} />
          <input type="hidden" name="hook" value={variant.hook ?? ""} />
          <input type="hidden" name="framework" value={variant.framework ?? ""} />
          <input type="hidden" name="lever" value={variant.lever ?? ""} />
          <input type="hidden" name="persona" value={input.persona ?? ""} />
          <input type="hidden" name="platform" value={input.platform ?? ""} />
          <input type="hidden" name="rating" value="-1" />
          <button
            type="submit"
            disabled={pending}
            className={
              "rounded-md px-2 py-1 text-sm transition " +
              (myRating === -1
                ? "bg-slate-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-700")
            }
            title="Hook deboosten (bei zukünftigen Generierungen seltener)"
          >
            👎
          </button>
        </form>
      </div>
    </div>
  );
}

// ===========================================================================
// Download helpers (single + ZIP)
// ===========================================================================
function DownloadVariantButton({
  url,
  filename,
}: {
  url: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    try {
      setBusy(true);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      alert(`Download fehlgeschlagen: ${err instanceof Error ? err.message : "?"}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      {busy ? "Lade…" : "⬇ Bild"}
    </button>
  );
}

// JSZip per CDN nachladen, nur wenn nötig (kein npm-Bundle-Hit).
declare global {
  var JSZip: undefined | (new () => JSZipInstance);
}

type JSZipInstance = {
  file: (name: string, data: Blob | Uint8Array) => void;
  generateAsync: (opts: { type: "blob" }) => Promise<Blob>;
};

function loadJSZip(): Promise<new () => JSZipInstance> {
  if (typeof window === "undefined")
    return Promise.reject(new Error("Nur im Browser verfügbar."));
  const existing = (window as unknown as { JSZip?: new () => JSZipInstance }).JSZip;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    script.onload = () => {
      const w = window as unknown as { JSZip?: new () => JSZipInstance };
      if (w.JSZip) resolve(w.JSZip);
      else reject(new Error("JSZip wurde geladen, ist aber nicht global verfügbar."));
    };
    script.onerror = () =>
      reject(new Error("JSZip konnte nicht von cdnjs geladen werden."));
    document.head.appendChild(script);
  });
}

function DownloadAllButton({ variants }: { variants: GeneratedVariant[] }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const handle = async () => {
    const withImages = variants.filter((v) => v.imageUrl);
    if (withImages.length === 0) {
      alert("Keine Bilder vorhanden zum Bündeln.");
      return;
    }
    try {
      setBusy(true);
      setProgress("Lade JSZip…");
      const JSZipCtor = await loadJSZip();
      const zip = new JSZipCtor();

      for (let i = 0; i < withImages.length; i++) {
        const v = withImages[i];
        setProgress(`Lade Bild ${i + 1}/${withImages.length}…`);
        const res = await fetch(v.imageUrl!, { cache: "no-store" });
        if (!res.ok) throw new Error(`Bild ${v.index}: HTTP ${res.status}`);
        const blob = await res.blob();
        const ext = blob.type.includes("png")
          ? "png"
          : blob.type.includes("webp")
            ? "webp"
            : "jpg";
        zip.file(`variante-${v.index}.${ext}`, blob);
      }

      // Text-Datei mit allen Copies dazu — praktisch fürs Briefing
      const textContent = variants
        .map(
          (v) => `=== Variante ${v.index} ===
Headline: ${v.headline}
Subline: ${v.subline}

Body:
${v.body}

CTA: ${v.cta}

Bild-Prompt (en):
${v.imagePrompt}
`,
        )
        .join("\n");
      zip.file("copies.txt", new Blob([textContent], { type: "text/plain" }));

      setProgress("Erzeuge ZIP…");
      const blob = await zip.generateAsync({ type: "blob" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `creatives-session-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setProgress(null);
    } catch (err) {
      alert(`ZIP fehlgeschlagen: ${err instanceof Error ? err.message : "?"}`);
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {progress && (
        <span className="text-[11px] text-slate-500">{progress}</span>
      )}
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className="rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-slate-900/20 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {busy ? "Erstelle ZIP…" : "📦 Alle downloaden (ZIP)"}
      </button>
    </div>
  );
}

// ===========================================================================
// TemplateBar — Vorlagen direkt im Generate-Form: auswählen (füllt das Form
// via ?template=<id> vor) ODER den aktuellen Zustand als neue Vorlage sichern.
// ===========================================================================
function TemplateBar({
  templates,
  currentId,
  onPick,
  onSave,
  saving,
  message,
  onDismiss,
}: {
  templates: { id: string; name: string }[];
  currentId: string | null;
  onPick: (id: string) => void;
  onSave: () => void;
  saving: boolean;
  message: { kind: "ok" | "err"; text: string } | null;
  onDismiss: () => void;
}) {
  const activeName = currentId
    ? (templates.find((t) => t.id === currentId)?.name ?? null)
    : null;

  return (
    // Dezent + standardmäßig eingeklappt — Vorlagen sind ein Hilfsmittel,
    // kein Hauptelement. Aktive Vorlage wird im Summary als Badge angezeigt.
    <details className="group rounded-lg">
      <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--foreground)]">
        <Icon
          name="chevron-right"
          className="size-3 transition-transform group-open:rotate-90"
        />
        <Icon name="tag" className="size-3" />
        <span>Vorlage</span>
        {activeName && (
          <span className="ml-0.5 max-w-[160px] truncate rounded-full bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--foreground)]">
            {activeName}
          </span>
        )}
      </summary>

      <div className="mt-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-2.5">
        <div className="flex items-center gap-2">
          <select
            value={currentId ?? ""}
            onChange={(e) => onPick(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-slate-700 focus:outline-none"
            aria-label="Vorlage auswählen"
          >
            <option value="">— Vorlage wählen / einfügen —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            title="Aktuelle Eingaben als wiederverwendbare Vorlage speichern"
          >
            <Icon name="tag" className="size-3.5" />
            {saving ? "Speichere…" : "Speichern"}
          </button>
        </div>
        {message && (
          <div
            className={
              "mt-1.5 flex items-start justify-between gap-2 rounded-md px-2 py-1 text-[11px] " +
              (message.kind === "ok"
                ? "bg-emerald-50 text-emerald-800"
                : "bg-red-50 text-red-700")
            }
          >
            <span>{message.text}</span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Meldung schließen"
              className="shrink-0 opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}
        <p className="mt-1 text-[10px] leading-snug text-[var(--color-muted)]">
          Vorlage wählen füllt das Form vor · „Speichern“ legt die aktuellen
          Eingaben als neue Vorlage an.{" "}
          <a
            href="/dashboard/settings/templates"
            className="underline hover:text-[var(--foreground)]"
          >
            Alle verwalten
          </a>
        </p>
      </div>
    </details>
  );
}

// ===========================================================================
// Form-Komponenten (unverändert vom vorigen Stand)
// ===========================================================================
function ToneField({
  initialValue,
  value: controlledValue,
  onChange: controlledOnChange,
}: {
  initialValue?: (typeof TONES)[number]["value"];
  value?: (typeof TONES)[number]["value"];
  onChange?: (v: (typeof TONES)[number]["value"]) => void;
}) {
  const [internal, setInternal] = useState<(typeof TONES)[number]["value"]>(
    initialValue ?? "professionell",
  );
  const tone = controlledValue ?? internal;
  const setTone = (v: (typeof TONES)[number]["value"]) => {
    if (controlledValue === undefined) setInternal(v);
    controlledOnChange?.(v);
  };
  const active = TONES.find((t) => t.value === tone)!;
  return (
    <div>
      <label htmlFor="tone" className="block text-sm font-medium text-slate-700">
        Ton
      </label>
      <select
        id="tone"
        name="tone"
        required
        value={tone}
        onChange={(e) => setTone(e.target.value as (typeof TONES)[number]["value"])}
        className={`${inputCls} mt-1`}
      >
        {TONES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">{active.hint}</p>
    </div>
  );
}

function WebsiteUrlField({
  websiteText,
  setWebsiteText,
  crawling,
  setCrawling,
  error,
  setError,
  setProductText,
  setAudienceText,
  setImageSource,
  setCustomImageUrl,
  setMachineValue,
  setToneValue,
  setProductFacts,
  setLogoUrl,
  setBrandColors,
  logoUrl,
  brandColors,
}: {
  websiteText: string;
  setWebsiteText: (s: string) => void;
  crawling: boolean;
  setCrawling: (b: boolean) => void;
  error: string | null;
  setError: (s: string | null) => void;
  setProductText: (s: string) => void;
  setAudienceText: (s: string) => void;
  setImageSource: (s: ImageSource) => void;
  setCustomImageUrl: (s: string) => void;
  setMachineValue: (v: MachineValue) => void;
  setToneValue: (v: (typeof TONES)[number]["value"]) => void;
  setProductFacts: (f: ProductFacts | null) => void;
  setLogoUrl: (s: string) => void;
  setBrandColors: (
    c: { primary: string; accent: string; background: string; text: string } | null,
  ) => void;
  logoUrl: string;
  brandColors:
    | { primary: string; accent: string; background: string; text: string }
    | null;
}) {
  const [url, setUrl] = useState("");
  const [crawledImage, setCrawledImage] = useState<string | null>(null);
  const [imageMirrored, setImageMirrored] = useState(false);
  const handleCrawl = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setWebsiteText("");
      setError(null);
      setCrawledImage(null);
      return;
    }
    setCrawling(true);
    setError(null);
    try {
      const res = await fetch("/api/crawl-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const json = (await res.json()) as {
        text?: string;
        title?: string;
        description?: string;
        imageUrl?: string;
        imageMirrored?: boolean;
        logoUrl?: string;
        brandColors?: {
          primary: string;
          accent: string;
          background: string;
          text: string;
        } | null;
        product?: string;
        audience?: string;
        machine?: MachineValue;
        angle?: AngleValue;
        tone?: (typeof TONES)[number]["value"];
        facts?: ProductFacts | null;
        error?: string;
      };
      if (!res.ok || !json.text) {
        setError(json.error ?? `Fehler (${res.status})`);
        setWebsiteText("");
        setCrawledImage(null);
        setImageMirrored(false);
      } else {
        setWebsiteText(json.text);
        // Auto-Fill aus LLM-Inference (bevorzugt) ODER aus Title/Description als Fallback
        if (json.product) setProductText(json.product);
        else if (json.title) setProductText(json.title);
        if (json.audience) setAudienceText(json.audience);
        else if (json.description) setAudienceText(json.description);
        // LLM-Inference für Machine, Angle, Tone
        // Machine wird automatisch gesetzt (steuert Bild-Szene), Angle bleibt
        // hardcoded "direkt" — beide ohne UI-Feld
        if (json.machine) setMachineValue(json.machine);
        if (json.tone) setToneValue(json.tone);
        // Phase B — strukturierte Produktfakten (Doc 6.2)
        if (json.facts) setProductFacts(json.facts);
        // RF-Brand — Logo + Brand-Farben für Render-Theme
        setLogoUrl(json.logoUrl ?? "");
        setBrandColors(json.brandColors ?? null);
        // Auto-Fill: Bild-URL → Bild-Quelle auf "url" umschalten
        if (json.imageUrl) {
          setCrawledImage(json.imageUrl);
          setImageMirrored(Boolean(json.imageMirrored));
          setImageSource("url");
          setCustomImageUrl(json.imageUrl);
        } else {
          // Kein Crawl-Bild → AI generiert passend zum Text
          setCrawledImage(null);
          setImageMirrored(false);
          setImageSource("ai");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerk-Fehler.");
      setWebsiteText("");
      setCrawledImage(null);
    } finally {
      setCrawling(false);
    }
  };
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Website-URL <span className="font-normal text-slate-400">(optional)</span>
      </label>
      <div className="relative mt-1">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={handleCrawl}
          placeholder="https://wodoil.at/..."
          className={inputCls}
        />
        {crawling && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-700">
            ⏳ Crawlt…
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-slate-600">{error}</p>}
      {websiteText && !crawling && (
        <details className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
          <summary className="cursor-pointer font-medium text-slate-800">
            ✓ {websiteText.length} Zeichen geladen — Vorschau
          </summary>
          <p className="mt-1 max-h-32 overflow-y-auto text-slate-900/80">
            {websiteText}
          </p>
        </details>
      )}
      {crawledImage && !crawling && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={crawledImage}
            alt="Gecrawltes Produktbild"
            className="h-12 w-12 rounded-md border border-slate-300 object-cover"
            onError={() => setCrawledImage(null)}
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-800">
              ✓ Produktbild {imageMirrored ? "gespeichert" : "übernommen"}
            </p>
            <p className="truncate text-slate-700/80">{crawledImage}</p>
            <p className="text-slate-700/60">
              Wird als Produktbild-Overlay übers KI-Szenenbild komponiert.
            </p>
          </div>
        </div>
      )}
      {(logoUrl || brandColors) && !crawling && (
        <BrandSwatchesPanel
          logoUrl={logoUrl}
          brandColors={brandColors}
          onChange={setBrandColors}
          onClear={() => {
            setLogoUrl("");
            setBrandColors(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Brand-Style-Anzeige: Logo-Preview links, 4 Farb-Swatches rechts. Jeder
 * Swatch ist ein color-input → User kann die extrahierten Werte direkt
 * korrigieren, bevor das Form submitted wird.
 */
function BrandSwatchesPanel({
  logoUrl,
  brandColors,
  onChange,
  onClear,
}: {
  logoUrl: string;
  brandColors:
    | { primary: string; accent: string; background: string; text: string }
    | null;
  onChange: (
    c: { primary: string; accent: string; background: string; text: string } | null,
  ) => void;
  onClear: () => void;
}) {
  const slots: Array<{
    key: "primary" | "accent" | "background" | "text";
    label: string;
  }> = [
    { key: "primary", label: "Primary" },
    { key: "accent", label: "Accent" },
    { key: "background", label: "BG" },
    { key: "text", label: "Text" },
  ];
  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-900">
      <div className="flex items-center justify-between">
        <p className="font-medium text-slate-800">🎨 Brand-Style aus Logo</p>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-slate-500 underline hover:text-slate-700"
        >
          Entfernen
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3">
        {logoUrl && (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="Logo"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}
        <div className="flex flex-1 flex-wrap gap-2">
          {slots.map((s) => {
            const v = brandColors?.[s.key] ?? "#FFFFFF";
            return (
              <label
                key={s.key}
                className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-1.5 py-1"
              >
                <input
                  type="color"
                  value={v}
                  onChange={(e) => {
                    const next = brandColors
                      ? { ...brandColors, [s.key]: e.target.value }
                      : {
                          primary: "#000000",
                          accent: "#000000",
                          background: "#FFFFFF",
                          text: "#111111",
                          [s.key]: e.target.value,
                        };
                    onChange(next as typeof brandColors);
                  }}
                  className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                  aria-label={s.label}
                />
                <span className="text-[10px] tabular-nums text-slate-700">
                  {s.label} · {v.toUpperCase()}
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-700/60">
        Diese Farben werden beim Speichern in den Kampagnen-Ordner geschrieben
        und vom Renderer als Theme verwendet.
      </p>
    </div>
  );
}

function VariantCountField({
  error,
  initialValue,
  onChange,
}: {
  error?: string;
  initialValue?: number;
  onChange?: (n: number) => void;
}) {
  const [count, setCount] = useState(
    initialValue && initialValue >= 1 && initialValue <= 10 ? initialValue : 3,
  );
  useEffect(() => {
    onChange?.(count);
  }, [count, onChange]);
  const PRESETS = [1, 3, 5, 10];
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Anzahl Varianten
      </label>
      <input type="hidden" name="variantCount" value={count} />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCount((c) => Math.max(1, c - 1))}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
        >
          −
        </button>
        <span className="inline-flex h-8 w-12 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-semibold tabular-nums">
          {count}
        </span>
        <button
          type="button"
          onClick={() => setCount((c) => Math.min(10, c + 1))}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
        >
          +
        </button>
        <div className="ml-2 flex gap-1">
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={
                "rounded-md px-2 py-1 text-xs font-medium transition " +
                (count === n
                  ? "bg-slate-800 text-white shadow"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200")
              }
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Default: 3. Jede Variante = 1 API-Call parallel.
      </p>
      {error && <p className="mt-1 text-xs text-slate-600">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WizardStep — ein aufklappbarer Schritt im Generate-Akkordeon. Eingeklappte
// Schritte zeigen eine 1-Zeilen-Zusammenfassung; ihre Felder bleiben per
// `hidden` (display:none) IM DOM → Form-Daten + Auto-Save bleiben erhalten.
// ---------------------------------------------------------------------------
function WizardStep({
  n,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  n: number;
  title: string;
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <span
          className={
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold " +
            (open ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")
          }
        >
          {n}
        </span>
        <span className="shrink-0 text-[14px] font-semibold text-slate-900">
          {title}
        </span>
        {!open && summary ? (
          <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">
            {summary}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <Icon
          name="chevron-down"
          className={
            "size-4 shrink-0 text-slate-400 transition-transform " +
            (open ? "rotate-180" : "")
          }
        />
      </button>
      <div className={open ? "space-y-4 border-t border-slate-200 p-4" : "hidden"}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PerVariantAngles — optional pro Variante einen festen Werbe-Angle wählen.
// Leer = automatische Rotation (Default). Die Selects bleiben auch eingeklappt
// im DOM und submitten als mehrfaches name="variantAngle" in Varianten-Reihen-
// folge; der Server überschreibt damit die Auto-Rotation, wo gesetzt.
// ---------------------------------------------------------------------------
function PerVariantAngles({ count }: { count: number }) {
  const n = Math.max(1, Math.min(10, count || 1));
  return (
    <details className="rounded-lg border border-[var(--color-line)] bg-white">
      <summary className="cursor-pointer select-none rounded-lg px-3 py-2 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]">
        Angle pro Variante
        <span className="ml-2 text-[11px] font-normal text-[var(--color-muted)]">
          optional — Standard: automatisch rotiert
        </span>
      </summary>
      <div className="space-y-2 border-t border-slate-200 p-3">
        <p className="text-[11px] text-slate-500">
          Leer = Auto. Gewählter Angle gilt genau für diese Variante.
        </p>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-[68px] shrink-0 text-xs font-medium text-slate-600">
              Variante {i + 1}
            </span>
            <select
              name="variantAngle"
              defaultValue=""
              className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-slate-700 focus:outline-none"
              aria-label={`Angle für Variante ${i + 1}`}
            >
              <option value="">— Auto —</option>
              {ANGLES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </details>
  );
}

function ImageStyleField({
  initialValue,
}: {
  initialValue?: ImageStyleValue;
}) {
  const [val, setVal] = useState<ImageStyleValue>(
    initialValue && IMAGE_STYLES.some((s) => s.value === initialValue)
      ? initialValue
      : "auto",
  );
  const active = IMAGE_STYLES.find((s) => s.value === val)!;
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Bild-Stil
      </label>
      <select
        name="imageStyle"
        required
        value={val}
        onChange={(e) => setVal(e.target.value as ImageStyleValue)}
        className={`${inputCls} mt-1`}
      >
        {IMAGE_STYLES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">{active.hint}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductFactsCard (Doc 6.2) — editierbare Chip-Liste aus dem Crawl
// ---------------------------------------------------------------------------
function ProductFactsCard({
  facts,
  onChange,
}: {
  facts: ProductFacts | null;
  onChange: (f: ProductFacts | null) => void;
}) {
  if (!facts || !hasProductFacts(facts)) return null;
  const update = (patch: Partial<ProductFacts>) =>
    onChange({ ...facts, ...patch });
  const removeFromArray = (key: keyof ProductFacts, idx: number) => {
    const arr = facts[key] as string[];
    update({ [key]: arr.filter((_, i) => i !== idx) } as Partial<ProductFacts>);
  };
  return (
    <details className="rounded-lg border border-[var(--color-line)] bg-white">
      <summary className="cursor-pointer select-none rounded-lg px-3 py-2 text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--color-surface)]">
        Produkt-Fakten
        <span className="ml-2 text-[11px] font-normal text-[var(--color-muted)]">
          aus Crawl, editierbar
        </span>
      </summary>
      <div className="space-y-2 border-t border-slate-200 p-3 text-xs">
        <FactInput
          label="Produkt"
          value={facts.name}
          onChange={(v) => update({ name: v })}
        />
        <div className="grid grid-cols-2 gap-2">
          <FactInput
            label="Preis"
            value={facts.price}
            onChange={(v) => update({ price: v })}
            placeholder="89,90 € / 60L"
          />
          <FactInput
            label="Gebinde"
            value={facts.gebinde}
            onChange={(v) => update({ gebinde: v })}
            placeholder="60L Fass"
          />
        </div>

        {/* C2 — Hero-Pflicht-Werte (Doc 3.1 · höchste CTR-Hebel) */}
        <div className="rounded-md border border-slate-200 bg-slate-50/40 p-2">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-900">
              🎯 Hero-Werte (höchster CTR-Hebel)
            </span>
            <span className="text-[9px] text-slate-700/70">optional, aber +187 % CTR</span>
          </div>
          <div className="space-y-1.5">
            <FactInput
              label="Hero-Zahl (Specific Number)"
              value={facts.heroNumber}
              onChange={(v) => update({ heroNumber: v })}
              placeholder="84 % weniger Verschleiß"
            />
            <FactInput
              label="Vorher → Nachher"
              value={facts.beforeAfter}
              onChange={(v) => update({ beforeAfter: v })}
              placeholder="Vorher 40 % Verschleiß → Nachher 6 %"
            />
            <FactInput
              label="Social Proof"
              value={facts.socialProof}
              onChange={(v) => update({ socialProof: v })}
              placeholder="7.412 Werkstätten setzen auf …"
            />
          </div>
        </div>

        {/* B6 — Drehort für authentische Szene */}
        <FactInput
          label="🎬 Drehort (Szenerie fürs Bild)"
          value={facts.scene}
          onChange={(v) => update({ scene: v })}
          placeholder="Werkstatt · Bauernhof · Garage · Straße"
        />
        <FactChips
          label="Specs (DIN/ISO)"
          values={facts.specs}
          onRemove={(i) => removeFromArray("specs", i)}
          onAdd={(v) => update({ specs: [...facts.specs, v].slice(0, 8) })}
          placeholder="DIN 51524-2"
        />
        <FactChips
          label="OEM-Freigaben"
          values={facts.oemApprovals}
          onRemove={(i) => removeFromArray("oemApprovals", i)}
          onAdd={(v) =>
            update({ oemApprovals: [...facts.oemApprovals, v].slice(0, 8) })
          }
          placeholder="Bosch-Rexroth"
        />
        <FactChips
          label="USPs"
          values={facts.usps}
          onRemove={(i) => removeFromArray("usps", i)}
          onAdd={(v) => update({ usps: [...facts.usps, v].slice(0, 6) })}
          placeholder="Direkt vom Hersteller"
        />
        <FactChips
          label="Kompatibel mit"
          values={facts.compatibleMachines}
          onRemove={(i) => removeFromArray("compatibleMachines", i)}
          onAdd={(v) =>
            update({
              compatibleMachines: [...facts.compatibleMachines, v].slice(0, 8),
            })
          }
          placeholder="Traktor"
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-1 text-[10px] text-slate-700/70 hover:text-slate-700"
        >
          ✕ Produktfakten entfernen
        </button>
      </div>
    </details>
  );
}

function FactInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-900/70">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-0.5 block w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
    </label>
  );
}

function FactChips({
  label,
  values,
  onRemove,
  onAdd,
  placeholder,
}: {
  label: string;
  values: string[];
  onRemove: (i: number) => void;
  onAdd: (v: string) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const commit = () => {
    const v = input.trim();
    if (!v) return;
    onAdd(v);
    setInput("");
  };
  return (
    <div>
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-900/70">
        {label}
      </span>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-900 ring-1 ring-slate-200"
          >
            {v}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="text-slate-600 hover:text-slate-700"
              aria-label="Entfernen"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className="min-w-[120px] flex-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectPicker (N2) — Creative direkt einem Projekt zuordnen.
// Optional. Bei „kein Projekt" landet das Creative project-less in der Library.
// ---------------------------------------------------------------------------
function ProjectPicker({
  value,
  onChange,
  projects,
}: {
  value: string;
  onChange: (v: string) => void;
  projects: { id: string; name: string }[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Projekt-Zuordnung <span className="font-normal text-slate-400">— optional</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} mt-1`}
      >
        <option value="">— Kein Projekt —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">
        {projects.length === 0
          ? "Noch keine Projekte angelegt. Bei Bedarf erst unter /dashboard/projects anlegen."
          : "Gespeicherte Varianten landen direkt im gewählten Projekt."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FolderPicker (F4) — Kampagnen-Ordner im aktuellen Projekt.
// ---------------------------------------------------------------------------
function FolderPicker({
  value,
  onChange,
  folders,
  projectId,
}: {
  value: string;
  onChange: (v: string) => void;
  folders: { id: string; name: string }[];
  projectId: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Kampagne / Ordner{" "}
        <span className="font-normal text-slate-400">— optional</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} mt-1`}
      >
        <option value="">— Kein Ordner —</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">
        {folders.length === 0 ? (
          <>
            Noch keine Ordner in diesem Projekt.{" "}
            <a
              href={`/dashboard/projects/${projectId}`}
              className="text-slate-700 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Im Projekt anlegen →
            </a>
          </>
        ) : (
          "Variante landet im gewählten Ordner."
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlatformPicker (Doc 5.4)
// ---------------------------------------------------------------------------
function PlatformPicker({
  value,
  onChange,
}: {
  value: PlatformValue;
  onChange: (v: PlatformValue) => void;
}) {
  const active = PLATFORMS.find((p) => p.value === value)!;
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Plattform
      </label>
      <div className="mt-1 grid grid-cols-3 gap-1.5">
        {PLATFORMS.map((p) => {
          const isActive = value === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              className={
                "flex flex-col items-center justify-center rounded-lg border px-2 py-2 text-center transition-all duration-150 " +
                (isActive
                  ? "border-slate-700 bg-gradient-to-br from-slate-50 to-white shadow-md shadow-slate-900/10 ring-1 ring-slate-300"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/40")
              }
            >
              <span className="text-base leading-none">{p.emoji}</span>
              <span
                className={
                  "mt-0.5 text-[11px] font-semibold " +
                  (isActive ? "text-slate-900" : "text-slate-800")
                }
              >
                {p.label}
              </span>
              <span className="text-[9px] text-slate-500">{p.aspectRatio}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-slate-500">{active.hint}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImageVariantCountField (Doc 4.6) — 1–4 Bilder pro Text-Variante parallel
// ---------------------------------------------------------------------------
function ImageVariantCountField({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const OPTIONS = [1, 2, 3, 4];
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Bilder pro Text-Variante
      </label>
      <div className="mt-1 inline-flex gap-1">
        {OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={
              "rounded-md px-3 py-1 text-xs font-semibold transition " +
              (value === n
                ? "bg-slate-800 text-white shadow"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200")
            }
          >
            {n}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {value === 1
          ? "Ein Bild pro Variante."
          : `Pro Variante ${value} verschiedene Bild-Stile (Studio/Cinematic/Golden Hour/Industrial). Kosten ×${value}.`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UrgencyToggle — erzwingt Urgency-Wort im CTA (Doc 3.6)
// ---------------------------------------------------------------------------
function UrgencyToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-700 focus:ring-slate-600"
      />
      <span>
        <span className="block text-sm font-medium text-slate-700">
          Urgency im CTA erzwingen
        </span>
        <span className="block text-xs text-slate-500">
          CTA enthält „jetzt“/„direkt“/„sofort“ oder eine Deadline (+5 Score).
        </span>
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// PersonaPicker (Doc Kap. 2)
// ---------------------------------------------------------------------------
function PersonaPicker({
  value,
  onPick,
}: {
  value: PersonaValue | null;
  onPick: (p: (typeof PERSONAS)[number]) => void;
}) {
  const active = value ? PERSONAS.find((p) => p.value === value) : undefined;
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Zielgruppe (Persona)
      </label>
      <p className="mt-0.5 text-xs text-slate-500">
        Ein Klick setzt Anrede, Awareness, Hook-Bias und Maschinen-Kontext.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {PERSONAS.map((p) => {
          const isActive = value === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onPick(p)}
              className={
                "flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-all duration-150 " +
                (isActive
                  ? "border-slate-700 bg-gradient-to-br from-slate-50 to-white shadow-md shadow-slate-900/10 ring-1 ring-slate-300"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/40")
              }
            >
              <span className="text-base leading-none">{p.emoji}</span>
              <span
                className={
                  "text-xs font-semibold leading-tight " +
                  (isActive ? "text-slate-900" : "text-slate-800")
                }
              >
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
      {active && (
        <p className="mt-2 text-xs text-slate-500">{active.hint}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A2 — PersonaOverride: zeigt einen Read-Only-Chip mit dem Persona-Default,
// das echte Edit-Field bleibt im DOM (hidden), sodass Form-Submission
// weiterhin funktioniert. Klick auf „ändern" macht es sichtbar.
// Wird via `key={`po-…-${personaApplyN}`}` bei Persona-Wechsel re-mounted.
// ---------------------------------------------------------------------------
function PersonaOverride({
  label,
  chipText,
  fromPersona,
  children,
}: {
  label: string;
  chipText: string;
  fromPersona: boolean;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const hideEdit = fromPersona && !editing;
  return (
    <div>
      {hideEdit && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-0.5 truncate text-sm text-slate-800">
              {chipText}
              <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-800">
                Persona
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 text-xs font-medium text-slate-700 hover:text-slate-900 hover:underline"
          >
            ändern
          </button>
        </div>
      )}
      <div className={hideEdit ? "hidden" : ""}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddressingField — Du / Sie Toggle
// ---------------------------------------------------------------------------
function AddressingField({
  value,
  onChange,
}: {
  value: AddressingValue;
  onChange: (v: AddressingValue) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">Anrede</label>
      <div className="mt-1 inline-flex rounded-md border border-slate-300 bg-slate-50 p-0.5 text-xs">
        {ADDRESSINGS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => onChange(a)}
            className={
              "rounded px-3 py-1 font-semibold transition " +
              (value === a
                ? "bg-slate-700 text-white shadow"
                : "text-slate-600 hover:text-slate-900")
            }
          >
            {a === "du" ? "Du" : "Sie"}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        „Sie“ wird durchgehend im Output verwendet (typisch für Industrie/Premium).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase A — Awareness, Framework, Persuasion-Levers, optional Hook-Hint
// ---------------------------------------------------------------------------
function AwarenessField({ initialValue }: { initialValue?: AwarenessValue }) {
  const [val, setVal] = useState<AwarenessValue>(
    initialValue && AWARENESS.some((a) => a.value === initialValue)
      ? initialValue
      : 3,
  );
  const active = AWARENESS.find((a) => a.value === val)!;
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Awareness-Level der Zielgruppe
      </label>
      <select
        name="awareness"
        required
        value={String(val)}
        onChange={(e) => setVal(Number(e.target.value) as AwarenessValue)}
        className={`${inputCls} mt-1`}
      >
        {AWARENESS.map((a) => (
          <option key={a.value} value={a.value}>
            Stufe {a.value} — {a.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">{active.hint}</p>
    </div>
  );
}

function FrameworkField({ initialValue }: { initialValue?: FrameworkValue }) {
  const [val, setVal] = useState<FrameworkValue>(
    initialValue && FRAMEWORKS.some((f) => f.value === initialValue)
      ? initialValue
      : "PAS",
  );
  const active = FRAMEWORKS.find((f) => f.value === val)!;
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Copy-Framework
      </label>
      <select
        name="framework"
        required
        value={val}
        onChange={(e) => setVal(e.target.value as FrameworkValue)}
        className={`${inputCls} mt-1`}
      >
        {FRAMEWORKS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">{active.skeleton}</p>
    </div>
  );
}

function PersuasionLeversField({
  initialValue,
}: {
  initialValue: PersuasionLeverValue[];
}) {
  const [selected, setSelected] = useState<PersuasionLeverValue[]>(
    initialValue.filter((v) =>
      PERSUASION_LEVERS.some((p) => p.value === v),
    ) as PersuasionLeverValue[],
  );
  const toggle = (v: PersuasionLeverValue) => {
    setSelected((prev) => {
      if (prev.includes(v)) return prev.filter((x) => x !== v);
      if (prev.length >= 2) return prev; // max 2
      return [...prev, v];
    });
  };
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Persuasion-Hebel (max. 2)
      </label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {PERSUASION_LEVERS.map((p) => {
          const isOn = selected.includes(p.value);
          const isDisabled = !isOn && selected.length >= 2;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => toggle(p.value)}
              disabled={isDisabled}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${
                isOn
                  ? "bg-slate-700 text-white ring-slate-700"
                  : isDisabled
                    ? "bg-slate-50 text-slate-400 ring-slate-200"
                    : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {/* Hidden inputs für FormData (multiple values gleicher Name) */}
      {selected.map((v) => (
        <input key={v} type="hidden" name="persuasionLevers" value={v} />
      ))}
      <p className="mt-1 text-xs text-slate-500">
        Wird pro Variante rotierend in Body oder Subline eingewoben.
      </p>
    </div>
  );
}

function FrameField({ initialValue }: { initialValue?: FrameValue }) {
  const [val, setVal] = useState<FrameValue>(
    initialValue && FRAMES.some((f) => f.value === initialValue)
      ? initialValue
      : "neutral",
  );
  const active = FRAMES.find((f) => f.value === val)!;
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Frame (Loss vs. Gain)
      </label>
      <select
        name="frame"
        required
        value={val}
        onChange={(e) => setVal(e.target.value as FrameValue)}
        className={`${inputCls} mt-1`}
      >
        {FRAMES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">{active.hint}</p>
    </div>
  );
}

function HookHintField({ initialValue }: { initialValue?: HookValue }) {
  const [val, setVal] = useState<string>(initialValue ?? "");
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        Hook-Pattern erzwingen{" "}
        <span className="text-xs font-normal text-slate-400">(optional)</span>
      </label>
      <select
        name="hookHint"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className={`${inputCls} mt-1`}
      >
        <option value="">— Auto-Rotation (empfohlen) —</option>
        {HOOKS.map((h) => (
          <option key={h.value} value={h.value}>
            {h.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">
        Leer lassen für orthogonale Diversifizierung über alle Varianten.
      </p>
    </div>
  );
}

function ImageSourceField({
  source,
  setSource,
  customImageUrl,
  setCustomImageUrl,
  uploading,
  setUploading,
  error,
  setError,
}: {
  source: ImageSource;
  setSource: (s: ImageSource) => void;
  customImageUrl: string;
  setCustomImageUrl: (s: string) => void;
  uploading: boolean;
  setUploading: (b: boolean) => void;
  error: string | null;
  setError: (s: string | null) => void;
}) {
  // A5 — vereinfacht: 1 Toggle (an/aus) + bei "an" zwei kleine Tabs Upload/URL.
  // Default ist immer "ai" (nur KI-Szene). Beim Aktivieren springt es auf "upload".
  const isOn = source !== "ai";
  const mode: "upload" | "url" = source === "url" ? "url" : "upload";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-preview", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? `Upload-Fehler (${res.status})`);
        setCustomImageUrl("");
      } else {
        setCustomImageUrl(json.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerk-Fehler.");
      setCustomImageUrl("");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={isOn}
          onChange={(e) => {
            if (e.target.checked) {
              setSource("upload");
            } else {
              setSource("ai");
              setCustomImageUrl("");
              setError(null);
            }
          }}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-700 focus:ring-slate-600"
        />
        <span>
          <span className="block text-sm font-medium text-slate-700">
            Produktbild einweben? <span className="font-normal text-slate-400">— optional</span>
          </span>
          <span className="block text-xs text-slate-500">
            Die Szene wird IMMER per KI generiert. Wenn aktiv, wird dein Produktbild
            nativ in die Szene komponiert (Nano Banana Multi-Image-Edit).
          </span>
        </span>
      </label>

      {isOn && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
          <div className="mb-2 inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs">
            {(["upload", "url"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setSource(m);
                  setError(null);
                }}
                className={
                  "rounded px-2.5 py-1 font-semibold transition " +
                  (mode === m
                    ? "bg-slate-700 text-white"
                    : "text-slate-800 hover:bg-slate-100")
                }
              >
                {m === "upload" ? "📤 Upload" : "🔗 URL"}
              </button>
            ))}
          </div>

          {mode === "upload" && (
            <div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={uploading}
                className="block w-full text-xs text-slate-700 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-800 hover:file:bg-slate-200 disabled:opacity-60"
              />
              {uploading && (
                <p className="mt-1 text-xs text-slate-700">⏳ Lädt hoch…</p>
              )}
              {!uploading && customImageUrl && (
                <div className="mt-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={customImageUrl}
                    alt="Upload-Preview"
                    className="h-16 w-16 rounded-md border border-slate-300 object-cover"
                  />
                  <span className="text-xs text-slate-700">
                    ✓ Wird in jede KI-Szene nativ eingewoben.
                  </span>
                </div>
              )}
            </div>
          )}

          {mode === "url" && (
            <div>
              <input
                type="url"
                value={customImageUrl}
                onChange={(e) => setCustomImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className={inputCls}
              />
              {customImageUrl && /^https?:\/\//i.test(customImageUrl) && (
                <div className="mt-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={customImageUrl}
                    alt="URL-Preview"
                    className="h-16 w-16 rounded-md border border-slate-300 object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <span className="text-xs text-slate-700">
                    Wird in jede KI-Szene nativ eingewoben.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-slate-600">{error}</p>}
    </div>
  );
}

function EmptyState({ pending }: { pending: boolean }) {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      {pending ? (
        <>
          <div className="text-3xl">⏳</div>
          <p className="mt-3 text-sm text-slate-600">
            Varianten werden parallel generiert…
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Je nach Anzahl 15–40 Sekunden.
          </p>
        </>
      ) : (
        <>
          <div className="text-3xl">✨</div>
          <p className="mt-3 text-sm font-medium text-slate-700">
            Fülle das Formular links aus
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Du bekommst N Varianten parallel — jede mit eigener Copy + eigenem Bild.
          </p>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Small helpers
// ===========================================================================
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-slate-600">{error}</p>}
    </div>
  );
}

function CharCountTextarea({
  maxLength,
  defaultValue,
  value: controlledValue,
  onChange: controlledOnChange,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { maxLength: number }) {
  const [internal, setInternal] = useState(
    typeof defaultValue === "string" ? defaultValue : "",
  );
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? String(controlledValue) : internal;
  return (
    <div className="relative">
      <textarea
        {...rest}
        maxLength={maxLength}
        value={value}
        onChange={(e) => {
          if (!isControlled) setInternal(e.target.value);
          controlledOnChange?.(e);
        }}
        className={inputCls}
      />
      <span
        className={
          "absolute bottom-1.5 right-2 text-[10px] tabular-nums " +
          (value.length > maxLength * 0.9 ? "text-slate-600" : "text-slate-400")
        }
      >
        {value.length}/{maxLength}
      </span>
    </div>
  );
}

function CharCountInput({
  maxLength,
  defaultValue,
  value: controlledValue,
  onChange: controlledOnChange,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { maxLength: number }) {
  const [internal, setInternal] = useState(
    typeof defaultValue === "string" ? defaultValue : "",
  );
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? String(controlledValue) : internal;
  return (
    <div className="relative">
      <input
        {...rest}
        maxLength={maxLength}
        value={value}
        onChange={(e) => {
          if (!isControlled) setInternal(e.target.value);
          controlledOnChange?.(e);
        }}
        className={inputCls}
      />
      <span
        className={
          "pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] tabular-nums " +
          (value.length > maxLength * 0.9 ? "text-slate-600" : "text-slate-400")
        }
      >
        {value.length}/{maxLength}
      </span>
    </div>
  );
}

const inputCls =
  "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700";
