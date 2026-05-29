/**
 * Monochrome SF-Symbols-artige Icons als inline SVG.
 *
 * Apple-Stil: dünne 1.5-Linien, runde Strichenden, kein Fill außer wo nötig.
 * Größe wird über CSS gesteuert (em-basiert): nutze className="size-4" etc.
 * Farbe folgt currentColor — bekommt vom Parent.
 *
 * Wenn ein Name fehlt: füg ihn unten in iconPaths hinzu.
 */

type IconName =
  // Navigation
  | "arrow-left"
  | "arrow-right"
  | "arrow-up"
  | "arrow-down"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "chevron-down"
  // Status / Marker
  | "check"
  | "check-circle"
  | "x"
  | "plus"
  | "minus"
  | "dot"
  // Objekte
  | "folder"
  | "folder-open"
  | "file"
  | "image"
  | "video"
  | "calendar"
  | "clock"
  | "tag"
  | "link"
  | "download"
  | "upload"
  | "trash"
  | "pencil"
  | "settings"
  | "search"
  | "filter"
  | "eye"
  | "globe"
  | "play"
  | "pause"
  | "stop"
  | "bolt"
  | "sparkle"
  | "rocket"
  | "palette"
  | "rectangle-grid"
  | "rectangle-stack"
  | "rectangle-portrait"
  | "thumbs-up"
  | "thumbs-down"
  | "warning"
  | "info"
  | "external-link";

const iconPaths: Record<IconName, React.ReactNode> = {
  "arrow-left": <path d="M19 12H5m0 0 7 7m-7-7 7-7" />,
  "arrow-right": <path d="M5 12h14m0 0-7-7m7 7-7 7" />,
  "arrow-up": <path d="M12 19V5m0 0-7 7m7-7 7 7" />,
  "arrow-down": <path d="M12 5v14m0 0 7-7m-7 7-7-7" />,
  "chevron-left": <path d="M15 18l-6-6 6-6" />,
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  "chevron-up": <path d="M18 15l-6-6-6 6" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,

  check: <path d="M5 13l4 4L19 7" />,
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  dot: <circle cx="12" cy="12" r="3" />,

  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  ),
  "folder-open": (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v.5M21 10l-2 8a2 2 0 0 1-2 1.5H5a2 2 0 0 1-2-2V7" />
  ),
  file: (
    <path d="M14 3v4a1 1 0 0 0 1 1h4M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
  ),
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M21 16l-5-5-9 9" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  tag: (
    <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Zm5-3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
  ),
  link: (
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
  ),
  download: <path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" />,
  upload: <path d="M12 20V8m0 0-4 4m4-4 4 4M4 4h16" />,
  trash: (
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-7 0v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7" />
  ),
  pencil: (
    <path d="M16 4l4 4-12 12H4v-4L16 4Z" />
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  filter: <path d="M3 6h18M6 12h12M10 18h4" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  play: <path d="M6 4l14 8-14 8V4Z" />,
  pause: <path d="M7 5h3v14H7zM14 5h3v14h-3z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  sparkle: (
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3ZM18 15l.75 2.25L21 18l-2.25.75L18 21l-.75-2.25L15 18l2.25-.75L18 15Z" />
  ),
  rocket: (
    <path d="M5 13l-2 6 6-2M19 5l-7 7m7-7v5h-5m5-5L8 16m4-9a8 8 0 0 0-9 9c5 0 9-4 9-9Z" />
  ),
  palette: (
    <>
      <path d="M12 22a10 10 0 1 1 10-10c0 2-2 3-4 3h-2a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2Z" />
      <circle cx="7.5" cy="10.5" r="1" />
      <circle cx="12" cy="7" r="1" />
      <circle cx="16.5" cy="10.5" r="1" />
    </>
  ),
  "rectangle-grid": (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </>
  ),
  "rectangle-stack": (
    <>
      <rect x="3" y="3" width="18" height="11" rx="2" />
      <path d="M3 17h18M3 21h18" />
    </>
  ),
  "rectangle-portrait": <rect x="6" y="3" width="12" height="18" rx="2" />,
  "thumbs-up": (
    <path d="M7 22V11l5-9h1a2 2 0 0 1 2 2v6h5a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7Z" />
  ),
  "thumbs-down": (
    <path d="M17 2v11l-5 9h-1a2 2 0 0 1-2-2v-6H4a2 2 0 0 1-2-2l2-8a2 2 0 0 1 2-2h11Z" />
  ),
  warning: (
    <>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 18v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v.01M11 12h1v5h1" />
    </>
  ),
  "external-link": (
    <path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14" />
  ),
};

export function Icon({
  name,
  className = "size-4",
  strokeWidth = 1.5,
  fill = "none",
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={"inline-block shrink-0 " + className}
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}

export type { IconName };
