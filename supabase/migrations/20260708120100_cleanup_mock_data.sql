-- Wipe all mock/seed data. Keep schema + RLS.
-- Order: children → parents to satisfy FK constraints.

TRUNCATE TABLE
  wastage_logs,
  production_batch_parts,
  production_batches,
  production_plans,
  product_bom,
  part_batches,
  raw_materials,
  parts,
  products,
  vendors,
  alerts
RESTART IDENTITY CASCADE;