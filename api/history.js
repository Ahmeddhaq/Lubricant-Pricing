import { createClient } from "@supabase/supabase-js";

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

async function requireUser(request, response) {
  const authHeader = request.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    response.status(401).json({ error: "Missing access token." });
    return null;
  }

  const supabaseAuthed = createAuthedClient(token);
  if (!supabaseAuthed) {
    response.status(500).json({ error: "Supabase client is not configured." });
    return null;
  }

  const { data, error } = await supabaseAuthed.auth.getUser(token);
  if (error || !data?.user) {
    response.status(401).json({ error: error?.message || "Invalid session." });
    return null;
  }

  return { user: data.user, supabaseAuthed };
}

export default async function handler(request, response) {
  const auth = await requireUser(request, response);
  if (!auth) return;
  const { user, supabaseAuthed } = auth;

  if (request.method === "GET") {
    const [uploadsResult, configsResult, runsResult] = await Promise.all([
      supabaseAuthed.from("excel_uploads").select("*").eq("user_id", user.id).order("uploaded_at", { ascending: false }).limit(50),
      supabaseAuthed.from("config_versions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabaseAuthed.from("upload_config_runs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);

    const error = uploadsResult.error || configsResult.error || runsResult.error;
    if (error) {
      response.status(500).json({ error: error.message });
      return;
    }

    response.status(200).json({
      uploads: uploadsResult.data || [],
      configs: configsResult.data || [],
      runs: runsResult.data || [],
    });
    return;
  }

  if (request.method === "POST") {
    const payload = request.body || {};
    const insertByType = async (tableName) => {
      const { data, error } = await supabaseAuthed.from(tableName).insert([{ ...payload, user_id: user.id }]).select().single();
      if (error) {
        response.status(500).json({ error: error.message });
        return true;
      }
      response.status(200).json(data);
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

    response.status(400).json({ error: "Unknown history type." });
    return;
  }

  response.setHeader("Allow", ["GET", "POST"]);
  response.status(405).json({ error: "Method not allowed." });
}