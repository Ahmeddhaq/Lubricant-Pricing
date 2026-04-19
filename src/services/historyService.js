import { supabase } from "./supabaseService";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function getAuthHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(await getAuthHeader()),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export const historyService = {
  fetchHistory() {
    return request("/api/history");
  },

  recordUpload(payload) {
    const normalizedPayload = {
      original_filename: payload.originalFilename,
      storage_bucket: payload.storageBucket,
      storage_path: payload.storagePath,
      file_size_bytes: payload.fileSizeBytes,
      sheet_count: payload.sheetCount,
      row_count: payload.rowCount,
      source_app_version: payload.sourceAppVersion,
      notes: payload.notes,
    };

    return request("/api/history/upload", {
      method: "POST",
      body: normalizedPayload,
    });
  },

  recordConfigVersion(payload) {
    return request("/api/history", {
      method: "POST",
      body: { type: "config", ...payload },
    });
  },

  recordRun(payload) {
    return request("/api/history", {
      method: "POST",
      body: { type: "run", ...payload },
    });
  },
};