import express from "express";
import cors from "cors";
import xlsx from "xlsx";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) return;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  });
}

loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

function createAuthedClient(token) {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

async function requireUser(req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing access token." });
    return null;
  }

  const supabaseAuthed = createAuthedClient(token);
  if (!supabaseAuthed) {
    res.status(500).json({ error: "Supabase admin client is not configured." });
    return null;
  }

  const { data, error } = await supabaseAuthed.auth.getUser(token);
  if (error || !data?.user) {
    res.status(401).json({ error: error?.message || "Invalid session." });
    return null;
  }

  return { user: data.user, supabaseAuthed };
}

app.get("/api/history", async (req, res) => {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user, supabaseAuthed } = auth;

  const [uploadsResult, configsResult, runsResult] = await Promise.all([
    supabaseAuthed.from("excel_uploads").select("*").eq("user_id", user.id).order("uploaded_at", { ascending: false }).limit(50),
    supabaseAuthed.from("config_versions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabaseAuthed.from("upload_config_runs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);

  const error = uploadsResult.error || configsResult.error || runsResult.error;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({
    uploads: uploadsResult.data || [],
    configs: configsResult.data || [],
    runs: runsResult.data || [],
  });
});

app.post("/api/history", async (req, res) => {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user, supabaseAuthed } = auth;

  const payload = req.body || {};

  const insertByType = async (tableName) => {
    const { data, error } = await supabaseAuthed.from(tableName).insert([{ ...payload, user_id: user.id }]).select().single();
    if (error) {
      res.status(500).json({ error: error.message });
      return true;
    }
    res.json(data);
    return true;
  };

  if (payload.type === "upload") {
    await insertByType("excel_uploads");
    return;
  }

  if (payload.type === "config") {
    await insertByType("config_versions");
    return;
  }

  if (payload.type === "run") {
    await insertByType("upload_config_runs");
    return;
  }

  res.status(400).json({ error: "Unknown history type." });
});

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
