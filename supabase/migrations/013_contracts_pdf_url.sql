-- Add PDF URL column to contracts for storing generated signed-contract PDFs
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS pdf_url text;
