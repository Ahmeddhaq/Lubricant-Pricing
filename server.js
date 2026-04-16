import express from "express";
import cors from "cors";
import xlsx from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Load Excel
function readExcel() {
  try {
    const filePath = path.join(__dirname, "lubricant_enterprise_system.xlsx");
    const workbook = xlsx.readFile(filePath);

    const pricingSheet = workbook.Sheets["Pricing Matrix"];
    const pricingData = xlsx.utils.sheet_to_json(pricingSheet);

    const costSheet = workbook.Sheets["Costing"];
    const costData = xlsx.utils.sheet_to_json(costSheet);

    return {
      pricing: pricingData,
      cost: costData
    };
  } catch (err) {
    console.error("Error reading Excel:", err);
    return { pricing: [], cost: [] };
  }
}

// Get all data
app.get("/api/data", (req, res) => {
  try {
    const data = readExcel();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get data by SKU
app.get("/api/data/:sku", (req, res) => {
  try {
    const data = readExcel();
    const costData = data.cost.filter(item => item.SKU === req.params.sku);
    res.json({
      pricing: data.pricing.filter(p => p.SKU === req.params.sku),
      cost: costData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => {
  console.log("Server running on port 3001");
});
