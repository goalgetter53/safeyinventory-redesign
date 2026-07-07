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
