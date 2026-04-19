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
  const payload = request.body || {};
  const { type, ...payloadWithoutType } = payload;

  const normalizeUploadPayload = (uploadPayload) => ({
    original_filename: uploadPayload.original_filename ?? uploadPayload.originalFilename,
    storage_bucket: uploadPayload.storage_bucket ?? uploadPayload.storageBucket,
    storage_path: uploadPayload.storage_path ?? uploadPayload.storagePath,
    file_size_bytes: uploadPayload.file_size_bytes ?? uploadPayload.fileSizeBytes,
    sheet_count: uploadPayload.sheet_count ?? uploadPayload.sheetCount,
    row_count: uploadPayload.row_count ?? uploadPayload.rowCount,
    source_app_version: uploadPayload.source_app_version ?? uploadPayload.sourceAppVersion,
    notes: uploadPayload.notes,
  });

  const normalizeConfigPayload = (configPayload) => ({
    config_name: configPayload.config_name ?? configPayload.configName,
    config_type: configPayload.config_type ?? configPayload.configType,
    config_version: configPayload.config_version ?? configPayload.configVersion,
    config_data: configPayload.config_data ?? configPayload.configData,
    source_upload_id: configPayload.source_upload_id ?? configPayload.sourceUploadId,
    notes: configPayload.notes,
  });

  const normalizeRunPayload = (runPayload) => ({
    run_label: runPayload.run_label ?? runPayload.runLabel,
    run_type: runPayload.run_type ?? runPayload.runType,
    run_data: runPayload.run_data ?? runPayload.runData,
    source_upload_id: runPayload.source_upload_id ?? runPayload.sourceUploadId,
    notes: runPayload.notes,
  });

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
    const insertByType = async (tableName) => {
      const record =
        type === "upload"
          ? normalizeUploadPayload(payloadWithoutType)
          : type === "config"
            ? normalizeConfigPayload(payloadWithoutType)
            : type === "run"
              ? normalizeRunPayload(payloadWithoutType)
              : payloadWithoutType;
      const { data, error } = await supabaseAuthed.from(tableName).insert([{ ...record, user_id: user.id }]).select().single();
      if (error) {
        response.status(500).json({ error: error.message });
        return true;
      }
      response.status(200).json(data);
      return true;
    };

    if (type === "upload") {
      await insertByType("excel_uploads");
      return;
    }

    if (type === "config") {
      await insertByType("config_versions");
      return;
    }

    if (type === "run") {
      await insertByType("upload_config_runs");
      return;
    }

    response.status(400).json({ error: "Unknown history type." });
    return;
  }

  response.setHeader("Allow", ["GET", "POST"]);
  response.status(405).json({ error: "Method not allowed." });
}

export async function uploadHandler(request, response) {
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