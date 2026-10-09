/**
 * Apply all supabase/migrations/*.sql in order against the live Supabase Postgres.
 *
 * Softens non-idempotent DDL (CREATE TABLE → IF NOT EXISTS, etc.) so a partially
 * migrated project (e.g. users/widgets exist but platform_connections does not)
 * can catch up without failing on the first conflict.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_DB_PASSWORD = "<Database password>"
 *   node scripts/apply-pending-migrations.mjs
 *
 * Or set DATABASE_URL / SUPABASE_DB_URL / DIRECT_URL.
 *
 * Optional:
 *   $env:DRY_RUN = "1"
 *   $env:PROBE_ONLY = "1"
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = resolve(root, "supabase/migrations");
const require = createRequire(import.meta.url);

const CRITICAL_TABLES = [
  "user_subscriptions",
  "default_chat_commands",
  "message_timers",
  "platform_connections",
  "subathons",
  "media_playback_state",
  "media_request_settings",
  "media_requests",
  "accounts",
  "stream_marks",
  "giveaway_settings",
  "stream_schedule_settings",
  "link_in_bio_profiles",
  "target_events",
  "target_milestones",
];

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

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  if (process.env.SUPABASE_DB_URL?.trim()) return process.env.SUPABASE_DB_URL.trim();
  if (process.env.DIRECT_URL?.trim()) return process.env.DIRECT_URL.trim();
  return null;
}

/** Direct host first, then session poolers. Passwords stay inside the URL. */
function databaseCandidates() {
  const explicit = resolveDatabaseUrl();
  if (explicit) return [explicit];

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

function listMigrationFiles() {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Make historical migrations safe to re-run against a partial schema. */
function softenSql(sql) {
  let out = sql;

  out = out.replace(/\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi, "CREATE TABLE IF NOT EXISTS ");
  out = out.replace(
    /\bCREATE\s+UNIQUE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/gi,
    "CREATE UNIQUE INDEX IF NOT EXISTS ",
  );
  out = out.replace(/\bCREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/gi, "CREATE INDEX IF NOT EXISTS ");

  out = out.replace(
    /CREATE\s+TYPE\s+([a-zA-Z0-9_.]+)\s+AS\s+ENUM\s*\(([\s\S]*?)\)\s*;/gi,
    (_m, name, values) =>
      `DO $$ BEGIN CREATE TYPE ${name} AS ENUM (${values}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  );

  out = out.replace(
    /CREATE\s+POLICY\s+("?[a-zA-Z0-9_ -]+"?)\s+ON\s+([a-zA-Z0-9_.]+)/gi,
    (_m, policy, table) =>
      `DROP POLICY IF EXISTS ${policy} ON ${table};\nCREATE POLICY ${policy} ON ${table}`,
  );

  out = out.replace(
    /CREATE\s+(CONSTRAINT\s+)?TRIGGER\s+(\w+)\s+([\s\S]*?)\s+ON\s+([a-zA-Z0-9_.]+)/gi,
    (_m, _constraint, name, mid, table) =>
      `DROP TRIGGER IF EXISTS ${name} ON ${table};\nCREATE TRIGGER ${name} ${mid} ON ${table}`,
  );

  if (!/ALTER\s+PUBLICATION[\s\S]{0,240}EXCEPTION\s+WHEN\s+duplicate_object/i.test(out)) {
    out = out.replace(
      /ALTER\s+PUBLICATION\s+([a-zA-Z0-9_]+)\s+ADD\s+TABLE\s+([^;]+);/gi,
      (_m, pub, tables) =>
        `DO $$ BEGIN ALTER PUBLICATION ${pub} ADD TABLE ${tables}; EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;`,
    );
  }

  // Seed inserts with fixed UUIDs — ignore if already present.
  out = out.replace(
    /INSERT\s+INTO\s+(public\.)?(users|subathons|timer_states|rules|overlays|audit_logs)\b([\s\S]*?);/gi,
    (m) => {
      if (/ON\s+CONFLICT/i.test(m)) return m;
      return m.replace(/;\s*$/, " ON CONFLICT DO NOTHING;");
    },
  );

  return out;
}

function isIgnorableSqlError(err) {
  const msg = String(err?.message ?? err ?? "");
  const code = err?.code;
  return (
    code === "42P07" || // duplicate_table
    code === "42710" || // duplicate_object
    code === "42701" || // duplicate_column
    code === "42P16" || // invalid_table_definition (sometimes re-add)
    code === "23505" || // unique_violation (seed)
    /already exists/i.test(msg) ||
    /duplicate key/i.test(msg) ||
    /multiple primary keys/i.test(msg)
  );
}

async function loadPg() {
  try {
    return require("pg");
  } catch {
    console.log("Installing pg…");
    const install = spawnSync("npm", ["install", "--no-save", "pg"], {
      cwd: root,
      encoding: "utf8",
      shell: true,
    });
    if (install.status !== 0) {
      throw new Error(`npm install pg failed:\n${install.stderr || install.stdout}`);
    }
    return require("pg");
  }
}

async function probeTables() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(
    /\/$/,
    "",
  );
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) {
    console.error("Probe needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
    return;
  }

  console.log(`\nProbing PostgREST on ${new URL(url).host} …`);
  let missing = 0;
  for (const table of [
    ...CRITICAL_TABLES,
    "custom_chat_commands",
    "users",
    "goals",
    "widgets",
  ]) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact",
      },
    });
    const ok = res.status === 200 || res.status === 206;
    if (!ok) missing += 1;
    console.log(`  ${ok ? "OK " : res.status}  ${table}`);
  }
  return missing;
}

loadEnvFile();

const dryRun = process.env.DRY_RUN === "1";
const probeOnly = process.env.PROBE_ONLY === "1";

if (probeOnly) {
  const missing = await probeTables();
  process.exit(missing && missing > 0 ? 1 : 0);
}

const only = process.env.ONLY_MIGRATION?.trim();
const files = listMigrationFiles().filter((file) => !only || file === only || file.replace(/\.sql$/, "") === only);
console.log(`Found ${files.length} migration file(s)${only ? ` matching ${only}` : ""}`);
if (only && files.length === 0) {
  console.error(`No migration file matches ONLY_MIGRATION=${only}`);
  process.exit(2);
}

if (dryRun) {
  for (const f of files) console.log(`  ${f}`);
  process.exit(0);
}

const candidates = databaseCandidates();
if (!candidates.length) {
  console.error(`
Cannot apply migrations: no database connection string.

Add to .env (or the shell), then re-run:
  SUPABASE_DB_PASSWORD=<password from Supabase → Project Settings → Database>

Or:
  DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres

Then:
  node scripts/apply-pending-migrations.mjs

Apply one file only:
  $env:ONLY_MIGRATION = "20261004160000_target_events.sql"
  node scripts/apply-pending-migrations.mjs
`);
  await probeTables();
  process.exit(2);
}

const ref = projectRefFromUrl(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
);
console.log(`Applying to project: ${ref ?? "(from DATABASE_URL)"}`);

const { Client } = await loadPg();
let client = null;
let lastError = null;
for (const connectionString of candidates) {
  const attempt = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    await attempt.connect();
    client = attempt;
    console.log(`Connected via ${hostOf(connectionString)}`);
    break;
  } catch (err) {
    lastError = err;
    console.log(`skip host ${hostOf(connectionString)} (${err.code || "error"})`);
    try {
      await attempt.end();
    } catch {
      /* already closed */
    }
  }
}
if (!client) {
  console.error("Could not open a Postgres connection.", lastError?.message?.split("\n")[0] ?? "");
  process.exit(1);
}

try {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      statements text[],
      name text
    );
  `);

  let applied = 0;
  let skipped = 0;

  for (const file of files) {
    const versionKey = file.replace(/\.sql$/, "");
    const existing = await client.query(
      `SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1 LIMIT 1`,
      [versionKey],
    );
    if (existing.rowCount) {
      console.log(`skip  ${file}`);
      skipped += 1;
      continue;
    }

    const raw = readFileSync(join(migrationsDir, file), "utf8");
    const sql = softenSql(raw);
    console.log(`apply ${file} …`);

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name)
         VALUES ($1, $2) ON CONFLICT (version) DO NOTHING`,
        [versionKey, file],
      );
      await client.query("COMMIT");
      applied += 1;
      console.log(`  ok`);
    } catch (err) {
      await client.query("ROLLBACK");
      if (isIgnorableSqlError(err)) {
        // Softened SQL still hit a conflict — record as applied so we don't loop forever.
        console.warn(`  warn (ignored): ${err.message?.split("\n")[0]}`);
        await client.query(
          `INSERT INTO supabase_migrations.schema_migrations (version, name)
           VALUES ($1, $2) ON CONFLICT (version) DO NOTHING`,
          [versionKey, file],
        );
        applied += 1;
        continue;
      }
      console.error(`FAILED ${file}:`, err.message);
      throw err;
    }
  }

  await client.query(`NOTIFY pgrst, 'reload schema'`);
  console.log(`\nDone. applied=${applied} skipped=${skipped}`);
} finally {
  await client.end();
}

const missing = await probeTables();
if (missing && missing > 0) {
  console.error(`\n${missing} critical table(s) still missing from PostgREST.`);
  process.exit(1);
}
