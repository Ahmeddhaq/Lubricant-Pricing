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
  if (request.method !== "POST") {
    response.setHeader("Allow", ["POST"]);
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const auth = await requireUser(request, response);
  if (!auth) return;
  const { user, supabaseAuthed } = auth;

  const payload = request.body || {};
  const record = {
    original_filename: payload.original_filename ?? payload.originalFilename,
    storage_bucket: payload.storage_bucket ?? payload.storageBucket,
    storage_path: payload.storage_path ?? payload.storagePath,
    file_size_bytes: payload.file_size_bytes ?? payload.fileSizeBytes,
    sheet_count: payload.sheet_count ?? payload.sheetCount,
    row_count: payload.row_count ?? payload.rowCount,
    source_app_version: payload.source_app_version ?? payload.sourceAppVersion,
    notes: payload.notes,
    user_id: user.id,
  };

  const { data, error } = await supabaseAuthed.from("excel_uploads").insert([record]).select().single();
  if (error) {
    response.status(500).json({ error: error.message });
    return;
  }

  response.status(200).json(data);
}
