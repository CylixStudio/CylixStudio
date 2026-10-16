import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[trimmed.slice(0, index).trim()] = value;
  }
  return env;
}

const env = loadEnv("E:/Store/Cylix/CylixStudio/.env");
const db = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await db
  .from("platform_connections")
  .select("username")
  .eq("platform", "KICK")
  .eq("is_active", true)
  .not("username", "ilike", "creovixstudio")
  .limit(8);
if (error) {
  console.log(JSON.stringify({ ok: false }));
  process.exit(0);
}
const names = [...new Set((data ?? []).map((row) => String(row.username || "").trim()).filter(Boolean))].slice(0, 3);
console.log(JSON.stringify({ ok: true, names }));
