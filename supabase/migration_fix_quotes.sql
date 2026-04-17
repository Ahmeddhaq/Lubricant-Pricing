-- Migration: Add missing columns to existing tables

-- Add customer_id to quotes if it doesn't exist
ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

-- Add other potentially missing columns to quotes
ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS quote_number VARCHAR(50) UNIQUE;

ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft';

ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15, 2);

ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD';

ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(255);

ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS delivery_days INTEGER;

ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();

ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();

ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS valid_until TIMESTAMP;
