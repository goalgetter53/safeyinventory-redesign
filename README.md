# Inventory & Production Traceability System

Production-grade traceability for a small manufacturing unit: **Vendor → Raw Material → Part → Production → Finished Product**, with wastage tracking, low-stock alerts, batch recall, planning, and reporting.

## Stack

- **Frontend**: React 19 + TanStack Start (Vite 7), TanStack Router (file-based), TanStack Query, Tailwind v4, shadcn/ui, Recharts, react-hook-form + Zod, date-fns, lucide-react
- **Backend**: Supabase (Postgres + Auth + RLS). No mock data, no local JSON, no serverless functions — everything is real DB reads/writes.

## Architecture

```
Browser ── Supabase JS client (publishable key + user session)
           │
           ▼
Supabase Postgres (RLS: authenticated users can do all)
   ├─ Tables: vendors, raw_materials, parts, part_batches,
   │           products, product_bom, production_batches,
   │           production_batch_parts, wastage_logs, alerts,
   │           production_plans, app_settings
   └─ Triggers (single migration):
       ├─ generate batch numbers (PC-001, CAP-B001, B001, PLAN-YYYYMMDD-001)
       ├─ deduct raw material + increase part stock on part_batch insert
       ├─ deduct part stock on production_batch_parts insert (rollback on shortage)
       ├─ log wastage + raise low-stock / high-wastage alerts
       └─ cascade block on raw material recall
```

## Local dev

```bash
bun install
bun run dev
```

The Supabase URL / anon key are injected as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. No `.env` setup required on this project.

## Supabase setup (standalone)

1. Create a project at supabase.com.
2. Run the migration in `supabase/migrations/` (auto-applied by Lovable Cloud on this project).
3. Optional: run the seed inserts documented in this repo (already applied on the connected project).
4. RLS is enabled on all tables with policies granting all operations to `authenticated`.

## Workflow

1. **Add a vendor** — capture supplier, phone, address, materials supplied.
2. **Add raw material batch** — picks from vendors that supply the chosen material; batch number auto-generated (`PC-003`, etc).
3. **Add a part** and define its material + kg/unit.
4. **Produce a part batch** — pick FIFO source raw material batch, enter actual usage, wastage auto-computed and logged. Raw stock deducted, part stock increased.
5. **Add a product** and its BOM (parts + quantities per unit).
6. **Plan production** (optional) — see shortages before committing.
7. **Start production** — wizard calculates part requirements → allocates FIFO → optional extra raw material → confirmation → creates batch. Triggers deduct part stock and roll back if shortage.
8. **Traceability** — search any batch for full backward + forward chain.
9. **Batch recall** — block a raw material; cascade blocks part batches and marks production batches recalled.
10. **Reports** — wastage over time, monthly production, stock snapshot; all exportable to CSV.

## Calculation test cases

| Case | Inputs | Expected |
|---|---|---|
| Part wastage | 2000 caps × 0.05 kg/unit, actual 102 kg | expected 100 kg, wastage 2 kg (2%) |
| High wastage alert | wastage% > `wastage_alert_threshold` (default 10) | `high_wastage_part` alert inserted |
| Low stock alert | raw material remaining < 50 kg after deduction | `low_stock_raw` alert inserted |
| Production shortage | required > current_stock | transaction rolls back with clear error |
| Recall cascade | raw material `is_blocked = true` | all part_batches from it blocked; all production_batches using them → status `recalled`; summary alert inserted |

## Screens

Dashboard · Vendors · Raw Materials · Parts (with expandable batch panel) · Products (grid + BOM editor route) · Production (list + 4-step wizard) · Production Planning · Traceability · Reports (Wastage / Monthly / Stock) · Alerts (with realtime badge) · Batch Recall · Settings.

## Troubleshooting

- **Signed out unexpectedly**: session lives in `localStorage`. Clearing site data logs you out.
- **"Insufficient stock" error during production**: expected — the DB trigger rolls back the whole transaction. Produce more parts and retry.
- **Batch number blank in form**: intentional — the DB trigger generates it on insert.

## Deployment

- **Lovable**: click Publish.
- **Elsewhere**: any TanStack Start-compatible host (Cloudflare Workers, Node, etc). Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at build time.

## Performance optimizations (2026-07-07)

### Database
- Added composite/missing indexes: `raw_materials(material_type, is_blocked)`, `raw_materials(purchase_date desc)`, partial index on `raw_materials(is_blocked) WHERE NOT is_blocked`, `part_batches(created_at desc)`, `production_batches(status)`, `production_batches(created_at desc)`, `wastage_logs(level, reference_id)`, `wastage_logs(created_at desc)`, `production_plans(product_id, planned_date desc)`, `production_plans(created_at desc)`.
- Three new `SECURITY DEFINER STABLE` RPCs replace multi-round-trip client patterns:
  - `get_dashboard_kpis()` — 1 call returns 15 KPIs (was 6 parallel table scans + JS aggregation).
  - `get_traceability_forward(uuid)` and `get_traceability_backward(uuid)` — 1 call each returns full vendor → RM → part → production chain as JSONB.

### React Query
- Global defaults: `staleTime: 30s`, `gcTime: 5min`, `refetchOnWindowFocus: false`, `retry: 1`.
- Reference-data queries (vendors, parts, active products): `staleTime: 5min`.
- Alerts unread badge switched from realtime subscription + 30s poll to a 60s poll (removes an always-open realtime channel that fired on every alert insert anywhere in the app).

### Client
- Debounced global header search and Traceability search (300 ms) — was firing 3–4 Supabase requests per keystroke.
- Debounced Vendor list filter.
- Raw Materials list: explicit column projection instead of `select('*')`.
- Production wizard and Planning: explicit column projection on Products dropdown.

### Deliberately skipped
- Trigger rewrite: current triggers do a single UPDATE + a conditional insert; slow-query stats show writes ≤50 ms, so moving alert inserts out of the write path adds risk without payoff.
- Table virtualization: dataset sizes stay small in practice; a 25/page cap on the reports and history views is enough.
- Recharts lazy-load / bundle visualizer: current bundle is dominated by React + shadcn primitives; splitting Recharts saves <30 KB gzipped and adds a load spinner. Revisit if the app grows.

### How to verify
- Dashboard load: single `rpc('get_dashboard_kpis')` call in the Network tab, replacing 6 parallel `from(...)` requests.
- Header/Traceability search: only one request per typing pause, not one per keystroke.
- Slow queries: `supabase--slow_queries` still shows all reads under 10 ms after seed data.
