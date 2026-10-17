/**
 * Apply only the five Alerts migrations, strictly (no SQL softening, no
 * recording a failed file as applied). Requires SUPABASE_DB_PASSWORD.
 *
 *   $env:ALERTS_SQL_MODE = "inspect"   # list history + objects, apply nothing
 *   $env:ALERTS_SQL_MODE = "apply"     # apply pending Alerts files
 *   $env:ALERTS_SQL_MODE = "verify"    # concurrent claim + RLS checks
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { spawnSync as spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ALERTS = readdirSync(join(root, "supabase/migrations"))
  .filter((f) => /^20261017230[0-4]00_alerts_/.test(f))
  .sort();

function loadEnvFile() {
  const path = resolve(root, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function projectRefFromUrl(url) {
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

function databaseCandidates() {
  if (process.env.DATABASE_URL?.trim()) return [process.env.DATABASE_URL.trim()];
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const ref = projectRefFromUrl(supabaseUrl || "");
  if (!password || !ref) return [];
  const encoded = encodeURIComponent(password);
  const preferred = process.env.SUPABASE_DB_REGION?.trim();
  const regions = [
    preferred,
    "aws-0-eu-central-1",
    "aws-1-eu-central-1",
    "aws-0-eu-west-1",
    "aws-1-eu-west-1",
    "aws-0-us-east-1",
    "aws-1-us-east-1",
  ].filter((region, index, all) => region && all.indexOf(region) === index);
  return [
    `postgresql://postgres:${encoded}@db.${ref}.supabase.co:5432/postgres`,
    ...regions.map(
      (region) =>
        `postgresql://postgres.${ref}:${encoded}@${region}.pooler.supabase.com:5432/postgres`,
    ),
  ];
}

function hostOf(connectionString) {
  try {
    return new URL(connectionString).host;
  } catch {
    return "(unparsed)";
  }
}

async function loadPg() {
  try {
    return require("pg");
  } catch {
    const install = spawn("npm", ["install", "--no-save", "pg"], {
      cwd: root,
      encoding: "utf8",
      shell: true,
    });
    if (install.status !== 0) throw new Error(install.stderr || install.stdout);
    return require("pg");
  }
}

async function connect() {
  const { Client } = await loadPg();
  const lastError = { current: null };
  for (const connectionString of databaseCandidates()) {
    const attempt = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      await attempt.connect();
      console.log(`Connected via ${hostOf(connectionString)}`);
      return attempt;
    } catch (err) {
      lastError.current = err;
      console.log(`skip host ${hostOf(connectionString)} (${err.code || "error"})`);
      try {
        await attempt.end();
      } catch {
        /* closed */
      }
    }
  }
  throw new Error(lastError.current?.message?.split("\n")[0] || "no postgres connection");
}

loadEnvFile();
if (ALERTS.length !== 5) {
  console.error("Expected five Alerts migrations, found", ALERTS);
  process.exit(2);
}

const mode = process.env.ALERTS_SQL_MODE || "inspect";
const client = await connect();

try {
  const historySchema = await client.query(`
    SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS present
  `);
  let history = { rows: [] };
  if (historySchema.rows[0].present) {
    history = await client.query(
      `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version`,
    );
  }
  const applied = new Set(history.rows.map((row) => row.version));
  console.log(`schema_migrations present=${historySchema.rows[0].present} rows=${history.rows.length}`);
  const alertsHistory = history.rows.filter((row) => String(row.version).includes("alerts") || /^20261017230/.test(row.version));
  console.log("alerts history:", alertsHistory.length ? alertsHistory : "(none)");
  const recent = history.rows.slice(-8).map((row) => row.version);
  console.log("recent versions:", recent);

  const objects = await client.query(`
    SELECT
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_admin') AS is_admin,
      (SELECT to_regclass('public.alerts_studios') IS NOT NULL) AS alerts_studios,
      (SELECT to_regclass('public.alerts_media') IS NOT NULL) AS alerts_media,
      (SELECT to_regclass('public.alerts_queue') IS NOT NULL) AS alerts_queue,
      (SELECT to_regclass('public.alerts_queue_state') IS NOT NULL) AS alerts_queue_state,
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('alerts_enqueue','alerts_claim','alerts_ack','alerts_control','alerts_presence')) AS alert_rpcs,
      (SELECT count(*) FROM storage.buckets WHERE id='alert-media') AS alert_bucket
  `);
  console.log("objects", objects.rows[0]);

  if (mode === "inspect") {
    /* read-only */
  } else {

  if (Number(objects.rows[0].is_admin) < 1) {
    throw new Error("public.is_admin is missing; refusing to apply Alerts RLS");
  }

  if (mode === "apply") {
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS supabase_migrations;
      CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
        version text PRIMARY KEY,
        statements text[],
        name text
      );
    `);
    for (const file of ALERTS) {
      const versionKey = file.replace(/\.sql$/, "");
      if (applied.has(versionKey)) {
        console.log(`skip  ${file}`);
        continue;
      }
      const sql = readFileSync(join(root, "supabase/migrations", file), "utf8");
      console.log(`apply ${file} …`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)`,
          [versionKey, file],
        );
        await client.query("COMMIT");
        console.log("  ok");
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`FAILED ${file}:`, err.message);
        throw err;
      }
    }
    await client.query(`NOTIFY pgrst, 'reload schema'`);
  }

  if (mode === "verify") {
    const { Client } = await loadPg();
    const candidates = databaseCandidates();
    const extra = new Client({
      connectionString: candidates[0],
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    await extra.connect();
    const ownerRow = await client.query(`
      SELECT id FROM auth.users
      WHERE public.is_admin(id)
      ORDER BY created_at
      LIMIT 1
    `);
    if (!ownerRow.rowCount) throw new Error("no admin user for claim test");
    const owner = ownerRow.rows[0].id;
    const token = "alerts-" + "ab".repeat(32);
    await client.query(
      `INSERT INTO alerts_studios(owner_id, overlay_token, overlay_token_hash)
       VALUES ($1,$2,$3) ON CONFLICT (owner_id) DO NOTHING`,
      [owner, token, "ab".repeat(32)],
    );
    const ev = (n) => ({
      id: randomUUID(),
      alertId: "gift",
      count: n,
      config: { durationMs: 1000, delayMs: 0 },
    });
    const a = ev(1);
    const b = ev(25);
    await client.query(`SELECT alerts_enqueue($1,'release-test-1',$2::jsonb)`, [owner, JSON.stringify(a)]);
    await client.query(`SELECT alerts_enqueue($1,'release-test-25',$2::jsonb)`, [owner, JSON.stringify(b)]);
    const d1 = randomUUID();
    const d2 = randomUUID();
    const [c1, c2] = await Promise.all([
      client.query(`SELECT alerts_claim($1,$2) AS c`, [owner, d1]),
      extra.query(`SELECT alerts_claim($1,$2) AS c`, [owner, d2]),
    ]);
    const statuses = [c1.rows[0].c.status, c2.rows[0].c.status].sort();
    console.log("concurrent claim statuses", statuses);
    if (!(statuses.includes("granted") && (statuses.includes("standby") || statuses.includes("busy")))) {
      throw new Error("concurrent claim did not serialize");
    }
    await client.query(`SELECT alerts_control($1,'clear')`, [owner]);
    await client.query(`SELECT alerts_control($1,'skip')`, [owner]);
    await client.query(`DELETE FROM alerts_queue WHERE owner_id=$1 AND event_key LIKE 'release-test%'`, [owner]);
    await extra.end();
    console.log("verify ok");
  }

  if (mode === "apply" || mode === "verify") {
    const check = await client.query(`
      SELECT
        (SELECT to_regclass('public.alerts_studios') IS NOT NULL) AS studios,
        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='alerts_claim') AS claim,
        (SELECT id FROM storage.buckets WHERE id='alert-media') AS bucket,
        (SELECT file_size_limit FROM storage.buckets WHERE id='alert-media') AS file_size_limit,
        (SELECT public) AS public
      FROM storage.buckets WHERE id='alert-media'
      UNION ALL
      SELECT
        (SELECT to_regclass('public.alerts_studios') IS NOT NULL),
        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='alerts_claim'),
        NULL, NULL, NULL
      WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='alert-media')
    `);
    console.log("post-check", check.rows[0]);
  }
  }
} finally {
  await client.end();
}
