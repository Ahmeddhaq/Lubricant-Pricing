-- Migration: add the missing upload size column for workbook history records

ALTER TABLE excel_uploads
ADD COLUMN IF NOT EXISTS "fileSizeBytes" BIGINT;