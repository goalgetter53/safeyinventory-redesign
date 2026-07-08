-- Allow free-text material names (not just PC/POM/PP/TPE).
-- Sanitize raw material batch prefix to alphanumeric, uppercase, first 6.

ALTER TABLE raw_materials DROP CONSTRAINT IF EXISTS raw_materials_material_type_check;
ALTER TABLE parts DROP CONSTRAINT IF EXISTS parts_material_type_check;

CREATE OR REPLACE FUNCTION raw_material_gen_batch_number() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_next INTEGER; v_prefix TEXT; v_mat TEXT;
BEGIN
  IF NEW.batch_number IS NULL OR NEW.batch_number = '' THEN
    v_mat := regexp_replace(coalesce(NEW.material_type, 'MAT'), '[^A-Za-z0-9]', '', 'g');
    v_mat := upper(substring(v_mat from 1 for 6));
    IF v_mat = '' THEN v_mat := 'MAT'; END IF;
    v_prefix := v_mat || '-';
    v_next := next_number_for_prefix(v_prefix, 'raw_materials', 'batch_number');
    NEW.batch_number := v_prefix || lpad(v_next::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END $$;