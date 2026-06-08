import { StandaloneImageForm } from "./standalone-form";

export default function StandaloneImagePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          Bild generieren
        </h1>
        <p className="mt-1 text-[14px] text-[var(--color-muted)]">
          Eigenständige Bilder mit der vollen Generate-Pipeline: Persona-Hände,
          Gebinde-Maßstab, Produkt-Identity-Lock und natürlicher iPhone-Look.
          Output landet in der Galerie.
        </p>
      </header>

      <StandaloneImageForm />
    </div>
  );
}
