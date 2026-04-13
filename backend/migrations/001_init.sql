CREATE TABLE IF NOT EXISTS imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  raw_csv TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_rows INT NOT NULL DEFAULT 0,
  processed_rows INT NOT NULL DEFAULT 0,
  error_summary TEXT
);

CREATE TABLE IF NOT EXISTS import_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES imports (id) ON DELETE CASCADE,
  external_key TEXT NOT NULL,
  row_index INT NOT NULL,
  level TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  openproject_id INT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  UNIQUE (import_id, external_key)
);

CREATE INDEX IF NOT EXISTS import_items_import_status_idx ON import_items (import_id, status);

CREATE TABLE IF NOT EXISTS import_logs (
  id BIGSERIAL PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES imports (id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_logs_import_created_idx ON import_logs (import_id, created_at DESC);
