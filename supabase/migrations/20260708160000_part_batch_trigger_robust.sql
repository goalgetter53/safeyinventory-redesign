-- Hardening: NULL-safe part batch number generation.
-- Old version: if part_name stripped to empty AND part_id missing → prefix = NULL → batch_number NULL → NOT NULL violation.
-- New version: always produces a non-null batch_number. Falls back to part_id prefix if part_name unusable.

CREATE OR REPLACE FUNCTION public.part_batch_gen_batch_number() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_next INTEGER; v_prefix TEXT; v_name TEXT; v_stripped TEXT;
BEGIN
  IF NEW.batch_number IS NOT NULL AND NEW.batch_number <> '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(part_name, '') INTO v_name FROM public.parts WHERE id = NEW.part_id;

  v_stripped := regexp_replace(v_name, '[^A-Za-z0-9]', '', 'g');
  v_stripped := upper(substring(v_stripped from 1 for 4));

  IF v_stripped = '' OR v_stripped IS NULL THEN
    v_stripped := upper(substring(replace(NEW.part_id::text, '-', '') from 1 for 4));
  END IF;
  IF v_stripped = '' OR v_stripped IS NULL THEN
    v_stripped := 'PART';
  END IF;

  v_prefix := v_stripped || '-B';
  v_next := public.next_number_for_prefix(v_prefix, 'part_batches', 'batch_number');
  NEW.batch_number := v_prefix || lpad(v_next::TEXT, 3, '0');

  RETURN NEW;
END $$;