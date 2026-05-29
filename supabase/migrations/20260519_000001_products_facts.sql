-- Phase B: Produkt-Faktenwerk (Single Source of Truth).
-- Fixt das Bild-Text-Mismatch-Problem: visualCues landen deterministisch
-- im Image-Prompt, certifications werden nur erwähnt wenn sie echt sind,
-- forbiddenForMachines blockt physikalisch falsche Kombinationen.

create table if not exists public.products (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references auth.users(id) on delete cascade,  -- NULL = global/seed
  name                   text not null,
  category               text not null check (category in (
    'hydraulik', 'getriebe', 'motor', 'fett', 'twoStroke', 'kompressor', 'kuehlung', 'sonst'
  )),
  visual_cues            text not null default '',
  certifications         text[] not null default '{}',
  oem_approvals          text[] not null default '{}',
  applicable_machines    text[] not null default '{}',
  forbidden_for_machines text[] not null default '{}',
  packaging_options      text[] not null default '{}',
  price_point            text not null default 'mid' check (price_point in ('value', 'mid', 'premium')),
  unique_claims          text[] not null default '{}',
  description            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists products_user_id_idx  on public.products (user_id);
create index if not exists products_category_idx on public.products (category);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

-- Owner OR global (user_id NULL) sind lesbar
drop policy if exists "products: owner or global can select" on public.products;
create policy "products: owner or global can select"
  on public.products for select
  using (user_id is null or auth.uid() = user_id);

drop policy if exists "products: owner can insert" on public.products;
create policy "products: owner can insert"
  on public.products for insert
  with check (auth.uid() = user_id);

drop policy if exists "products: owner can update" on public.products;
create policy "products: owner can update"
  on public.products for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "products: owner can delete" on public.products;
create policy "products: owner can delete"
  on public.products for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Optionale Verknüpfung: creative → product (für Konsistenz-Tracking)
-- ---------------------------------------------------------------------------
alter table public.creatives
  add column if not exists product_id uuid references public.products(id) on delete set null;

create index if not exists creatives_product_id_idx on public.creatives (product_id);

-- ---------------------------------------------------------------------------
-- Seeds: 6 WODOIL-Beispielprodukte (global, user_id NULL)
-- ---------------------------------------------------------------------------
insert into public.products (
  user_id, name, category, visual_cues, certifications, oem_approvals,
  applicable_machines, forbidden_for_machines, packaging_options, price_point, unique_claims, description
) values
  (null,
   'WODOIL Hydrauliköl HLP 46',
   'hydraulik',
   'yellow 60L drum with blue WODOIL label, dark amber hydraulic oil',
   ARRAY['DIN 51524-2 HLP', 'ISO VG 46', 'ISO 11158 HM'],
   ARRAY['Bosch Rexroth RDE 90220-1', 'Parker HF-0', 'Eaton/Vickers I-286-S'],
   ARRAY['landwirtschaft', 'werkstatt', 'industrie', 'bau'],
   ARRAY['motorrad'],
   ARRAY['5L', '20L', '60L Fass', '200L Fass', '1000L IBC'],
   'mid',
   ARRAY['1.500 Betriebsstunden Standzeit', '-30 °C kaltfließend', 'für Hydrauliksysteme bis 80 °C'],
   'Mehrbereichs-Hydrauliköl für Industrie-, Bau- und Landmaschinen.'),

  (null,
   'WODOIL Traktoren-Getriebeöl SAE 90',
   'getriebe',
   'red metal canister 5L with WODOIL label, dark gold gear oil',
   ARRAY['API GL-4', 'API GL-5', 'MIL-L-2105D'],
   ARRAY['ZF TE-ML 05A', 'John Deere J20A', 'Massey Ferguson M-1135'],
   ARRAY['landwirtschaft', 'lkw'],
   ARRAY['motorrad', 'werkstatt'],
   ARRAY['1L', '5L', '20L', '60L Fass'],
   'mid',
   ARRAY['kompatibel mit Nassbremsen', 'EP-Zusätze für hohe Drücke'],
   'Universal-Getriebeöl für Traktoren mit Nassbremsen-Systemen.'),

  (null,
   'WODOIL Hypo Gear 80W-90',
   'getriebe',
   'green 5L canister with yellow WODOIL stripe, dark amber gear oil',
   ARRAY['API GL-5', 'MIL-L-2105D'],
   ARRAY['ZF TE-ML 05A/12A/16B'],
   ARRAY['lkw', 'landwirtschaft', 'bau'],
   ARRAY['motorrad'],
   ARRAY['1L', '5L', '20L', '60L Fass'],
   'premium',
   ARRAY['für Hypoid-Achsen', 'EP-Performance bei Stoßbelastung'],
   'Hochleistungs-Hypoid-Getriebeöl für Lkw- und Schwermaschinen-Antriebe.'),

  (null,
   'WODOIL Motoröl 15W-40 Diesel',
   'motor',
   'silver 5L canister with red WODOIL accent, dark engine oil',
   ARRAY['API CI-4', 'ACEA E7', 'MB 228.3'],
   ARRAY['MAN M 3275', 'Volvo VDS-3', 'MTU Type 2'],
   ARRAY['lkw', 'landwirtschaft', 'bau'],
   ARRAY['motorrad'],
   ARRAY['5L', '20L', '60L Fass', '200L Fass'],
   'mid',
   ARRAY['für Diesel-Motoren mit/ohne Turbo', 'Long-Drain-Intervalle bis 60.000 km'],
   'Diesel-Mehrbereichs-Motoröl für Nutzfahrzeuge und Landmaschinen.'),

  (null,
   'WODOIL Universalfett EP-2',
   'fett',
   'small green 400g cartridge with WODOIL logo, beige lithium grease',
   ARRAY['DIN 51825 KP 2 K-30', 'ISO 12924'],
   ARRAY[]::text[],
   ARRAY['landwirtschaft', 'werkstatt', 'industrie', 'bau', 'lkw', 'winterdienst'],
   ARRAY['motorrad'],
   ARRAY['400g Kartusche', '1kg Dose', '5kg Hobbock', '50kg Fass'],
   'value',
   ARRAY['EP-Zusätze für Stoßbelastung', '-30 °C bis +130 °C Einsatzbereich'],
   'Lithium-EP-Universalfett für Lager, Gelenke und Schmierstellen.'),

  (null,
   'WODOIL Zweitakt-Öl Premium',
   'twoStroke',
   'small blue 1L bottle with red WODOIL label, light amber oil',
   ARRAY['JASO FD', 'ISO-L-EGD', 'API TC'],
   ARRAY['Stihl', 'Husqvarna', 'Honda'],
   ARRAY['motorrad', 'winterdienst'],
   ARRAY['landwirtschaft', 'lkw', 'bau', 'industrie'],
   ARRAY['100ml', '1L', '5L'],
   'premium',
   ARRAY['rauchfrei verbrennend', 'für luft- und wassergekühlte Motoren'],
   'Synthetisches Zweitaktöl für Motorsägen, Forstgeräte und Motorräder.')
on conflict do nothing;
