-- Other items: standalone stock (boxes, tapes, etc.) — no production link.
-- Stock-only. User-defined categories. Low-stock alerts on insert/update.

CREATE TABLE IF NOT EXISTS other_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  category            TEXT NOT NULL,
  unit                TEXT NOT NULL DEFAULT 'pcs',
  current_stock      NUMERIC NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  low_stock_threshold NUMERIC NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_other_items_category ON other_items(category);
CREATE INDEX IF NOT EXISTS idx_other_items_name ON other_items(name);

ALTER TABLE other_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_all ON other_items;
CREATE POLICY auth_all ON other_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON other_items TO authenticated;

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_other_items_updated_at ON other_items;
CREATE TRIGGER trg_other_items_updated_at BEFORE UPDATE ON other_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Low-stock alert on insert/update
CREATE OR REPLACE FUNCTION other_items_low_stock_alert() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_stock IS NOT NULL
     AND NEW.low_stock_threshold IS NOT NULL
     AND NEW.current_stock < NEW.low_stock_threshold THEN
    INSERT INTO alerts (title, message, severity, is_read, related_table, related_id)
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

DROP TRIGGER IF EXISTS trg_other_items_low_stock ON other_items;
CREATE TRIGGER trg_other_items_low_stock AFTER INSERT OR UPDATE OF current_stock, low_stock_threshold ON other_items
  FOR EACH ROW EXECUTE FUNCTION other_items_low_stock_alert();