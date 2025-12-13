CREATE TABLE IF NOT EXISTS import_column_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id uuid NOT NULL REFERENCES marketplaces(id) ON DELETE CASCADE,
  import_type text NOT NULL,
  mapping jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marketplace_id, import_type)
);

CREATE INDEX IF NOT EXISTS idx_import_column_mappings_marketplace_type 
  ON import_column_mappings(marketplace_id, import_type);

COMMENT ON TABLE import_column_mappings IS 'Mapping of Excel file columns for data import';
COMMENT ON COLUMN import_column_mappings.mapping IS 'JSON object: key - DB field, value - Excel column name';
COMMENT ON COLUMN import_column_mappings.import_type IS 'Import type: accruals or storage_costs';

