# Phase 1: Core MVP Implementation Guide

## ✅ What's Been Built

### 1. **Database Schema (Supabase)**
- Base Oils management
- Additives catalog
- Recipes with ingredient composition
- SKUs for different pack sizes
- Cost tracking with historical snapshots
- Customers database
- Quotes with line items

### 2. **Formulation Engine**
- Create and manage lubricant recipes
- Add base oils and additives with quantities
- Auto-calculate material cost per liter
- View formulation details and history

### 3. **Costing Engine** (Service Layer)
- Calculate material costs (base oil + additives)
- Full cost build-up (materials + blending + packaging + overhead)
- Support multiple pack sizes
- Historical cost snapshots

### 4. **SKU Management**
- Create product SKUs from recipes
- Define pack sizes (1L, 4L, 20L, drums)
- Packaging cost tracking
- Cost breakdown per unit

### 5. **Pricing Engine**
- Margin-based pricing calculation
- Multi-pack support
- Automatic selling price generation
- Profit calculation

### 6. **Quote Builder**
- Create multi-SKU quotes
- Customer management
- Customizable payment terms
- Auto-calculate quote totals
- Quote versioning (draft status)

### 7. **Dashboard**
- KPI cards (Revenue, Profit, Margin %)
- Top performing SKUs
- Financial summary
- Recent quotes list
- Profit tracking

### 8. **PDF Quote Generation**
- Professional quotation PDF templates
- Auto-calculated totals
- Payment terms and delivery details
- Download functionality

---

## 🚀 Quick Start Guide

### Step 1: Set Up Supabase

1. Create a project at https://app.supabase.com
2. Go to SQL Editor
3. Copy contents of `/supabase/schema.sql`
4. Paste and run in Supabase SQL Editor
5. Wait for completion (no errors should appear)

### Step 2: Configure Environment

Create `.env.local` in project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

Get these values from:
- Supabase Dashboard → Settings → API
- Copy "Project URL" and "anon public" key

### Step 3: Install & Run

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173

---

## 📊 How to Use

### 1. **Create Base Oils** (One-time setup)
- Go to Formulation Engine → Create Recipe
- First, you need base oils added
- Open Supabase directly and insert sample data:

```sql
INSERT INTO base_oils (name, cost_per_liter, unit, description) VALUES
('PAO 4', 2.50, 'Liter', 'Synthetic polyalphaolefin base'),
('Mineral Oil HVI', 1.80, 'Liter', 'High viscosity index mineral'),
('Naphthenic Oil', 1.60, 'Liter', 'Naphthenic base oil');
```

### 2. **Create Additives** (One-time setup)
```sql
INSERT INTO additives (name, cost_per_unit, unit, description) VALUES
('Viscosity Modifier', 15.00, 'kg', 'VI improver package'),
('Anti-wear Additive', 25.00, 'kg', 'ZDDP based AW package'),
('Anti-oxidant', 18.00, 'kg', 'Oxidation inhibitor'),
('Corrosion Inhibitor', 12.00, 'kg', 'Rust and corrosion protection');
```

### 3. **Create Your First Recipe**
- Go to Formulation Engine → Create Recipe
- Name: "Premium SAE 40"
- Base Oil: Select "PAO 4"
- Blending Cost: 0.50
- Add Additives:
  - Viscosity Modifier: 0.02 kg/L
  - Anti-wear: 0.03 kg/L
- Save

### 4. **Create SKUs from Recipe**
- Go to SKU Management → Create SKU
- SKU Name: "SAE 40 1L Bottle"
- Recipe: Select "Premium SAE 40"
- Pack Size: 1
- Packaging Cost: 0.35
- Save

Repeat for:
- 4L (cost: 0.80)
- 20L (cost: 2.50)

### 5. **Create First Customer**
- Go to Quote Builder → New Quote
- Click "Add New" in Customer section
- Fill in customer details (name, country, etc.)

### 6. **Generate Your First Quote**
- Go to Quote Builder → New Quote
- Select Customer
- Add Items:
  - SKU: SAE 40 1L
  - Qty: 100
  - Margin: 25%
- Add another item for variety
- Create Quote

### 7. **Download PDF**
- In Quote Builder, view the quote
- Click "Download PDF"
- Quotation appears with all calculations

### 8. **View Analytics**
- Go to Dashboard
- See total revenue, profit, margins
- View top performing SKUs
- Track recent quotes

---

## 🏗️ Architecture Overview

```
src/
├── components/
│   ├── Navigation.jsx          # Main navigation
│   ├── Dashboard.jsx            # Analytics & KPIs
│   ├── FormulationEngine.jsx    # Recipe management
│   ├── SKUManagement.jsx        # Product packs
│   ├── QuoteBuilder.jsx         # Quote creation
│   └── PdfQuoteGenerator.jsx    # PDF export
├── services/
│   └── supabaseService.js       # All DB operations & calculations
├── App.jsx                       # Main app router
└── App.css                       # Tailwind styles
```

---

## 💾 Data Flow

```
Recipe Creation
└── Ingredient Selection
    └── Material Cost Calculation
        └── SKU Creation
            └── Full Cost Build-up
                └── Margin-based Pricing
                    └── Quote Line Items
                        └── Quote Generation
                            └── PDF Export
```

---

## 🔍 Key Features in Phase 1

✅ **Accurate Costing**
- Recipe-based cost from formulation
- Multi-component cost build-up
- Historical tracking

✅ **Fast Quoting**
- Multi-SKU quote builder
- Auto-calculate pricing
- One-click PDF generation

✅ **Profitability Tracking**
- Margin per product
- Profit by quote
- SKU performance analytics

✅ **Flexible Pricing**
- Margin-based (not markup)
- Multi-pack support
- Quick adjustments

---

## ⚠️ Troubleshooting

### Issue: Supabase connection fails
- Check `.env.local` has correct URL and key
- Ensure project is active in Supabase
- Test connection in browser console: `supabase.auth.getSession()`

### Issue: Components not rendering
- Ensure all dependencies installed: `npm install`
- Check console for errors: F12 → Console
- Verify Supabase tables created

### Issue: PDF not downloading
- Check browser console for errors
- Ensure jsPDF and html2canvas are in package.json
- Try different browser

---

## 📈 Next Steps (Phase 2)

After Phase 1 MVP is working:

1. **Multi-market Pricing**
   - Country-specific margins
   - Currency conversion
   - Market-based pricing rules

2. **Container Optimization**
   - FOB / CIF pricing
   - Container footprint calculations
   - Freight allocation

3. **Advanced Features**
   - User authentication & roles
   - Approval workflows
   - Discount management
   - Bulk operations

---

## 📞 Support

For issues or questions:
1. Check component comments in code
2. Review Supabase documentation
3. Check browser console for error details
4. Verify database schema in Supabase

---

## 🎯 Success Criteria for Phase 1

- ✅ Create recipes with accurate costing
- ✅ Generate multi-SKU quotes under 2 minutes
- ✅ Export professional PDFs
- ✅ View profit analytics on dashboard
- ✅ Store 100+ quotes with history
- ✅ Support 50+ SKUs

**Status: Phase 1 Complete! Ready for testing and deployment.**
