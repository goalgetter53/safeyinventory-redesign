# Performance Optimization Plan

Scope: audit and fix real bottlenecks across DB, data-fetching, and rendering. I'll skip theatre (Lighthouse score chasing, moment.js — we don't use it) and focus on changes that measurably help *this* app.

## 1. Database: indexes + RPCs (single migration)

**Add indexes** on FKs and hot filter columns that don't already exist:
- `raw_materials(vendor_id)`, `(material_type, is_blocked)`, `(purchase_date desc)`
- `part_batches(part_id)`, `(raw_material_batch_id)`, `(created_at desc)`
- `production_batches(product_id)`, `(production_date desc)`, `(status)`, `(created_at desc)`
- `production_batch_parts(production_batch_id)`, `(part_batch_id)`
- `wastage_logs(level, reference_id)`, `(created_at desc)`
- `alerts(is_read, created_at desc)`
- `production_plans(product_id, planned_date)`
- `product_bom(product_id)`

**Add RPC functions** (single round-trip replacements):
- `get_dashboard_kpis()` — returns totals for raw stock, finished goods, today's production, vendor/part/RM-batch counts, low-stock counts, today's wastage %. Replaces 6+ dashboard queries.
- `get_traceability_forward(p_raw_material_id uuid)` and `get_traceability_backward(p_production_batch_id uuid)` — recursive CTE returning full chain as JSONB. Replaces JS-side recursive fetches.
- `get_reports_summary(p_from date, p_to date)` — aggregates for the Reports screen.

All functions `SECURITY DEFINER`, `SET search_path = public`, `STABLE`, granted to `authenticated`.

## 2. React Query configuration

Global defaults in `src/router.tsx` QueryClient:
- `staleTime: 30_000`, `gcTime: 5*60_000`, `refetchOnWindowFocus: false`, `retry: 1`.

Per-query overrides:
- Reference data (vendors, parts, products, BOMs): `staleTime: 5*60_000`.
- Alerts unread badge: `refetchInterval: 60_000`.
- Paginated tables: `placeholderData: keepPreviousData`.

Query keys become filter-specific: `['raw_materials', { search, material, page }]`.

## 3. Query hygiene across screens

- Replace `select('*')` with explicit column lists on list views; keep `*` only for detail dialogs.
- Add server-side pagination `.range(from, to)` + `count: 'exact'` on: Raw Materials, Part Batches (parts detail), Production, Wastage/Reports, Alerts. Page size 25.
- Server-side search via `.ilike` / `.or()` on Raw Materials, Parts, Vendors, Production.
- Replace client-side JS aggregation on Dashboard with the `get_dashboard_kpis` RPC.
- Traceability screen: replace nested per-node fetches with the two RPCs above.
- Parallelize independent fetches with `Promise.all` where sequential today (Production wizard, Reports).

## 4. Component-level fixes

- Debounce search inputs (300 ms) via a small `useDebouncedValue` hook — applied to Raw Materials, Parts, Vendors, Production, Alerts search boxes.
- Virtualize long tables with `@tanstack/react-virtual` on Raw Materials, Production, Wastage/Reports, Alerts (only when row count > 50).
- Wrap heavy row components in `React.memo`; stabilize handler props with `useCallback` where they cross the memo boundary.
- Route-level code splitting is already automatic in TanStack Start; verify no route file `export`s its component (that defeats splitting) and fix any offenders.
- Reports: lazy-load Recharts via `React.lazy` on the chart panels only.
- Icons: audit for any barrel `import * as Icons from 'lucide-react'` — replace with named imports (lucide-react is already tree-shakeable when imported by name).

## 5. Realtime & alerts

- Alerts badge: switch from any table-wide subscription to a 60 s polled count query. Keep realtime only on the Alerts page itself, filtered to `is_read=false`, with `removeChannel` cleanup in `useEffect`.

## 6. Triggers

Current triggers already do minimal work (single UPDATE + one wastage log + conditional alert). I will NOT rewrite them — moving alerts out of the write path is more risk than reward here and the user hasn't reported write latency, only read latency. Documented as intentional non-change.

## 7. Verification

- `EXPLAIN ANALYZE` on the top 3 slowest queries via `supabase--slow_queries` before and after.
- Manually check Dashboard, Traceability, Reports, Raw Materials render times in the preview.
- Bundle: run `bun run build` and compare chunk sizes before/after (report in README).

## Technical details

**Files touched**
- New migration: indexes + 3 RPC functions (single `supabase--migration` call).
- `src/router.tsx` — QueryClient defaults.
- `src/hooks/use-debounced-value.ts` — new.
- `src/components/inventory/virtual-table.tsx` — new thin wrapper around `@tanstack/react-virtual`.
- `src/routes/_authenticated/dashboard.tsx` — use `get_dashboard_kpis` RPC.
- `src/routes/_authenticated/traceability.tsx` — use RPCs.
- `src/routes/_authenticated/raw-materials.tsx`, `parts.tsx`, `production.tsx`, `vendors.tsx`, `alerts.tsx`, `reports.tsx`, `production-planning.tsx`, `production.new.tsx` — column lists, pagination, debounce, keepPreviousData, memoization, parallel fetches.
- `src/routes/__root.tsx` — if it holds any global realtime subscription, tighten it.
- `package.json` — add `@tanstack/react-virtual`.
- `README.md` — document optimizations + before/after numbers.

**Out of scope (deliberate)**
- Trigger rewrite (not the bottleneck).
- Font subsetting, image compression (no user images / custom fonts in this project).
- HTTP/2, cache headers (handled by Lovable hosting).
- Bundle visualizer plugin (one-off local tool, not worth committing).

Approve to implement.
