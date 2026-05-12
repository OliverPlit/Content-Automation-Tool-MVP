/* Generate Projekt-Dokumentation.docx */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, ExternalHyperlink, PageBreak, PageNumber, Footer, Header,
  TableOfContents, Bookmark, InternalHyperlink,
} = require("docx");

const FONT = "Calibri";
const CODE_FONT = "Consolas";

// ---------- helpers ----------
const p = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: Array.isArray(text)
      ? text
      : [new TextRun({ text, font: FONT, size: 22, ...(opts.run ?? {}) })],
  });

const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, size: 36, font: FONT, color: "1F3864" })],
  });

const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, font: FONT, color: "2E74B5" })],
  });

const h3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, font: FONT, color: "1F3864" })],
  });

const bullet = (text, level = 0) =>
  new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 80 },
    children: Array.isArray(text) ? text : [new TextRun({ text, font: FONT, size: 22 })],
  });

const numbered = (text, level = 0) =>
  new Paragraph({
    numbering: { reference: "numbers", level },
    spacing: { after: 80 },
    children: Array.isArray(text) ? text : [new TextRun({ text, font: FONT, size: 22 })],
  });

const code = (text) => {
  const lines = text.split("\n");
  return lines.map(
    (line) =>
      new Paragraph({
        spacing: { after: 0 },
        shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
        children: [new TextRun({ text: line || " ", font: CODE_FONT, size: 20 })],
      }),
  );
};

const inlineCode = (text) =>
  new TextRun({ text, font: CODE_FONT, size: 22, color: "C7254E" });

const link = (text, url) =>
  new ExternalHyperlink({
    link: url,
    children: [new TextRun({ text, style: "Hyperlink", font: FONT, size: 22 })],
  });

const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const borders = { top: border, bottom: border, left: border, right: border };

const cell = (text, opts = {}) =>
  new TableCell({
    borders,
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.header
      ? { fill: "1F3864", type: ShadingType.CLEAR, color: "auto" }
      : { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            font: FONT,
            size: 22,
            bold: !!opts.header,
            color: opts.header ? "FFFFFF" : "000000",
          }),
        ],
      }),
    ],
  });

const table = (rows, widths) =>
  new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map(
      (row, i) =>
        new TableRow({
          children: row.map((text, j) => cell(text, { width: widths[j], header: i === 0 })),
        }),
    ),
  });

const pagebreak = () => new Paragraph({ children: [new PageBreak()] });

// ---------- content ----------
const children = [];

// Cover
children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 3000, after: 200 },
    children: [
      new TextRun({ text: "Content-Automation-Tool", bold: true, size: 56, font: FONT, color: "1F3864" }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [
      new TextRun({ text: "MVP — Entwickler-Dokumentation", size: 32, font: FONT, color: "595959" }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({ text: "Next.js 16 · Supabase · Vercel", size: 24, font: FONT, color: "808080" }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({ text: "Stand: 11. Mai 2026", size: 22, font: FONT, color: "808080" }),
    ],
  }),
  pagebreak(),
);

// 1. Projektüberblick
children.push(
  h1("1. Projektüberblick"),
  p("Das Content-Automation-Tool ist ein MVP für die KI-gestützte Generierung von Marketing-Creatives (Ads, Social-Posts, Landingpage-Texte). Dieses Dokument beschreibt den aktuellen Stand, die verwendeten Technologien und die wichtigsten Konzepte, die du als Entwickler verstanden haben solltest."),
  h2("Ziel des MVP"),
  bullet("Authentifizierte Nutzer können eigene Creatives erstellen und verwalten."),
  bullet("Creatives werden in Projekten gruppiert und können auf wiederverwendbaren Templates basieren."),
  bullet("Daten liegen in Supabase (Postgres + Auth + Row Level Security)."),
  bullet("Frontend in Next.js, deployed auf Vercel mit Auto-Deploy via GitHub."),
  h2("Architektur auf einen Blick"),
  ...code(
`┌─────────────┐    ┌────────────────┐    ┌─────────────┐
│  Browser    │ ─▶ │ Next.js (Vercel)│ ─▶ │  Supabase   │
│ (User)      │ ◀─ │  Server + RSC   │ ◀─ │ Postgres+RLS│
└─────────────┘    └────────────────┘    └─────────────┘
                          │
                          └──▶  GitHub (Source-of-Truth)`,
  ),
  pagebreak(),
);

// 2. Tech-Stack
children.push(
  h1("2. Tech-Stack"),
  p("Eine kurze Erklärung jeder eingesetzten Technologie und warum sie gewählt wurde."),
  table(
    [
      ["Bereich", "Technologie", "Warum"],
      ["Framework", "Next.js 16 (App Router)", "Server- und Client-Komponenten in einem Framework, Built-in Routing, Vercel-optimiert."],
      ["Sprache", "TypeScript 5", "Statische Typen verhindern Klassen von Bugs zur Compile-Zeit."],
      ["Styling", "Tailwind CSS v4", "Utility-First-CSS, schnelle UI-Entwicklung ohne Context-Switch in CSS-Dateien."],
      ["Auth & DB", "Supabase", "Hosted Postgres + Auth + Storage + Realtime, alles in einem SDK."],
      ["Hosting", "Vercel", "Auto-Deploy via GitHub, perfekt für Next.js, kostenloses Hobby-Tier."],
      ["Versionierung", "Git + GitHub", "Source-of-Truth, Auto-Deploy-Trigger, Code-Reviews."],
    ],
    [2200, 2800, 4360],
  ),
  h2("Versions-Snapshot"),
  ...code(
`Next.js          16.2.6
React            19.2.4
TypeScript       5.x
Tailwind CSS     4.x
@supabase/ssr    0.10.3
@supabase/supabase-js 2.105.4
Node.js          20.x (Vercel)
npm-Cache        D:\\npm-cache`,
  ),
  pagebreak(),
);

// 3. Was wurde gebaut
children.push(
  h1("3. Was bisher gebaut wurde"),
  p("Konkreter Status aller Module — geprüft am 11. Mai 2026."),
  table(
    [
      ["Modul", "Status", "Details"],
      ["GitHub-Repo", "✓ live", "OliverPlit/Content-Automation-Tool-MVP, Branch main"],
      ["Next.js-Scaffold", "✓ läuft", "App Router, TypeScript, Tailwind, ESLint"],
      ["Supabase-Projekt", "✓ live", "awrdjwqjhspzekcalqpa.supabase.co"],
      ["Vercel-Deploy", "✓ läuft", "content-automation-tool-mvp.vercel.app"],
      ["Email/Passwort-Auth", "✓ funktional", "Signup → check-email → Login → Dashboard"],
      ["Tabellen (3)", "✓ angelegt", "projects, templates, creatives mit RLS"],
      ["Dashboard-Layout", "✓ fertig", "Sidebar (5 Punkte) + Header mit Logout"],
      ["Generate-Backend", "○ offen", "Form-Stub vorhanden, noch kein LLM-Call"],
    ],
    [2800, 1500, 5060],
  ),
  h2("Auth-Flow"),
  numbered("Nutzer öffnet /signup, gibt Email + Passwort ein."),
  numbered("Server Action signup() in src/app/signup/actions.ts ruft supabase.auth.signUp()."),
  numbered("Supabase sendet Bestätigungsmail."),
  numbered("Nutzer klickt den Link → Callback in /auth/callback/route.ts tauscht code gegen Session-Cookie."),
  numbered("Login auf /login setzt Session-Cookie via supabase.auth.signInWithPassword()."),
  numbered("Middleware (src/middleware.ts) refresht die Session bei jeder Request und schützt /dashboard/*."),
  h2("Datenmodell"),
  table(
    [
      ["Tabelle", "Spalten (Kurz)", "RLS"],
      ["projects", "id, user_id, name, description, timestamps", "user_id = auth.uid()"],
      ["templates", "id, user_id (nullable), name, description, prompt_template, timestamps", "owner ODER user_id IS NULL (System-Templates)"],
      ["creatives", "id, user_id, project_id, template_id, prompt, output, status, timestamps", "user_id = auth.uid()"],
    ],
    [1800, 5400, 2160],
  ),
  pagebreak(),
);

// 4. Datei-Struktur
children.push(
  h1("4. Datei-Struktur"),
  p("Die wichtigsten Verzeichnisse und ihre Aufgabe."),
  ...code(
`D:\\Content-Tool
├── .env.local                  ← Supabase-Credentials (nicht in Git!)
├── .env.example                ← Vorlage ohne Werte
├── package.json                ← Dependencies + Scripts
├── next.config.ts              ← Next.js-Konfiguration
├── tsconfig.json               ← TypeScript-Konfiguration
├── tailwind.config / postcss   ← Tailwind v4 Setup
├── public/                     ← Statische Assets (Favicon, Bilder)
├── supabase/
│   └── migrations/
│       └── 20260511_..._init_core_tables.sql
├── src/
│   ├── middleware.ts           ← Auth-Gate für alle Routen
│   ├── app/                    ← App Router (Pages = Ordner mit page.tsx)
│   │   ├── layout.tsx          ← Root-Layout
│   │   ├── page.tsx            ← / → redirect zu /login oder /dashboard
│   │   ├── globals.css
│   │   ├── login/
│   │   │   ├── page.tsx        ← Login-Form
│   │   │   └── actions.ts      ← Server Action signInWithPassword
│   │   ├── signup/
│   │   │   ├── page.tsx
│   │   │   └── actions.ts
│   │   ├── auth/
│   │   │   ├── callback/route.ts  ← Email-Confirm-Handler
│   │   │   └── signout/route.ts   ← POST Logout
│   │   └── dashboard/
│   │       ├── layout.tsx      ← Auth-Check + Sidebar/Header
│   │       ├── page.tsx        ← Übersicht
│   │       ├── generate/page.tsx
│   │       ├── projects/page.tsx
│   │       ├── templates/page.tsx
│   │       └── library/page.tsx
│   ├── components/
│   │   └── dashboard/
│   │       ├── Sidebar.tsx     ← Navigation
│   │       └── Header.tsx      ← User-Email + Logout
│   └── lib/
│       └── supabase/
│           ├── client.ts       ← Browser-Client
│           ├── server.ts       ← Server-Client (mit cookies())
│           └── middleware.ts   ← Session-Refresh-Helper
└── docs/
    └── Projekt-Dokumentation.docx  ← (diese Datei)`,
  ),
  pagebreak(),
);

// 5. Supabase-Konzepte
children.push(
  h1("5. Supabase: Konzepte, die du verstehen musst"),
  h2("5.1 Postgres als Backend"),
  p("Supabase ist im Kern ein gehostetes Postgres mit zusätzlichen Services drumherum. Jede Tabelle, die du anlegst, ist eine normale SQL-Tabelle. Es gibt keinen Magic-Code-Layer dazwischen."),
  h2("5.2 Row Level Security (RLS)"),
  p("RLS ist der wichtigste Sicherheitsmechanismus. Es bedeutet: nicht der Application-Code entscheidet, was ein Nutzer sieht — die Datenbank selbst lehnt unautorisierte Queries ab."),
  p([
    new TextRun({ text: "Beispiel-Policy aus der Migration: ", font: FONT, size: 22 }),
  ]),
  ...code(
`alter table public.projects enable row level security;

create policy "projects: owner can select"
  on public.projects for select
  using (auth.uid() = user_id);`,
  ),
  p("Effekt: Selbst wenn jemand mit dem Anon-Key SELECT * FROM projects feuert, sieht er nur seine eigenen Zeilen. auth.uid() liest die User-ID aus dem JWT der Session."),
  h2("5.3 Auth"),
  bullet("Email/Passwort, Magic-Link, OAuth (Google, GitHub, …) — alles in supabase.auth."),
  bullet("Sessions werden als Cookies im Browser gespeichert. @supabase/ssr setzt diese Cookies serverseitig sauber."),
  bullet("auth.users ist eine echte Postgres-Tabelle in der auth-Schema. Foreign Keys aus public.* zeigen darauf."),
  h2("5.4 Migrations"),
  p("Schema-Änderungen werden als nummerierte SQL-Dateien im Repo abgelegt (supabase/migrations/). Vorteile: Versionierung, Code-Review, Reproduzierbarkeit, kein Klick-Chaos im Dashboard."),
  p("Workflow mit Supabase CLI:"),
  ...code(
`npx supabase login                                # einmalig
npx supabase link --project-ref awrdjwqjhspzekcalqpa  # einmalig
npx supabase migration new add_xyz                # neue Migration anlegen
# Datei editieren …
npx supabase db push                              # auf Server anwenden`,
  ),
  h2("5.5 Die zwei Keys"),
  table(
    [
      ["Key", "Wo verwendet", "Kann sehen", "In Frontend?"],
      ["anon (publishable)", "Client + Server", "Nur was RLS erlaubt", "JA (NEXT_PUBLIC_*)"],
      ["service_role", "Nur Backend / Admin", "ALLES, RLS-Bypass", "NIEMALS"],
    ],
    [2400, 2400, 2400, 2160],
  ),
  p("Im aktuellen Projekt verwenden wir ausschließlich den anon-Key. Service-Role kommt erst dazu, wenn ein Server-Job (z. B. eine Generierungs-Queue) Daten im Namen eines Nutzers anlegen muss."),
  pagebreak(),
);

// 6. Next.js-Konzepte
children.push(
  h1("6. Next.js 16 App Router: was anders ist"),
  p("Next.js 16 setzt voll auf den App Router. Wer von Pages-Router-Tutorials kommt, muss umdenken."),
  h2("6.1 Server Components (Default)"),
  p("Jede Datei in src/app/ ist standardmäßig eine Server Component. Sie wird auf dem Server gerendert, kein JavaScript landet im Browser für diese Komponente. Datenabruf passiert direkt in der Funktion:"),
  ...code(
`// src/app/dashboard/projects/page.tsx
import { createClient } from "@/lib/supabase/server";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name");
  return <div>{data?.length} Projekte</div>;
}`,
  ),
  p("Vorteile: weniger JS im Browser, direkter DB-Zugriff, kein useState/useEffect-Boilerplate."),
  h2("6.2 Client Components"),
  p('Wenn du Interaktivität brauchst (onClick, useState), markierst du die Datei oben mit "use client". Beispiel: ein Formular mit Live-Validierung oder ein Modal.'),
  h2("6.3 Server Actions"),
  p('Funktionen mit "use server" laufen auf dem Server, können aber aus Client-Komponenten oder Formularen direkt aufgerufen werden. Kein eigener API-Endpoint nötig:'),
  ...code(
`// src/app/login/actions.ts
"use server";
export async function login(formData: FormData) {
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  redirect("/dashboard");
}

// src/app/login/page.tsx
<form action={login}>…</form>`,
  ),
  h2("6.4 Middleware"),
  p("src/middleware.ts läuft VOR jeder Request, noch bevor die Page-Funktion gerendert wird. Wir nutzen sie, um (1) die Supabase-Session zu refreshen und (2) /dashboard/* zu schützen."),
  ...code(
`export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};`,
  ),
  p("Hinweis: Next.js 16 zeigt einen Deprecation-Warnhinweis — die Datei wird künftig proxy.ts heißen. Funktion bleibt identisch."),
  h2("6.5 Route-Handler"),
  p("Dateien namens route.ts (statt page.tsx) sind reine API-Endpoints. Wir nutzen sie für /auth/callback und /auth/signout, weil diese keine UI rendern."),
  h2("6.6 Daten-Konventionen"),
  bullet([
    inlineCode("async"),
    new TextRun({ text: "-Komponenten dürfen ", font: FONT, size: 22 }),
    inlineCode("await"),
    new TextRun({ text: " benutzen — kein useEffect für DB-Reads.", font: FONT, size: 22 }),
  ]),
  bullet([
    inlineCode("cookies()"),
    new TextRun({ text: " und ", font: FONT, size: 22 }),
    inlineCode("headers()"),
    new TextRun({ text: " aus next/headers sind in Next.js 16 async — also ", font: FONT, size: 22 }),
    inlineCode("await cookies()"),
    new TextRun({ text: ".", font: FONT, size: 22 }),
  ]),
  bullet([
    inlineCode("searchParams"),
    new TextRun({ text: " und ", font: FONT, size: 22 }),
    inlineCode("params"),
    new TextRun({ text: " sind ebenfalls Promises — destrukturieren erst nach ", font: FONT, size: 22 }),
    inlineCode("await"),
    new TextRun({ text: ".", font: FONT, size: 22 }),
  ]),
  pagebreak(),
);

// 7. Deployment-Workflow
children.push(
  h1("7. Deployment-Workflow"),
  h2("7.1 Lokal entwickeln"),
  ...code(
`cd D:\\Content-Tool
npm run dev          # Dev-Server auf http://localhost:3000
npm run build        # Production-Build lokal testen
npm run lint         # ESLint`,
  ),
  h2("7.2 Auf GitHub pushen"),
  ...code(
`git add -A
git commit -m "feat: kurze Beschreibung"
git push origin main`,
  ),
  h2("7.3 Vercel Auto-Deploy"),
  numbered("Vercel beobachtet das GitHub-Repo. Jeder Push auf main triggert einen Production-Build."),
  numbered("Build-Logs siehst du im Vercel-Dashboard unter Deployments."),
  numbered("Bei Push auf andere Branches entsteht ein Preview-Deployment mit eigener URL."),
  h2("7.4 Environment-Variablen"),
  p("Vercel-Dashboard → Projekt → Settings → Environment Variables. Wichtig:"),
  bullet("Variablen müssen für Production, Preview und Development gleichzeitig gesetzt sein."),
  bullet("Nach Änderung MUSS redeployt werden — bestehende Deployments lesen Vars nicht neu ein."),
  bullet("NEXT_PUBLIC_* ist im Browser-Bundle sichtbar. Niemals Service-Role-Keys mit diesem Prefix!"),
  h2("7.5 Drei URLs verstehen"),
  table(
    [
      ["URL-Typ", "Beispiel", "Wann genutzt"],
      ["Local Dev", "http://localhost:3000", "Aktive Entwicklung"],
      ["Production", "content-automation-tool-mvp.vercel.app", "Was Nutzer sehen, letzter main-Commit"],
      ["Preview", "...-xyz123.vercel.app", "Pro Branch/Push, oft passwortgeschützt"],
    ],
    [2000, 4360, 3000],
  ),
  pagebreak(),
);

// 8. Nächste Schritte + Lernen
children.push(
  h1("8. Nächste Schritte"),
  h2("8.1 Sofort-Quickwins"),
  bullet("Email-Confirmation in Supabase für Dev deaktivieren (Auth → Providers → Email → Confirm OFF)."),
  bullet("Site-URL in Supabase auf http://localhost:3000 setzen, damit Confirm-Links lokal funktionieren."),
  bullet("Projects/Templates anlegbar machen (Server Action + Insert)."),
  h2("8.2 Mittlere Features"),
  bullet("LLM-Integration im Generate-Formular (OpenAI/Anthropic SDK, Server Action, write to creatives.output)."),
  bullet("Library-Page filterbar machen (nach Projekt, Status, Datum)."),
  bullet("Templates-Marketplace: System-Templates seeden (user_id IS NULL)."),
  h2("8.3 Architektur-Themen"),
  bullet("Background-Jobs für lange LLM-Calls (Vercel Cron oder Supabase Edge Functions)."),
  bullet("File-Upload für Brand-Assets via Supabase Storage."),
  bullet("Stripe für Plan-Limits, sobald monetarisiert wird."),
  h1("9. Lernressourcen"),
  h2("Next.js App Router"),
  p([link("Next.js Learn — App Router", "https://nextjs.org/learn")]),
  p([link("Server Components Doku", "https://nextjs.org/docs/app/getting-started/server-and-client-components")]),
  p([link("Server Actions Doku", "https://nextjs.org/docs/app/getting-started/updating-data")]),
  h2("Supabase"),
  p([link("Supabase + Next.js Quickstart", "https://supabase.com/docs/guides/getting-started/quickstarts/nextjs")]),
  p([link("Row Level Security Erklärung", "https://supabase.com/docs/guides/database/postgres/row-level-security")]),
  p([link("Auth-Doku", "https://supabase.com/docs/guides/auth")]),
  h2("Tailwind CSS v4"),
  p([link("Tailwind v4 Doku", "https://tailwindcss.com/docs")]),
  h2("TypeScript"),
  p([link("TypeScript Handbook", "https://www.typescriptlang.org/docs/handbook/intro.html")]),
  h2("Vercel"),
  p([link("Vercel Deployment Doku", "https://vercel.com/docs/deployments")]),
  h2("Empfohlene YouTube-Channels"),
  bullet("Theo - t3.gg (Next.js, Supabase, TypeScript-Stack)"),
  bullet("Lee Robinson (offizieller Next.js-Advocate, Vercel)"),
  bullet("Web Dev Cody (kompakte Tutorials, oft App Router)"),
  bullet("Supabase YouTube (offizielle Tutorials, RLS-Deep-Dives)"),
  h1("10. Glossar"),
  table(
    [
      ["Begriff", "Bedeutung"],
      ["RSC", "React Server Component — rendert serverseitig, kein JS im Browser."],
      ["RLS", "Row Level Security — Postgres-Feature, das Zeilenzugriff pro User regelt."],
      ["JWT", "JSON Web Token — die Session, die Supabase ausstellt und im Cookie speichert."],
      ["Anon Key", "Publik teilbarer API-Key, durch RLS geschützt."],
      ["Service Role", "Admin-Key, umgeht RLS — nur serverseitig nutzen."],
      ["Server Action", "Async-Funktion mit \"use server\", aufrufbar aus Forms/Client."],
      ["Middleware", "Code, der vor jeder Route läuft — hier für Auth-Gate."],
      ["Migration", "Versionierte SQL-Datei, die Schema-Änderungen beschreibt."],
      ["Preview-Deployment", "Vercel-Build pro Branch/PR mit eigener URL."],
      ["DXA", "1/1440 Inch — Längeneinheit in OOXML, irrelevant für App, nur für diese Doku."],
    ],
    [2400, 6960],
  ),
);

// ---------- document assembly ----------
const doc = new Document({
  creator: "Content-Automation-Tool",
  title: "Projekt-Dokumentation",
  description: "Entwickler-Doku für das Content-Automation-Tool MVP",
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal",
        quickFormat: true,
        run: { font: FONT, size: 36, bold: true, color: "1F3864" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal",
        quickFormat: true,
        run: { font: FONT, size: 28, bold: true, color: "2E74B5" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal",
        quickFormat: true,
        run: { font: FONT, size: 24, bold: true, color: "1F3864" },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
        ],
      },
      {
        reference: "numbers",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Content-Automation-Tool — Entwickler-Doku — Seite ", font: FONT, size: 18, color: "808080" }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: "808080" }),
                new TextRun({ text: " / ", font: FONT, size: 18, color: "808080" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: "808080" }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  const outPath = path.join(__dirname, "Projekt-Dokumentation.docx");
  fs.writeFileSync(outPath, buf);
  console.log("OK:", outPath, "Size:", buf.length, "bytes");
});
