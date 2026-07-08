# safeyinventory — Traceability & Production

Production-grade traceability for a small manufacturing unit: **Vendor → Raw Material → Part → Production → Finished Product**, with wastage tracking, low-stock alerts, batch recall, planning, reporting, and per-item history.

> Repo: https://github.com/goalgetter53/safeyinventory-redesign.git
> Local dev: http://localhost:8080 (port auto-falls forward if busy)

---

## What it does

A workshop buys raw materials (PC / POM / PP / TPE pellets), produces parts from them, then assembles parts into finished products. Every unit of finished good can be traced:

- **Forward**: raw material batch → which part batches it produced → which production runs consumed those parts → which finished batches
- **Backward**: finished batch → which parts it consumed → which part batches → which raw material batches → which vendor

Cuts also: wastage logging per batch, FIFO part allocation, automatic stock alerts, batch recall cascades, planning vs. production separation.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **TanStack Start** (Vite 8) | File-based routing, SSR-capable, React Query first |
| UI | **React 19** + **Tailwind v4** | Internal-app aesthetic, neutral grays, Inter font, tabular numerics, hairline borders |
| Components | **shadcn/ui** + Radix primitives | Accessible, unstyled, copy-paste owned |
| Data fetching | **TanStack Query v5** | Caching, invalidation, mutations |
| DB / Auth | **Supabase** (Postgres + RLS + Auth) | Serverless Postgres with realtime + edge functions |
| Forms | **react-hook-form** + **zod** | Type-safe validation |
| Charts | **recharts** (lazy-loaded in /reports) | ~90 KB gzipped, deferred until user opens reports |
| Icons | **lucide-react** | Tree-shakable, consistent |
| Toasts | **sonner** | Minimal, rich colors |
| Date | **date-fns** | Tree-shakable formatting |

---

## Project layout

```
safeyinventory/
├── supabase/
│   ├── config.toml                    — Supabase project config
│   └── migrations/
│       ├── 20260707142138_*.sql       — Schema: vendors, raw_materials, parts,
│       │                                 part_batches, products, product_bom,
│       │                                 production_batches, production_batch_parts,
│       │                                 production_plans, wastage_logs, alerts,
│       │                                 app_settings (+ RLS + grants + triggers)
│       ├── 20260707150405_*.sql       — Performance indexes + dashboard_kpis +
│       │                                 get_traceability_forward/backward RPCs
│       └── 20260707170000_*.sql       — commit_production + get_part_availability (NEW)
├── src/
│   ├── routes/
│   │   ├── __root.tsx                 — HTML shell, query provider, toaster
│   │   ├── auth.tsx                   — Sign in / sign up (Supabase Auth)
│   │   └── _authenticated/
│   │       ├── route.tsx              — Sidebar + header + auth guard + global search
│   │       ├── dashboard.tsx          — KPI tiles + activity feed
│   │       ├── vendors.tsx            — CRUD
│   │       ├── raw-materials.tsx      — CRUD + view dialog (forward chain)
│   │       ├── parts.tsx              — CRUD + Produce dialog + batch expand
│   │       ├── products.tsx           — CRUD card grid + active toggle
│   │       ├── products-bom.$id.tsx   — BOM editor (FLAT filename, /products-bom/$id)
│   │       ├── production.tsx         — Recent batches list + Start Production
│   │       ├── production-new.tsx     — 5-step wizard (FLAT filename)
│   │       ├── production-planning.tsx — Forecast with verdict + shortage deep links
│   │       ├── stock.tsx              — (NEW) Combined stock rollup with filters
│   │       ├── stock-history.$type.$id.tsx — (NEW) Per-item history (FLAT)
│   │       ├── traceability.tsx       — Search + chain visualization
│   │       ├── reports.tsx            — Wastage / monthly / stock charts
│   │       ├── alerts.tsx             — Read/unread + filter
│   │       ├── batch-recall.tsx       — Cascade recall across the chain
│   │       └── settings.tsx           — App-level toggles
│   ├── components/
│   │   ├── inventory/                 — PageHeader, EmptyState, MaterialBadge, PartProduceDialog
│   │   ├── reports/                   — WastageCharts, MonthlyChart (lazy)
│   │   └── ui/                        — shadcn/ui primitives (Button, Card, Dialog, …)
│   ├── lib/
│   │   ├── inventory/
│   │   │   ├── format.ts              — fmtKg, fmtNum, fmtDate, fmtCurrency
│   │   │   ├── audit.ts               — audit log writes
│   │   │   └── csv.ts                 — CSV export helper
│   │   └── utils.ts                   — cn() classname helper
│   ├── hooks/
│   │   ├── use-auth.tsx               — Supabase auth hook
│   │   └── use-debounced-value.ts
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts              — Supabase client (publishable key)
│   │       └── types.ts               — DB types (generated)
│   └── styles.css                     — Tailwind v4 `@theme inline` + design tokens
└── CLAUDE.md                          — Project conventions + known gotchas
```

---

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
   ├─ Triggers:
   │   ├─ generate batch numbers (PC-001, CAP-B001, B001, PLAN-YYYYMMDD-001)
   │   ├─ deduct raw material + increase part stock on part_batch insert
   │   ├─ deduct part stock on production_batch_parts insert
   │   ├─ log wastage + raise low-stock / high-wastage alerts
   │   └─ cascade block on raw material recall
   └─ RPCs:
       ├─ get_dashboard_kpis()                  — KPI rollup
       ├─ get_traceability_forward(uuid)        — RM → parts → productions
       ├─ get_traceability_backward(uuid)       — production → parts → RM → vendor
       ├─ get_part_availability(uuid[])         — (NEW) per-batch stock rollup
       └─ commit_production(...)                — (NEW) atomic production commit
```

---

## Routing convention (important gotcha)

TanStack Router **requires parent routes to render `<Outlet />`** for nested paths to render. `route.tsx` does, but most sibling files don't. **Always use flat filenames for sub-pages:**

```
✅ production-new.tsx               → /production-new
✅ products-bom.$id.tsx             → /products-bom/$id
✅ stock-history.$type.$id.tsx     → /stock-history/$type/$id

❌ production.new.tsx               → /production.new (nests under /production, which has no Outlet)
❌ products.$id.bom.tsx             → nests under /products (same problem)
```

The URL changes but the parent's content stays if you nest under a route that has no Outlet. Renamed earlier during this session to fix exactly that bug.

---

## Supabase setup

### Project info

- **Project ID**: `utsfiztqmfskumxacvnn`
- **URL**: `https://utsfiztqmfskumxacvnn.supabase.co`
- **Auth**: Email/password (Supabase Auth, JWT-based)
- **Client keys**: in `.env` as `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- **Service role key**: kept in `.env.local` (gitignored) for migrations + admin queries — never exposed to the client

### Local dev

```bash
bun install
bun run dev   # http://localhost:8080 (auto-falls forward to 8081, 8082… if busy)
```

`.env` template:

```
VITE_SUPABASE_URL=https://utsfiztqmfskumxacvnn.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-publishable-key>
```

### Applying migrations

There is no Supabase CLI installed in this repo, and the management API needs a personal access token. To apply a new migration to the connected project:

1. Open https://supabase.com/dashboard/project/utsfiztqmfskumxacvnn/sql/new
2. Paste the contents of `supabase/migrations/<file>.sql`
3. Run

Apply the three migration files in chronological order (`*_42138` → `*_50405` → `*_70000`).

### Schema overview

```
vendors
  └─ raw_materials (batch_number, material_type, remaining_quantity_kg, is_blocked)
       └─ part_batches (batch_number, quantity, expected/actual_usage_kg, wastage_kg, is_blocked)
            └─ production_batch_parts (junction)
                 └─ production_batches (batch_number, quantity_produced, wastage_kg, status)

products
  └─ product_bom (quantity_required per part)
       └─ production_batches (consume the parts)
```

**Tables:**

| Table | Purpose | Critical columns |
|---|---|---|
| `vendors` | Supplier master | `materials_supplied[]` filters raw-material add form |
| `raw_materials` | Pellets by batch | `remaining_quantity_kg`, `is_blocked` (cascade-trigger) |
| `parts` | Part master | `current_stock`, `low_stock_threshold`, `consumption_per_unit_kg` |
| `part_batches` | Per-batch production of a part | `quantity` (batch size), `is_blocked` |
| `products` | Finished goods | `product_code`, `is_active` |
| `product_bom` | Parts → product mapping | `quantity_required` (per UNIT) |
| `production_batches` | Finished-good runs | `quantity_produced`, `status` |
| `production_batch_parts` | Traceability edge | `part_batch_id`, `quantity_used` |
| `wastage_logs` | All wastage events | `level` (raw/part/prod), `reason` |
| `alerts` | Dashboard inbox | `is_read`, `severity` |
| `production_plans` | Saved forecasts | `required_parts jsonb`, `required_raw_materials jsonb` |
| `app_settings` | Single-row config | misc. knobs (wastage_alert_threshold etc.) |

### Row-Level Security (RLS)

All tables have an `auth_all` policy: `FOR ALL TO authenticated USING (true) WITH CHECK (true)`. Service role bypasses RLS for migrations.

**Read grants only to `authenticated`, not `anon`** — that's why browser tests with `window.__TRACE_DEMO = true` render the layout but show empty lists. The demo bypass returns a fake session that doesn't carry a real authenticated JWT; the Supabase client still sends anon, and anon has no SELECT grant.

### Database functions (RPCs)

| Function | Purpose | Used by |
|---|---|---|
| `get_dashboard_kpis()` | One-trip KPI fetch | `/dashboard` |
| `get_traceability_forward(raw_material_id)` | Vendor → RM → parts → productions | `/traceability` raw view |
| `get_traceability_backward(production_batch_id)` | Production → parts → RM → vendor | `/traceability` product view |
| **`get_part_availability(uuid[])`** *(NEW)* | **Per-batch rollup of available stock** | **`/production-planning`, `/production-new`** |
| **`commit_production(...)`** *(NEW)* | **Atomic production commit** | **`/production-new` step 5** |

**`commit_production` signature:**
```sql
commit_production(
  p_product_id        UUID,
  p_quantity_produced INTEGER,
  p_production_date   DATE,
  p_expected_raw_kg   NUMERIC,
  p_actual_raw_kg     NUMERIC,
  p_notes             TEXT,
  p_picks             JSONB   -- [{ part_batch_id, quantity_used }]
) RETURNS JSONB                  -- { id, batch_number }
```

It does in one DB call: pre-flight check that every picked batch has enough remaining → INSERT production_batches → INSERT production_batch_parts (one per pick) → UPDATE part_batches.quantity -= used → recompute parts.current_stock. **This is what makes concurrent wizard runs safe.**

`SECURITY DEFINER` so the wizard's JWT doesn't need direct table grant complexity; `EXCEPTION` raised when any picked batch would go negative (caller treats as 4xx).

---

## Features delivered in this session

### 1. New: Stock section (`/stock` + `/stock-history/$type/$id`)

**Files added:**
- `src/routes/_authenticated/stock.tsx`
- `src/routes/_authenticated/stock-history.$type.$id.tsx` (flat filename, see routing gotcha)
- Sidebar nav entry under Insight group with `Warehouse` icon (lucide-react)

**What it does:**
- Single page shows current stock across raw materials, parts, AND products in one table.
- Filter tabs: `All / Raw materials / Parts / Products`.
- Search input — case-insensitive substring match on name + code as the user types.
- Row click navigates to `/stock-history/$type/$id` (raw / part / product history, branched in one component).
- **History sub-screen** ($type switch):
  - `raw` → vendor info, utilization stats, list of part batches produced from this raw batch.
  - `part` → current vs. threshold stats, list of production batches consumed (or FIFO shortage warning).
  - `product` → BOM, total produced, recall count, per-run table.

### 2. Rewrite: Production & Planning per spec

**Files rewritten:**
- `src/routes/_authenticated/production-new.tsx` — 5-step wizard
- `src/routes/_authenticated/production-planning.tsx` — verdict line + deep links

**New RPCs** in `supabase/migrations/20260707170000_commit_production_rpc.sql`:
- `get_part_availability(part_ids uuid[])` → `{part_id, part_name, available, batches: [{part_batch_id, batch_number, quantity, remaining, created_at}]}`
- `commit_production(...)` → atomic insert + decrement + refresh

**Wizard (5 gated steps):**
1. **Product + Quantity** — pick active product, enter units.
2. **Availability check** — calls `get_part_availability`, blocks step 3 if shortage. Shows verdict: "Ready to produce" or "Insufficient parts" with deep-link button per shorted part ("Produce X" → jumps back to /parts and re-checks after produce).
3. **Pick batches** — per-batch manual input with FIFO auto-fill button (sum per part must ≥ requirement).
4. **Date & notes** — production date and free-text notes.
5. **Confirm** — summary card of every allocation, then `commit_production` writes atomically.

On commit success: invalidates `production_batches`, `parts`, `products`, `stock` React Query keys; navigates to `/production`.

**Planning:**
- Same `get_part_availability` rollup for the "available" column (no more stale `parts.current_stock` reads).
- Green "Ready to produce" verdict line if all parts + raw on hand.
- Red "Not ready — shopping list" if anything shorted, with deep-link buttons to `/parts` and `/raw-materials` for each material type.
- "Save Plan" persists to `production_plans` (jsonb parts + raw material requirements).

### 3. Route path fixes (nesting bug)

Two files were registered as nested children of pages that don't render `<Outlet />`. URL changed but parent content stayed. **Fix:** renamed to flat filenames so TanStack Router registers them as top-level routes.

| Before (broken) | After (working) |
|---|---|
| `products.$id.bom.tsx` → `/products/$id/bom` | `products-bom.$id.tsx` → `/products-bom/$id` |
| `production.new.tsx` → `/production/new` | `production-new.tsx` → `/production-new` |

Internal `Link to="/..."` refs updated wherever pointed.

### 4. Repo deploy

Pushed to https://github.com/goalgetter53/safeyinventory-redesign.git in commit `5e0a051` (14 files changed).

---

## Pre-existing performance optimizations (2026-07-07 baseline)

### Database
- Added composite/missing indexes: `raw_materials(material_type, is_blocked)`, `raw_materials(purchase_date desc)`, partial index on `raw_materials(is_blocked) WHERE NOT is_blocked`, `part_batches(created_at desc)`, `production_batches(status)`, `production_batches(created_at desc)`, `wastage_logs(level, reference_id)`, `wastage_logs(created_at desc)`, `production_plans(product_id, planned_date desc)`, `production_plans(created_at desc)`.
- Three earlier `SECURITY DEFINER STABLE` RPCs replaced multi-round-trip client patterns: `get_dashboard_kpis()`, `get_traceability_forward(uuid)`, `get_traceability_backward(uuid)`.

### React Query
- Global defaults: `staleTime: 30s`, `gcTime: 5min`, `refetchOnWindowFocus: false`, `retry: 1`.
- Reference-data queries (vendors, parts, active products): `staleTime: 5min`.
- Alerts unread badge: 60s poll (no realtime channel).

### Client
- Debounced global header search and Traceability search (300 ms) — was firing 3–4 Supabase requests per keystroke.
- Debounced Vendor list filter.
- Raw Materials list + wizard: explicit column projection instead of `select('*')`.

---

## Calculation test cases

| Case | Inputs | Expected |
|---|---|---|
| Part wastage | 2000 caps × 0.05 kg/unit, actual 102 kg | expected 100 kg, wastage 2 kg (2%) |
| High wastage alert | wastage% > `wastage_alert_threshold` (default 10) | `high_wastage_part` alert inserted |
| Low stock alert | raw material remaining < 50 kg after deduction | `low_stock_raw` alert inserted |
| Production shortage (pre-RPC wizard path) | required > current_stock | transaction rolls back with clear error |
| Production shortage (commit_production RPC) | any pick exceeds remaining | RPC raises EXCEPTION, no insert, no decrement |
| Recall cascade | raw material `is_blocked = true` | all part_batches from it blocked; all production_batches using them → status `recalled`; summary alert inserted |
| Concurrent commits | two wizards commit same `part_batch_id` simultaneously | one wins; other raises EXCEPTION ("has only X remaining"); DB stays consistent |

---

## End-to-end workflow

1. **Add a vendor** — capture supplier, phone, address, materials supplied.
2. **Add raw material batch** — picks from vendors that supply the chosen material; batch number auto-generated (`PC-003`, etc).
3. **Add a part** and define its material + kg/unit.
4. **Produce a part batch** — pick FIFO source raw material batch, enter actual usage, wastage auto-computed and logged. Raw stock deducted, part stock increased.
5. **Add a product** and its BOM (parts + quantities per unit).
6. **Plan production** (optional) — see shortages before committing, including deep links to fix them.
7. **Start production** — wizard calculates part requirements → availability gate → allocates FIFO → optional extra raw material → confirmation → `commit_production` writes atomically.
8. **Traceability** — search any batch for full backward + forward chain.
9. **Batch recall** — block a raw material; cascade blocks part batches and marks production batches recalled.
10. **Reports** — wastage over time, monthly production, stock snapshot; all exportable to CSV.
11. **Stock** (new) — see rollup across raw / parts / products; drill into any item's history.

---

## Troubleshooting

- **Signed out unexpectedly**: session lives in `localStorage`. Clearing site data logs you out.
- **"Insufficient stock" error during production**: expected — `commit_production` RPC raises on any negative remaining. Produce more parts and retry.
- **Batch number blank in form**: intentional — the DB trigger generates it on insert.
- **Sidebar links to `/products/$id/bom` 404**: means old nested-route URL — use `/products-bom/$id`.
- **Empty lists with `__TRACE_DEMO = true`**: expected. Demo bypass returns a fake session; anon key can't read. Sign in for full data.
- **"part_batch X has only Y remaining" toast**: another wizard committed while this one was open. Re-check availability (step 2) and re-pick.

---

## Pending / known issues

### Immediate (high-value, low-cost)

- [ ] **End-to-end test the new wizard with real data.** Sign in, run a planning calc on the seeded `Steel Chair Model A`, then commit a run through the 5-step wizard. Verify:
  - `part_batches.quantity` decremented exactly.
  - `production_batch_parts` rows match the picks.
  - `parts.current_stock` refreshed correctly.
  - No double-spend when two tabs commit simultaneously (the whole reason for `commit_production`).
- [ ] **CI: missing.** No GitHub Actions. `package.json` has `lint` and `format` scripts that aren't wired to anything.
- [ ] **Tests: 0.** No unit tests, no Playwright suite. Adding a smoke test suite (~10 Playwright tests against a fresh Supabase project) would be the next dent.

### Feature work

- [ ] **Production stock ledger.** Right now, "Product" stock shown elsewhere is a placeholder. Need a `production_stock` table (or `finished_goods` with FIFO batches) so the Stock page's "Product" row can show a real number, and so finished-good receipts/withdrawals can be tracked.
- [ ] **Per-batch FIFO consumption cost.** `production_batches` carries `wastage_kg` but not a per-batch cost of goods. Useful for margin reports.
- [ ] **Wastage threshold rule engine.** Currently the wastage `production_batches.wastage_pct` is informational. A trigger on insert that creates an `alerts` row when `wastage_pct > 10` would automate the threshold.
- [ ] **Alerts rule config.** The `app_settings` row could carry threshold knobs (raw low-stock kg, part low-stock %, wastage %); right now they're hardcoded.
- [ ] **Bulk part batch receive.** Right now `part_batches` are created via the "Produce" dialog. A direct "Receive from vendor" dialog could cut a step.
- [ ] **CSV export everywhere.** Currently only Reports has CSV download. Would benefit parts/vendors/raw-materials.
- [ ] **Production plan → production.** One-click "Start production from this plan" should jump into the wizard with qty + product pre-filled.

### Schema polish

- [ ] Add `unit_cost` to `part_batches` (currently only raw_materials has `rate_per_kg`) — needed for true cost rollup.
- [ ] Foreign-key indexes on `production_batch_parts.part_batch_id` — verify exists, likely fine.
- [ ] `app_settings` table is empty by default — needs seed data + UI for editing.

### Quality of life

- [ ] The `Alerts` unread badge in the sidebar never resets to 0 with `__TRACE_DEMO` because it returns the demo fake count (3). Cosmetic only.
- [ ] Inline edit for product code/description — currently you have to open the modal.
- [ ] Optimistic updates for toggles (product active, raw blocked) — currently shows toast after server reply; could feel snappier.
- [ ] Better empty states — currently "No products yet" is generic.

### Things you may want to drop

- The "Material Defect" reason category in wastage — confirmed unused in any seeded data.
- `production_plans.status` field — never advanced past "planned". Either drop it or implement a plan lifecycle (planned → in-progress → completed).

---

## Deployment

- **Lovable**: click Publish.
- **Elsewhere**: any TanStack Start-compatible host (Cloudflare Workers, Node, etc). Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at build time.
- **GitHub remote**: `goalgetter53/safeyinventory-redesign.git`.

---

## Known gotchas (learned the hard way)

1. **TanStack Router nested paths**: parent must render `<Outlet />`. Use flat filenames for sub-pages (`products-bom.$id.tsx`, not `products.$id.bom.tsx`).
2. **RLS only grants to authenticated**: anon key returns empty arrays for everything. Tests need a real auth session, not the `__TRACE_DEMO` bypass.
3. **`part_batches.quantity` is the truth, not `parts.current_stock`**. `current_stock` is a denormalized cache. `commit_production` keeps them in sync after each commit; `get_part_availability` computes true remaining live.
4. **Bun + Windows**: LF/CRLF warnings on `git add` are normal — Git auto-fixes on commit.
5. **Production commit pre-flight**: the RPC refuses to commit if any picked batch is short. The wizard UI shows the same check earlier as a UI gate; the RPC guard is the real safety net against stale reads.
6. **`__TRACE_DEMO` flag lost on reload.** Set it as `initScript` on Chrome MCP `navigate_page` so `beforeLoad` sees it.

---

## License

Private — internal app.
