-- SAFEY: combined idempotent fix migration.
-- Safe to run multiple times. Uses IF EXISTS / IF NOT EXISTS everywhere.
-- Drops + recreates objects to avoid stale-state errors from prior attempts.

-- =====================================================================
-- 1. Free-text material_type on raw_materials and parts.
--    Drops CHECK constraint; keeps the column free-form.
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'raw_materials'
      AND constraint_name = 'raw_materials_material_type_check'
  ) THEN
    ALTER TABLE public.raw_materials DROP CONSTRAINT raw_materials_material_type_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'parts'
      AND constraint_name = 'parts_material_type_check'
  ) THEN
    ALTER TABLE public.parts DROP CONSTRAINT parts_material_type_check;
  END IF;
END $$;

-- =====================================================================
-- 2. Case-insensitive unique on parts.part_name.
--    Drops old UNIQUE constraint; creates unique index on lower().
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'parts'
      AND constraint_name = 'parts_part_name_key'
  ) THEN
    ALTER TABLE public.parts DROP CONSTRAINT parts_part_name_key;
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_parts_part_name_lower;
CREATE UNIQUE INDEX IF NOT EXISTS idx_parts_part_name_lower
  ON public.parts(lower(part_name));

-- =====================================================================
-- 3. NULL-safe part_batch batch_number trigger.
--    Falls back to part_id prefix, then 'PART', so batch_number is
--    always non-null and unique.
-- =====================================================================

DROP TRIGGER IF EXISTS trg_part_batch_num ON public.part_batches;
DROP FUNCTION IF EXISTS public.part_batch_gen_batch_number() CASCADE;

CREATE OR REPLACE FUNCTION public.part_batch_gen_batch_number() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_next INTEGER;
  v_prefix TEXT;
  v_name TEXT;
  v_stripped TEXT;
BEGIN
  -- If client supplied a non-empty batch_number, keep it.
  IF NEW.batch_number IS NOT NULL AND NEW.batch_number <> '' THEN
    RETURN NEW;
  END IF;

  -- Try to derive a 4-char prefix from the part's name.
  SELECT COALESCE(part_name, '') INTO v_name FROM public.parts WHERE id = NEW.part_id;

  v_stripped := regexp_replace(v_name, '[^A-Za-z0-9]', '', 'g');
  v_stripped := upper(substring(v_stripped from 1 for 4));

  -- If name is unusable, fall back to part_id hex chars, then 'PART'.
  IF v_stripped IS NULL OR v_stripped = '' THEN
    v_stripped := upper(substring(replace(NEW.part_id::text, '-', '') from 1 for 4));
  END IF;
  IF v_stripped IS NULL OR v_stripped = '' THEN
    v_stripped := 'PART';
  END IF;

  v_prefix := v_stripped || '-B';
  v_next := public.next_number_for_prefix(v_prefix, 'part_batches', 'batch_number');
  NEW.batch_number := v_prefix || lpad(v_next::TEXT, 3, '0');

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_part_batch_num ON public.part_batches;
CREATE TRIGGER trg_part_batch_num
  BEFORE INSERT ON public.part_batches
  FOR EACH ROW EXECUTE FUNCTION public.part_batch_gen_batch_number();

-- =====================================================================
-- 4. raw_material batch_number trigger: NULL-safe + sanitized.
-- =====================================================================

DROP TRIGGER IF EXISTS trg_raw_material_num ON public.raw_materials;
DROP TRIGGER IF EXISTS trg_raw_material_batch_num ON public.raw_materials;
DROP FUNCTION IF EXISTS public.raw_material_gen_batch_number() CASCADE;

CREATE OR REPLACE FUNCTION public.raw_material_gen_batch_number() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_next INTEGER;
  v_prefix TEXT;
  v_mat TEXT;
BEGIN
  IF NEW.batch_number IS NOT NULL AND NEW.batch_number <> '' THEN
    RETURN NEW;
  END IF;

  v_mat := regexp_replace(coalesce(NEW.material_type, ''), '[^A-Za-z0-9]', '', 'g');
  v_mat := upper(substring(v_mat from 1 for 6));
  IF v_mat IS NULL OR v_mat = '' THEN
    v_mat := 'MAT';
  END IF;

  v_prefix := v_mat || '-';
  v_next := public.next_number_for_prefix(v_prefix, 'raw_materials', 'batch_number');
  NEW.batch_number := v_prefix || lpad(v_next::TEXT, 3, '0');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_raw_material_num ON public.raw_materials;
CREATE TRIGGER trg_raw_material_num
  BEFORE INSERT ON public.raw_materials
  FOR EACH ROW EXECUTE FUNCTION public.raw_material_gen_batch_number();

-- Re-add CASCADE-dropped triggers that previous migration attached to the
-- old function body. We can't know their original names, so we cover both.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_raw_material_num'
                 AND tgrelid = 'public.raw_materials'::regclass) THEN
    CREATE TRIGGER trg_raw_material_num BEFORE INSERT ON public.raw_materials
      FOR EACH ROW EXECUTE FUNCTION public.raw_material_gen_batch_number();
  END IF;
END $$;

-- =====================================================================
-- 5. other_items table for stock-only items (boxes, tapes, etc).
--    Safe CREATE IF NOT EXISTS + idempotent trigger setup.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.other_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  category            TEXT NOT NULL,
  unit                TEXT NOT NULL DEFAULT 'pcs',
  current_stock       NUMERIC NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  low_stock_threshold NUMERIC NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_other_items_category ON public.other_items(category);
CREATE INDEX IF NOT EXISTS idx_other_items_name ON public.other_items(name);

ALTER TABLE public.other_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'other_items' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY auth_all ON public.other_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.other_items TO authenticated;

DROP TRIGGER IF EXISTS trg_other_items_updated_at ON public.other_items;
CREATE TRIGGER trg_other_items_updated_at BEFORE UPDATE ON public.other_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_other_items_low_stock ON public.other_items;
CREATE TRIGGER trg_other_items_low_stock AFTER INSERT OR UPDATE OF current_stock, low_stock_threshold ON public.other_items
  FOR EACH ROW EXECUTE FUNCTION public.other_items_low_stock_alert();

-- Re-create helper functions only if missing (so prior migration runs are preserved).
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.other_items_low_stock_alert() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_stock IS NOT NULL
     AND NEW.low_stock_threshold IS NOT NULL
     AND NEW.current_stock < NEW.low_stock_threshold THEN
    INSERT INTO public.alerts (title, message, severity, is_read, related_table, related_id)
    VALUES (
      'Low stock: ' || NEW.name,
      'Current: ' || NEW.current_stock || ' ' || NEW.unit || ' · Threshold: ' || NEW.low_stock_threshold || ' ' || NEW.unit,
      'warning',
      false,
      'other_items',
      NEW.id
    );
  END IF;
  RETURN NEW;
END $$;