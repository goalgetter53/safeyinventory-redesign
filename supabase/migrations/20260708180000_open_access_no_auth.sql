-- SAFEY: open access (no auth required).
-- Replaces role-restricted "auth_all" policies with public-readable/writable.
-- Idempotent: drops and recreates.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'vendors',
    'raw_materials',
    'parts',
    'part_batches',
    'products',
    'product_bom',
    'production_batches',
    'production_batch_parts',
    'wastage_logs',
    'alerts',
    'production_plans',
    'app_settings',
    'other_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS public_all ON public.%I', t);
    EXECUTE format('CREATE POLICY public_all ON public.%I FOR ALL TO public USING (true) WITH CHECK (true)', t);
    EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated', t);
  END LOOP;
END $$;
