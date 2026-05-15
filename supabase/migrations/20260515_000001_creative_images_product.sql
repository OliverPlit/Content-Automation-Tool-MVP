-- Optional separates Produkt-Bild pro Variante. Wird beim Render an Creatomate
-- als zusätzliche Modification "ProductImage" geschickt und kann im Template
-- über dem Background gelayert werden (z.B. Öl-Kanister auf Traktor-Szene).

alter table public.creative_images
  add column if not exists product_image_url text;
