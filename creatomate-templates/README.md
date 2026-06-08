# Creatomate-Templates (animiert / Video)

Quell-JSONs für die Video-Templates dieses Tools. **Nicht** zur Laufzeit gelesen —
sie sind die Vorlage, die du **einmalig in Creatomate importierst**. Creatomate gibt
dir pro Template eine UUID; die trägst du in die passende Env-Var ein
(siehe Tabelle), und ab da rendert das Tool über diese UUID.

Brand: WODOIL (aus `/Beispiele` abgeleitet) — Gelb `#FFD400`, Navy `#0F172A`,
Headline-Font Oswald, Body Inter. Farben/Font werden beim Render aus den
Folder-Brand-Einstellungen überschrieben (Preset „WODOIL Gelb").

## Import in Creatomate

1. Creatomate-Dashboard → **Templates → New → Start from JSON** (bzw. im Editor
   oben rechts „</> JSON" → JSON einfügen → Save).
2. Inhalt der jeweiligen `.json` reinkopieren, Template speichern.
3. UUID aus der URL/dem Template kopieren.
4. UUID in `.env.local` **und** in Vercel unter der zugehörigen Env-Var setzen.
5. Fertig — das Format taucht im Render-Dropdown als „verfügbar" auf.

## Mapping: Datei → Slot → Env-Var

Slots/Env-Vars stammen aus `src/lib/creatomate/templates.ts` (`TEMPLATE_POOL`).

| Datei | Format | Kind | Slot | Env-Var | Dauer |
|---|---|---|---|---|---|
| `animated_default.json` | 1:1 (1080×1080) | `animatedSquare` | `animated_default` | `CREATOMATE_TEMPLATE_ANIMATED_SQUARE` | 5 s |
| `animated_zoom.json` | 1:1 (1080×1080) | `animatedSquare` | `animated_zoom` | `CREATOMATE_TEMPLATE_ANIMATED_ZOOM` | 5 s |
| `reel_default.json` | 9:16 (1080×1920) | `reelVertical` | `reel_default` | `CREATOMATE_TEMPLATE_REEL_VERTICAL` | 6 s |
| `reel_bold.json` | 9:16 (1080×1920) | `reelVertical` | `reel_bold` | `CREATOMATE_TEMPLATE_REEL_BOLD` | 6 s |
| `reel_ugc.json` | 9:16 (1080×1920) | `reelVertical` | `reel_ugc` | `CREATOMATE_TEMPLATE_REEL_UGC` | 6 s |
| `reel_1x1_default.json` | 1:1 (1080×1080) | `reel_1x1` | `reel_1x1_default` | `CREATOMATE_TEMPLATE_REEL_1X1` | 5 s |
| `reel_16x9_default.json` | 16:9 (1920×1080) | `reel_16x9` | `reel_16x9_default` | `CREATOMATE_TEMPLATE_REEL_16X9` | 6 s |

## Element-Namen (Pflicht — daran hängt die Injektion)

Der Render-Code (`render-actions.ts → modifications`) befüllt Elemente **per Name**.
Nicht umbenennen, sonst kommt der Inhalt nicht an:

| Element | Wird befüllt mit |
|---|---|
| `Headline` | Variant-Headline (Text) |
| `Subline` | Variant-Subline (Text) |
| `CTA` | Call-to-Action-Text |
| `Background` | KI-Bild der Variante (`fit: cover`) — Produkt ist hier bereits einkomponiert |
| `CTA-Box` / `Primary-Color` | Brand-Primärfarbe (`fill_color`) |
| `Accent-Color` | Brand-Akzentfarbe (`fill_color`) |

Zusätzlich überschreibbar, falls Folder-Brand gesetzt: `*.fill_color`,
`*.font_family`, `*.font_weight` auf `Headline`/`Subline`/`CTA` sowie
`Background-Color`/`Canvas.fill_color`.

**`Logo`** ist statischer Brand-Text („WODOIL") und wird **nicht** injiziert —
pro Brand im Creatomate-Editor anpassen oder löschen.

**Kein separates Produktbild-Overlay:** Die Templates enthalten bewusst **kein**
`ProductImage`-Element. Das Produkt steckt bereits im KI-`Background` — ein zweites
Overlay würde es doppelt zeigen. Der Render-Code sendet daher auch keine
`ProductImage`-Modification mehr.

## Animationen (Startpunkt)

- **Background**: Ken-Burns-Zoom über Keyframes auf `width`/`height`.
- **Headline**: `text-slide` / `text-scale` / `text-reveal` (split per Wort/Zeile).
- **CTA / CTA-Box**: Scale-Pop als End-Card (Sekunde 3–4).

Feintuning (Timing, Easing, Position) am besten visuell im Creatomate-Editor nach
dem Import. Die JSONs sind eine solide, on-brand Ausgangsbasis.
