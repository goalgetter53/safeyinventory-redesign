-- Performance indexes: composite + missing hot filter columns
CREATE INDEX IF NOT EXISTS idx_raw_materials_type_blocked ON public.raw_materials (material_type, is_blocked);
CREATE INDEX IF NOT EXISTS idx_raw_materials_purchase_date ON public.raw_materials (purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_raw_materials_blocked ON public.raw_materials (is_blocked) WHERE is_blocked = false;
CREATE INDEX IF NOT EXISTS idx_part_batches_created_at ON public.part_batches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_batches_status ON public.production_batches (status);
CREATE INDEX IF NOT EXISTS idx_production_batches_created_at ON public.production_batches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wastage_logs_level_ref ON public.wastage_logs (level, reference_id);
CREATE INDEX IF NOT EXISTS idx_wastage_logs_created_at ON public.wastage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_plans_product_date ON public.production_plans (product_id, planned_date DESC);
CREATE INDEX IF NOT EXISTS idx_production_plans_created_at ON public.production_plans (created_at DESC);

-- ============================================================
-- RPC: get_dashboard_kpis — one round trip for the dashboard
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_raw_stock_kg',   (SELECT COALESCE(SUM(remaining_quantity_kg),0)::numeric FROM public.raw_materials WHERE NOT is_blocked),
    'active_raw_batches',   (SELECT COUNT(*)::int FROM public.raw_materials WHERE NOT is_blocked),
    'material_types',       (SELECT COUNT(DISTINCT material_type)::int FROM public.raw_materials WHERE NOT is_blocked),
    'total_finished_goods', (SELECT COALESCE(SUM(quantity_produced),0)::bigint FROM public.production_batches),
    'total_production_batches', (SELECT COUNT(*)::int FROM public.production_batches),
    'todays_batches',       (SELECT COUNT(*)::int FROM public.production_batches WHERE production_date = CURRENT_DATE),
    'todays_units',         (SELECT COALESCE(SUM(quantity_produced),0)::bigint FROM public.production_batches WHERE production_date = CURRENT_DATE),
    'todays_wastage_kg',    (SELECT COALESCE(SUM(wastage_kg),0)::numeric FROM public.wastage_logs WHERE created_at::date = CURRENT_DATE),
    'todays_actual_kg',     (SELECT COALESCE(SUM(actual_kg),0)::numeric FROM public.wastage_logs WHERE created_at::date = CURRENT_DATE),
    'vendors_count',        (SELECT COUNT(*)::int FROM public.vendors),
    'active_products',      (SELECT COUNT(*)::int FROM public.products WHERE is_active),
    'parts_stock',          (SELECT COALESCE(SUM(current_stock),0)::numeric FROM public.parts),
    'low_stock_parts',      (SELECT COUNT(*)::int FROM public.parts WHERE current_stock < low_stock_threshold),
    'low_stock_raw',        (SELECT COUNT(*)::int FROM public.raw_materials WHERE NOT is_blocked AND remaining_quantity_kg < 50),
    'unread_alerts',        (SELECT COUNT(*)::int FROM public.alerts WHERE NOT is_read)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis() TO authenticated;

-- ============================================================
-- RPC: get_traceability_forward(raw_material_id) — vendor → RM → parts → productions in a single call
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_traceability_forward(p_raw_material_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'raw_material', (
      SELECT to_jsonb(rm) || jsonb_build_object(
        'vendor', to_jsonb(v)
      )
      FROM public.raw_materials rm
      LEFT JOIN public.vendors v ON v.id = rm.vendor_id
      WHERE rm.id = p_raw_material_id
    ),
    'part_batches', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(pb) || jsonb_build_object(
          'part_name', p.part_name,
          'productions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', prb.id,
              'batch_number', prb.batch_number,
              'product_name', pr.product_name,
              'quantity_produced', prb.quantity_produced,
              'production_date', prb.production_date,
              'status', prb.status,
              'quantity_used', pbp.quantity_used
            ))
            FROM public.production_batch_parts pbp
            JOIN public.production_batches prb ON prb.id = pbp.production_batch_id
            LEFT JOIN public.products pr ON pr.id = prb.product_id
            WHERE pbp.part_batch_id = pb.id
          ), '[]'::jsonb)
        )
      )
      FROM public.part_batches pb
      LEFT JOIN public.parts p ON p.id = pb.part_id
      WHERE pb.raw_material_batch_id = p_raw_material_id
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_traceability_forward(UUID) TO authenticated;

-- ============================================================
-- RPC: get_traceability_backward(production_batch_id) — production → parts → RM → vendor
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_traceability_backward(p_production_batch_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'production', (
      SELECT to_jsonb(prb) || jsonb_build_object('product_name', pr.product_name)
      FROM public.production_batches prb
      LEFT JOIN public.products pr ON pr.id = prb.product_id
      WHERE prb.id = p_production_batch_id
    ),
    'parts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'quantity_used', pbp.quantity_used,
        'part_batch', to_jsonb(pb) || jsonb_build_object(
          'part_name', p.part_name,
          'raw_material', to_jsonb(rm) || jsonb_build_object(
            'vendor', to_jsonb(v)
          )
        )
      ))
      FROM public.production_batch_parts pbp
      JOIN public.part_batches pb ON pb.id = pbp.part_batch_id
      LEFT JOIN public.parts p ON p.id = pb.part_id
      LEFT JOIN public.raw_materials rm ON rm.id = pb.raw_material_batch_id
      LEFT JOIN public.vendors v ON v.id = rm.vendor_id
      WHERE pbp.production_batch_id = p_production_batch_id
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_traceability_backward(UUID) TO authenticated;
