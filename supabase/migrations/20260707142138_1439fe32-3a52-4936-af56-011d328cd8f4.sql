
-- ========================================================================
-- 1. TABLES
-- ========================================================================

CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  materials_supplied TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_type TEXT NOT NULL CHECK (material_type IN ('PC','POM','PP','TPE')),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  batch_number TEXT NOT NULL UNIQUE,
  initial_quantity_kg NUMERIC(10,3) NOT NULL CHECK (initial_quantity_kg > 0),
  remaining_quantity_kg NUMERIC(10,3) NOT NULL CHECK (remaining_quantity_kg >= 0),
  rate_per_kg NUMERIC(10,2) NOT NULL CHECK (rate_per_kg >= 0),
  total_cost NUMERIC(14,2) GENERATED ALWAYS AS (initial_quantity_kg * rate_per_kg) STORED,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_materials TO authenticated;
GRANT ALL ON public.raw_materials TO service_role;
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.raw_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_raw_materials_batch ON public.raw_materials(batch_number);
CREATE INDEX idx_raw_materials_vendor ON public.raw_materials(vendor_id);
CREATE INDEX idx_raw_materials_type ON public.raw_materials(material_type);

CREATE TABLE public.parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_name TEXT NOT NULL UNIQUE,
  material_type TEXT NOT NULL CHECK (material_type IN ('PC','POM','PP','TPE')),
  consumption_per_unit_kg NUMERIC(10,4) NOT NULL CHECK (consumption_per_unit_kg > 0),
  current_stock NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  low_stock_threshold NUMERIC(12,3) NOT NULL DEFAULT 100,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts TO authenticated;
GRANT ALL ON public.parts TO service_role;
ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.parts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.part_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number TEXT NOT NULL UNIQUE,
  part_id UUID NOT NULL REFERENCES public.parts(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  raw_material_batch_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  expected_usage_kg NUMERIC(10,3) NOT NULL,
  actual_usage_kg NUMERIC(10,3) NOT NULL CHECK (actual_usage_kg >= 0),
  wastage_kg NUMERIC(10,3) GENERATED ALWAYS AS (actual_usage_kg - expected_usage_kg) STORED,
  wastage_reason TEXT NOT NULL CHECK (wastage_reason IN ('machine_issue','operator_error','material_defect','setup_loss','other')),
  wastage_notes TEXT,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_batches TO authenticated;
GRANT ALL ON public.part_batches TO service_role;
ALTER TABLE public.part_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.part_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_part_batches_part ON public.part_batches(part_id);
CREATE INDEX idx_part_batches_rm_batch ON public.part_batches(raw_material_batch_id);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL UNIQUE,
  product_code TEXT UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.product_bom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES public.parts(id) ON DELETE RESTRICT,
  quantity_required INTEGER NOT NULL CHECK (quantity_required > 0),
  UNIQUE(product_id, part_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_bom TO authenticated;
GRANT ALL ON public.product_bom TO service_role;
ALTER TABLE public.product_bom ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.product_bom FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_bom_product ON public.product_bom(product_id);

CREATE TABLE public.production_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number TEXT NOT NULL UNIQUE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_produced INTEGER NOT NULL CHECK (quantity_produced > 0),
  expected_raw_material_kg NUMERIC(10,3) NOT NULL,
  actual_raw_material_kg NUMERIC(10,3) NOT NULL CHECK (actual_raw_material_kg >= 0),
  wastage_kg NUMERIC(10,3) GENERATED ALWAYS AS (actual_raw_material_kg - expected_raw_material_kg) STORED,
  wastage_reason TEXT CHECK (wastage_reason IN ('machine_issue','operator_error','material_defect','setup_loss','other')),
  wastage_notes TEXT,
  extra_raw_material_batch_id UUID REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('in_progress','completed','recalled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_batches TO authenticated;
GRANT ALL ON public.production_batches TO service_role;
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.production_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_production_product ON public.production_batches(product_id);
CREATE INDEX idx_production_date ON public.production_batches(production_date DESC);

CREATE TABLE public.production_batch_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_batch_id UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  part_batch_id UUID NOT NULL REFERENCES public.part_batches(id) ON DELETE RESTRICT,
  quantity_used NUMERIC(12,3) NOT NULL CHECK (quantity_used > 0),
  UNIQUE(production_batch_id, part_batch_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_batch_parts TO authenticated;
GRANT ALL ON public.production_batch_parts TO service_role;
ALTER TABLE public.production_batch_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.production_batch_parts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_pbp_production ON public.production_batch_parts(production_batch_id);
CREATE INDEX idx_pbp_part ON public.production_batch_parts(part_batch_id);

CREATE TABLE public.wastage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL CHECK (level IN ('part','product')),
  reference_id UUID NOT NULL,
  level_name TEXT NOT NULL,
  expected_kg NUMERIC(10,3) NOT NULL,
  actual_kg NUMERIC(10,3) NOT NULL,
  wastage_kg NUMERIC(10,3) NOT NULL,
  wastage_percentage NUMERIC(8,2) GENERATED ALWAYS AS (
    CASE WHEN expected_kg > 0 THEN (wastage_kg / expected_kg) * 100 ELSE 0 END
  ) STORED,
  reason TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wastage_logs TO authenticated;
GRANT ALL ON public.wastage_logs TO service_role;
ALTER TABLE public.wastage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.wastage_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_wastage_level ON public.wastage_logs(level);
CREATE INDEX idx_wastage_created ON public.wastage_logs(created_at DESC);

CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('low_stock_raw','low_stock_part','high_wastage_part','high_wastage_product','shortage_planned','info')),
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_alerts_unread ON public.alerts(is_read, created_at DESC);

CREATE TABLE public.production_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_number TEXT NOT NULL UNIQUE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0),
  planned_date DATE NOT NULL,
  required_parts JSONB NOT NULL,
  required_raw_materials JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_plans TO authenticated;
GRANT ALL ON public.production_plans TO service_role;
ALTER TABLE public.production_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.production_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  factory_name TEXT NOT NULL DEFAULT 'My Factory',
  currency_symbol TEXT NOT NULL DEFAULT '₹',
  wastage_alert_threshold NUMERIC(5,2) NOT NULL DEFAULT 10,
  low_stock_raw_threshold NUMERIC(10,2) NOT NULL DEFAULT 50,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ========================================================================
-- 2. UPDATED_AT TRIGGER
-- ========================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_raw_materials_updated BEFORE UPDATE ON public.raw_materials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_parts_updated BEFORE UPDATE ON public.parts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_app_settings_updated BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========================================================================
-- 3. BATCH NUMBER GENERATION
-- ========================================================================

CREATE OR REPLACE FUNCTION public.next_number_for_prefix(p_prefix TEXT, p_table TEXT, p_column TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_max INTEGER;
  v_query TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('batchseq:' || p_prefix));
  v_query := format(
    'SELECT COALESCE(MAX(NULLIF(regexp_replace(%I, ''^%s'', ''''), '''')::INTEGER), 0) FROM public.%I WHERE %I LIKE %L',
    p_column, p_prefix, p_table, p_column, p_prefix || '%'
  );
  EXECUTE v_query INTO v_max;
  RETURN v_max + 1;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Raw material: {MATERIAL_TYPE}-NNN
CREATE OR REPLACE FUNCTION public.raw_material_gen_batch_number() RETURNS TRIGGER AS $$
DECLARE v_next INTEGER; v_prefix TEXT;
BEGIN
  IF NEW.batch_number IS NULL OR NEW.batch_number = '' THEN
    v_prefix := NEW.material_type || '-';
    v_next := public.next_number_for_prefix(v_prefix, 'raw_materials', 'batch_number');
    NEW.batch_number := v_prefix || lpad(v_next::TEXT, 3, '0');
  END IF;
  IF NEW.remaining_quantity_kg IS NULL THEN
    NEW.remaining_quantity_kg := NEW.initial_quantity_kg;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_raw_material_batch_num BEFORE INSERT ON public.raw_materials
FOR EACH ROW EXECUTE FUNCTION public.raw_material_gen_batch_number();

-- Part batch: {PART_CODE}-BNNN
CREATE OR REPLACE FUNCTION public.part_batch_gen_batch_number() RETURNS TRIGGER AS $$
DECLARE v_next INTEGER; v_prefix TEXT; v_name TEXT;
BEGIN
  IF NEW.batch_number IS NULL OR NEW.batch_number = '' THEN
    SELECT part_name INTO v_name FROM public.parts WHERE id = NEW.part_id;
    v_prefix := upper(substring(regexp_replace(v_name, '[^a-zA-Z]', '', 'g') from 1 for 4)) || '-B';
    v_next := public.next_number_for_prefix(v_prefix, 'part_batches', 'batch_number');
    NEW.batch_number := v_prefix || lpad(v_next::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_part_batch_num BEFORE INSERT ON public.part_batches
FOR EACH ROW EXECUTE FUNCTION public.part_batch_gen_batch_number();

-- Production batch: BNNN
CREATE OR REPLACE FUNCTION public.production_batch_gen_batch_number() RETURNS TRIGGER AS $$
DECLARE v_next INTEGER;
BEGIN
  IF NEW.batch_number IS NULL OR NEW.batch_number = '' THEN
    v_next := public.next_number_for_prefix('B', 'production_batches', 'batch_number');
    NEW.batch_number := 'B' || lpad(v_next::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_production_batch_num BEFORE INSERT ON public.production_batches
FOR EACH ROW EXECUTE FUNCTION public.production_batch_gen_batch_number();

-- Production plan: PLAN-YYYYMMDD-NNN
CREATE OR REPLACE FUNCTION public.production_plan_gen_number() RETURNS TRIGGER AS $$
DECLARE v_next INTEGER; v_prefix TEXT;
BEGIN
  IF NEW.plan_number IS NULL OR NEW.plan_number = '' THEN
    v_prefix := 'PLAN-' || to_char(COALESCE(NEW.planned_date, CURRENT_DATE), 'YYYYMMDD') || '-';
    v_next := public.next_number_for_prefix(v_prefix, 'production_plans', 'plan_number');
    NEW.plan_number := v_prefix || lpad(v_next::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_production_plan_num BEFORE INSERT ON public.production_plans
FOR EACH ROW EXECUTE FUNCTION public.production_plan_gen_number();

-- ========================================================================
-- 4. PART BATCH AFTER INSERT: stock + wastage + alerts
-- ========================================================================

CREATE OR REPLACE FUNCTION public.part_batch_after_insert() RETURNS TRIGGER AS $$
DECLARE
  v_part_name TEXT;
  v_rm_batch TEXT;
  v_rm_remaining NUMERIC;
  v_wastage_pct NUMERIC;
  v_threshold NUMERIC;
BEGIN
  UPDATE public.raw_materials
    SET remaining_quantity_kg = remaining_quantity_kg - NEW.actual_usage_kg
    WHERE id = NEW.raw_material_batch_id
    RETURNING remaining_quantity_kg, batch_number INTO v_rm_remaining, v_rm_batch;

  UPDATE public.parts
    SET current_stock = current_stock + NEW.quantity
    WHERE id = NEW.part_id
    RETURNING part_name INTO v_part_name;

  INSERT INTO public.wastage_logs (level, reference_id, level_name, expected_kg, actual_kg, wastage_kg, reason, notes)
  VALUES ('part', NEW.id, 'Part Production: ' || v_part_name, NEW.expected_usage_kg, NEW.actual_usage_kg, NEW.wastage_kg, NEW.wastage_reason, NEW.wastage_notes);

  IF NEW.expected_usage_kg > 0 THEN
    v_wastage_pct := (NEW.wastage_kg / NEW.expected_usage_kg) * 100;
  ELSE
    v_wastage_pct := 0;
  END IF;

  SELECT wastage_alert_threshold INTO v_threshold FROM public.app_settings WHERE id = 1;
  IF v_wastage_pct > COALESCE(v_threshold, 10) THEN
    INSERT INTO public.alerts (alert_type, severity, title, message, reference_id)
    VALUES ('high_wastage_part', 'warning',
      'High wastage on ' || NEW.batch_number,
      v_part_name || ' batch ' || NEW.batch_number || ' had ' || round(v_wastage_pct, 2) || '% wastage.',
      NEW.id);
  END IF;

  IF v_rm_remaining < 50 THEN
    INSERT INTO public.alerts (alert_type, severity, title, message, reference_id)
    VALUES ('low_stock_raw', 'warning',
      'Low raw material stock: ' || v_rm_batch,
      'Raw material batch ' || v_rm_batch || ' has ' || round(v_rm_remaining, 2) || ' kg remaining.',
      NEW.raw_material_batch_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_part_batch_after_insert AFTER INSERT ON public.part_batches
FOR EACH ROW EXECUTE FUNCTION public.part_batch_after_insert();

-- ========================================================================
-- 5. PRODUCTION BATCH PARTS: deduct part stock (per junction row)
-- ========================================================================

CREATE OR REPLACE FUNCTION public.production_batch_part_after_insert() RETURNS TRIGGER AS $$
DECLARE
  v_part_id UUID;
  v_available NUMERIC;
  v_part_name TEXT;
BEGIN
  SELECT part_id INTO v_part_id FROM public.part_batches WHERE id = NEW.part_batch_id;

  UPDATE public.parts
    SET current_stock = current_stock - NEW.quantity_used
    WHERE id = v_part_id
    RETURNING current_stock, part_name INTO v_available, v_part_name;

  IF v_available < 0 THEN
    RAISE EXCEPTION 'Insufficient stock for part %: shortage of % units', v_part_name, abs(v_available);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_production_batch_part_after_insert AFTER INSERT ON public.production_batch_parts
FOR EACH ROW EXECUTE FUNCTION public.production_batch_part_after_insert();

-- ========================================================================
-- 6. PRODUCTION BATCH AFTER INSERT: wastage log + extra RM deduct + alerts
-- ========================================================================

CREATE OR REPLACE FUNCTION public.production_batch_after_insert() RETURNS TRIGGER AS $$
DECLARE
  v_product_name TEXT;
  v_wastage_pct NUMERIC;
  v_threshold NUMERIC;
  v_rm_remaining NUMERIC;
  v_rm_batch TEXT;
BEGIN
  SELECT product_name INTO v_product_name FROM public.products WHERE id = NEW.product_id;

  IF NEW.extra_raw_material_batch_id IS NOT NULL AND NEW.actual_raw_material_kg > 0 THEN
    UPDATE public.raw_materials
      SET remaining_quantity_kg = remaining_quantity_kg - NEW.actual_raw_material_kg
      WHERE id = NEW.extra_raw_material_batch_id
      RETURNING remaining_quantity_kg, batch_number INTO v_rm_remaining, v_rm_batch;

    IF v_rm_remaining < 0 THEN
      RAISE EXCEPTION 'Insufficient raw material in batch %: shortage of % kg', v_rm_batch, abs(v_rm_remaining);
    END IF;

    IF v_rm_remaining < 50 THEN
      INSERT INTO public.alerts (alert_type, severity, title, message, reference_id)
      VALUES ('low_stock_raw', 'warning',
        'Low raw material stock: ' || v_rm_batch,
        'Raw material batch ' || v_rm_batch || ' has ' || round(v_rm_remaining, 2) || ' kg remaining.',
        NEW.extra_raw_material_batch_id);
    END IF;
  END IF;

  INSERT INTO public.wastage_logs (level, reference_id, level_name, expected_kg, actual_kg, wastage_kg, reason, notes)
  VALUES ('product', NEW.id, 'Final Production: ' || v_product_name,
    NEW.expected_raw_material_kg, NEW.actual_raw_material_kg, NEW.wastage_kg,
    COALESCE(NEW.wastage_reason, 'n/a'), NEW.wastage_notes);

  IF NEW.expected_raw_material_kg > 0 THEN
    v_wastage_pct := (NEW.wastage_kg / NEW.expected_raw_material_kg) * 100;
  ELSE
    v_wastage_pct := 0;
  END IF;

  SELECT wastage_alert_threshold INTO v_threshold FROM public.app_settings WHERE id = 1;
  IF v_wastage_pct > COALESCE(v_threshold, 10) THEN
    INSERT INTO public.alerts (alert_type, severity, title, message, reference_id)
    VALUES ('high_wastage_product', 'warning',
      'High wastage on ' || NEW.batch_number,
      v_product_name || ' production ' || NEW.batch_number || ' had ' || round(v_wastage_pct, 2) || '% wastage.',
      NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_production_batch_after_insert AFTER INSERT ON public.production_batches
FOR EACH ROW EXECUTE FUNCTION public.production_batch_after_insert();

-- ========================================================================
-- 7. RAW MATERIAL BLOCK CASCADE
-- ========================================================================

CREATE OR REPLACE FUNCTION public.raw_material_block_cascade() RETURNS TRIGGER AS $$
DECLARE
  v_part_count INTEGER := 0;
  v_prod_count INTEGER := 0;
BEGIN
  IF NEW.is_blocked = true AND (OLD.is_blocked IS NULL OR OLD.is_blocked = false) THEN
    UPDATE public.part_batches SET is_blocked = true
      WHERE raw_material_batch_id = NEW.id AND is_blocked = false;
    GET DIAGNOSTICS v_part_count = ROW_COUNT;

    UPDATE public.production_batches SET status = 'recalled'
      WHERE id IN (
        SELECT DISTINCT pbp.production_batch_id
        FROM public.production_batch_parts pbp
        JOIN public.part_batches pb ON pb.id = pbp.part_batch_id
        WHERE pb.raw_material_batch_id = NEW.id
      ) AND status <> 'recalled';
    GET DIAGNOSTICS v_prod_count = ROW_COUNT;

    INSERT INTO public.alerts (alert_type, severity, title, message, reference_id)
    VALUES ('info', 'critical',
      'Raw material batch ' || NEW.batch_number || ' blocked',
      v_part_count || ' part batches and ' || v_prod_count || ' production batches affected.',
      NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_raw_material_block_cascade AFTER UPDATE OF is_blocked ON public.raw_materials
FOR EACH ROW EXECUTE FUNCTION public.raw_material_block_cascade();
