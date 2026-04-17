-- Drop existing tables if they exist (in reverse dependency order)
DROP TABLE IF EXISTS quote_items CASCADE;
DROP TABLE IF EXISTS quotes CASCADE;
DROP TABLE IF EXISTS cost_snapshots CASCADE;
DROP TABLE IF EXISTS skus CASCADE;
DROP TABLE IF EXISTS recipe_ingredients CASCADE;
DROP TABLE IF EXISTS recipes CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS additives CASCADE;
DROP TABLE IF EXISTS base_oils CASCADE;

-- Base Oils Table
CREATE TABLE base_oils (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  cost_per_liter DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(50) DEFAULT 'Liter',
  description TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Additives Table
CREATE TABLE additives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  cost_per_unit DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Recipes Table
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  base_oil_id UUID NOT NULL REFERENCES base_oils(id),
  blending_cost_per_liter DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Recipe Ingredients (Additives) Table
CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  additive_id UUID NOT NULL REFERENCES additives(id),
  quantity_per_liter DECIMAL(10, 4) NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- SKUs Table
CREATE TABLE skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  recipe_id UUID NOT NULL REFERENCES recipes(id),
  pack_size_liters DECIMAL(10, 2) NOT NULL,
  pack_description VARCHAR(100),
  packaging_cost_per_unit DECIMAL(10, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Cost Snapshots (Historical Tracking)
CREATE TABLE cost_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID NOT NULL REFERENCES skus(id),
  cost_per_unit DECIMAL(10, 2) NOT NULL,
  material_cost DECIMAL(10, 2),
  blending_cost DECIMAL(10, 2),
  packaging_cost DECIMAL(10, 2),
  overhead_cost DECIMAL(10, 2),
  total_cost DECIMAL(10, 2),
  snapshot_date TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

-- Customers Table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  country VARCHAR(100),
  city VARCHAR(100),
  contact_person VARCHAR(255),
  customer_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Quotes Table
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  status VARCHAR(50) DEFAULT 'draft',
  total_amount DECIMAL(15, 2),
  currency VARCHAR(10) DEFAULT 'USD',
  payment_terms VARCHAR(255),
  delivery_days INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  valid_until TIMESTAMP
);

-- Quote Items Table
CREATE TABLE quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES skus(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  margin_percent DECIMAL(5, 2),
  line_total DECIMAL(15, 2),
  created_at TIMESTAMP DEFAULT now()
);

-- Indexes for Performance
CREATE INDEX idx_recipes_base_oil_id ON recipes(base_oil_id);
CREATE INDEX idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_additive_id ON recipe_ingredients(additive_id);
CREATE INDEX idx_skus_recipe_id ON skus(recipe_id);
CREATE INDEX idx_cost_snapshots_sku_id ON cost_snapshots(sku_id);
CREATE INDEX idx_quotes_customer_id ON quotes(customer_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quote_items_quote_id ON quote_items(quote_id);
CREATE INDEX idx_quote_items_sku_id ON quote_items(sku_id);
