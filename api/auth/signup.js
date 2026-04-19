import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SECRET_KEY;

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", ["POST"]);
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    response.status(500).json({ error: "Server auth signup requires SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_SERVICE_ROLE_KEY." });
    return;
  }

  const { email, password, fullName } = request.body || {};
  if (!email || !password) {
    response.status(400).json({ error: "Email and password are required." });
    return;
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName || "",
      name: fullName || "",
    },
  });

  if (error) {
    response.status(500).json({ error: error.message });
    return;
  }

  response.json({ user: data.user });
}