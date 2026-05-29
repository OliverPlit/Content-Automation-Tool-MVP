/**
 * Konstanten + Types für den Brand-Editor.
 * Eigenes Modul, weil folder-actions.ts „use server" trägt und Konstanten
 * dort nicht exportierbar sind.
 */

export type FolderBrand = {
  primaryColor: string | null;
  accentColor: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  fontFamily: string | null;
  fontWeight: string | null;
};

export const EMPTY_BRAND: FolderBrand = {
  primaryColor: null,
  accentColor: null,
  backgroundColor: null,
  textColor: null,
  fontFamily: null,
  fontWeight: null,
};

// Standard-Google-Fonts die Creatomate ootb unterstützt.
export const FONT_OPTIONS: { value: string; label: string; preview: string }[] =
  [
    { value: "Inter",            label: "Inter",            preview: "Aa · Sans · neutral" },
    { value: "Roboto",           label: "Roboto",           preview: "Aa · Sans · technisch" },
    { value: "Open Sans",        label: "Open Sans",        preview: "Aa · Sans · lesbar" },
    { value: "Lato",             label: "Lato",             preview: "Aa · Sans · warm" },
    { value: "Montserrat",       label: "Montserrat",       preview: "Aa · Sans · modern" },
    { value: "Poppins",          label: "Poppins",          preview: "Aa · Sans · geometrisch" },
    { value: "Raleway",          label: "Raleway",          preview: "Aa · Sans · elegant" },
    { value: "Oswald",           label: "Oswald",           preview: "Aa · Display · schmal" },
    { value: "Bebas Neue",       label: "Bebas Neue",       preview: "Aa · Display · plakativ" },
    { value: "Playfair Display", label: "Playfair Display", preview: "Aa · Serif · klassisch" },
    { value: "Merriweather",     label: "Merriweather",     preview: "Aa · Serif · journal" },
    { value: "DM Sans",          label: "DM Sans",          preview: "Aa · Sans · clean" },
  ];

export const WEIGHT_OPTIONS: { value: string; label: string }[] = [
  { value: "400", label: "400 Regular" },
  { value: "500", label: "500 Medium" },
  { value: "600", label: "600 Semibold" },
  { value: "700", label: "700 Bold" },
  { value: "800", label: "800 Extrabold" },
  { value: "900", label: "900 Black" },
];

// Preset-Paletten als Quick-Start
export const COLOR_PRESETS: {
  name: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
}[] = [
  {
    name: "WODOIL Gelb",
    primaryColor: "#FFD400",
    accentColor: "#0F172A",
    backgroundColor: "#FFFFFF",
    textColor: "#0F172A",
  },
  {
    name: "Premium Schwarz",
    primaryColor: "#0F172A",
    accentColor: "#FFD400",
    backgroundColor: "#0F172A",
    textColor: "#FFFFFF",
  },
  {
    name: "Klinisch Blau",
    primaryColor: "#1E40AF",
    accentColor: "#3B82F6",
    backgroundColor: "#F8FAFC",
    textColor: "#0F172A",
  },
  {
    name: "Werkstatt Orange",
    primaryColor: "#EA580C",
    accentColor: "#0F172A",
    backgroundColor: "#FAFAF9",
    textColor: "#1C1917",
  },
  {
    name: "Bio Grün",
    primaryColor: "#16A34A",
    accentColor: "#15803D",
    backgroundColor: "#F7FEE7",
    textColor: "#14532D",
  },
];

export function isValidHex(value: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value);
}
