-- Case-insensitive uniqueness on parts.part_name.
-- Drop existing btree UNIQUE, add unique index on lower(part_name).

ALTER TABLE parts DROP CONSTRAINT IF EXISTS parts_part_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS parts_part_name_lower_unique ON parts(lower(part_name));