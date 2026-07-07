# Inventory & Production Traceability System

A production-grade traceability app covering Vendors → Raw Materials → Parts → Production → Finished Goods, with wastage tracking, alerts, planning, and recall.

## Stack notes (small deviations from spec)

- This project is **TanStack Start** (not plain Vite + React Router). Routing will use TanStack Router (file-based under `src/routes/`). Everything else (TanStack Query, Tailwind, shadcn/ui, Recharts, RHF+Zod, Supabase JS, date-fns, lucide) matches the spec exactly.
- Supabase is already connected — no env setup required. Auth uses the integration-managed `_authenticated` layout; protected screens live under `src/routes/_authenticated/`, public `/auth` for login/signup.
- "Inter" font will be loaded via `<link>` in `__root.tsx` head (Tailwind v4 rule).

## Database (single migration)

All 11 tables exactly as specified, with:
- Enums enforced via CHECK constraints as written
- Generated columns (`total_cost`, `wastage_kg`, `wastage_percentage`) as written
- All indexes as written
- RLS enabled + `FOR ALL TO authenticated USING (true) WITH CHECK (true)` policies
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` on every public table (required by Supabase)

**Triggers / functions** (all in the same migration):
- `generate_batch_number(kind, code)` — atomic sequence-per-prefix via `pg_advisory_xact_lock`, produces `PC-001`, `CAP-B001`, `B001`, `PLAN-YYYYMMDD-001`
- `trg_part_batch_after_insert` — deducts raw material remaining, adds to part stock, inserts wastage_log, raises `high_wastage_part` (>10%) and `low_stock_raw` (<50 kg) alerts
- `trg_production_batch_after_insert` — validates + deducts part stock per junction row (raises exception on shortage → transaction rollback), deducts optional additional raw material, inserts product-level wastage_log, raises `high_wastage_product` alert
- `trg_raw_material_block_cascade` — when `is_blocked` flips true, cascades to `part_batches.is_blocked` and `production_batches.status='recalled'`, inserts summary alert

Batch numbers are generated in a `BEFORE INSERT` trigger if the caller leaves the field null, so the client just omits it.

## Seed data

Inserted via a follow-up data migration (insert tool): 3 vendors, 4 parts, 2 products with BOMs, 6 raw material batches (dates spread across last 60 days), 4 part batches, 2 production batches with junctions, 3 alerts. Wastage logs and stock updates come from the triggers automatically.

## Route structure

```text
src/routes/
  __root.tsx                          shell, providers, sonner Toaster, global head
  auth.tsx                            login + signup tabs (public)
  _authenticated/
    route.tsx                         (integration-managed gate)
    layout.tsx                        AppShell: sidebar + header + global search
    index.tsx                         Dashboard
    vendors.tsx
    raw-materials.tsx
    parts.tsx
    products.tsx
    products.$id.bom.tsx              BOM editor
    production.tsx                    list + wizard entry
    production.new.tsx                4-step wizard
    production-planning.tsx
    traceability.tsx
    reports.tsx                       tabs: wastage / monthly / stock
    alerts.tsx
    batch-recall.tsx
    settings.tsx
```

## Feature coverage

Every screen from the brief is implemented as described:

- **Dashboard** — 4 KPI cards (raw stock w/ 7-day trend, finished goods, today's production, today's wastage% color-coded), Low Stock panel, Recent Activity, quick actions.
- **Vendors** — table with material badges, parts-supplied count, search + material filter, add/edit modal, view modal with recent batches.
- **Raw Materials** — filters (type/vendor/date/show blocked), progress bars on remaining, add modal (vendor list filtered by `materials_supplied` array), details modal with Usage/Trace-Forward/Wastage tabs.
- **Parts** — table with expandable batch panel, add/edit, details modal, "Produce this Part" launches the 4-step Part Production Flow (Quantity → RM batch FIFO → Actual usage + reason → Review).
- **Products** — card grid, add/edit, dedicated BOM editor route (two-column available/selected, transactional replace).
- **Production** — recent table + Start Production wizard: Product/Qty → Requirements (shortage banner + inline Create Missing Parts) → Part batch allocation (FIFO auto-distribute, override allowed) → Final entry (optional extra raw material, wastage reason, confirmation) → success modal.
- **Production Planning** — generate plan, parts + raw-material shortage tables, save to `production_plans`, history table, links to fix shortages.
- **Traceability** — search with autocomplete across all batch types, backward + forward trace, indented tree with CSS connector borders, wastage summary, Recall action.
- **Reports** — Wastage (bar by reason + line trend + table + CSV), Monthly Production (stacked bar per product per day + table + CSV), Stock (RM + Parts + Finished Goods + combined CSV).
- **Alerts** — filter tabs, severity icons, mark-read (single + all), realtime subscription updates sidebar badge, click-through navigation.
- **Batch Recall** — RM dropdown + reason + trace, cascading tree, "Mark All Affected as Recalled" (single transaction via the block-cascade trigger), CSV export, history table.
- **Settings** — thresholds, wastage % threshold, currency, factory name (stored in a small `app_settings` singleton table added to the migration).
- **Onboarding** — first-login 3-step welcome modal, dismissal stored in `localStorage`.

## Global concerns

- Auth: Supabase email/password on `/auth`, session via `supabase.auth`, `_authenticated` gate redirects to `/auth`, header avatar shows email + logout with proper cache teardown.
- Global search: debounced query over vendors/RM/parts/products, grouped dropdown, navigates to entity.
- Toasts: sonner, color-coded, spec durations.
- Loading: shadcn `Skeleton` matching final shape everywhere.
- Empty states: icon + message + primary CTA on every list.
- Errors: try/catch around every mutation with toast; inline Zod errors; root 404; network-lost banner via `navigator.onLine` + retry.
- Confirmations: shadcn AlertDialog on all destructive actions; recall requires typed `RECALL` confirmation.
- Console audit log on every mutation.
- Responsive: sidebar → sheet on mobile, tables → stacked cards <768px, modals → full-screen sheets on mobile, KPI cards stack.

## Design tokens

`src/styles.css` updated with the exact palette (converted to oklch-compatible values while keeping the hex spec as reference comments), Inter loaded via `<link>`, typography scale, sidebar tokens tuned to the deep-industrial-blue primary.

## Deliverables

- Working app across all 11 screens with real Supabase reads/writes
- Migration file (schema + triggers + grants + RLS)
- Seed inserted via data migration
- README with setup, workflow, schema, calculation test cases, troubleshooting
- No console errors, no mock data, no stubs

## Scope check before building

This is a very large build (11 screens, 11 tables, wizards, triggers, reports, recall cascade). I'll implement it end-to-end in one pass, but expect the work to land across many file writes. If you'd like me to sequence differently (e.g. ship DB + auth + core CRUD first, then wizard/planning/recall/reports as a second pass) say so — otherwise I'll build everything.
