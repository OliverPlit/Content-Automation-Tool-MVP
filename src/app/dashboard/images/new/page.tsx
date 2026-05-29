import { StandaloneImageForm } from "./standalone-form";

export default function StandaloneImagePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 rounded-2xl bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 px-6 py-7 text-white shadow-xl shadow-blue-900/20">
        <h1 className="text-3xl font-bold tracking-tight">🎨 Bild generieren</h1>
        <p className="mt-1 max-w-2xl text-sm text-blue-100">
          Generiere Bilder ohne Ad-Copy-Kontext. Output landet direkt in der
          Galerie und kannst du später jedem Creative zuweisen.
        </p>
      </header>

      <StandaloneImageForm />
    </div>
  );
}
