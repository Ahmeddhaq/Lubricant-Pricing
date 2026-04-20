-- Add workbook session scoping to recipes and SKUs so the dashboard can isolate current session data.
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS source_upload_id UUID;

ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS source_upload_id UUID;

CREATE INDEX IF NOT EXISTS idx_recipes_source_upload_id ON recipes(source_upload_id);
CREATE INDEX IF NOT EXISTS idx_skus_source_upload_id ON skus(source_upload_id);
