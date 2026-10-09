#!/usr/bin/env python3
"""
Apply all supabase/migrations/*.sql in lexical order against Supabase Postgres.

Connection (first match wins):
  DATABASE_URL / SUPABASE_DB_URL / DIRECT_URL
  or SUPABASE_DB_PASSWORD + SUPABASE_URL (builds pooler URI)

Usage (PowerShell):
  python scripts/apply_migrations.py
  $env:DRY_RUN = "1"; python scripts/apply_migrations.py
  $env:FORCE_ALL = "1"; python scripts/apply_migrations.py   # ignore schema_migrations skip

Requires: pip install psycopg[binary]  (or psycopg2-binary)
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from urllib.parse import quote, urlparse

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
ENV_PATH = ROOT / ".env"

CRITICAL_TABLES = [
    "users",
    "widgets",
    "goals",
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
    "custom_chat_commands",
]


def load_env_file() -> None:
    if not ENV_PATH.is_file():
        return
    for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def project_ref_from_url(url: str) -> str | None:
    try:
        host = urlparse(url).hostname or ""
        return host.split(".")[0] or None
    except Exception:
        return None


def resolve_database_url_candidates() -> list[str]:
    """Build ordered connection strings to try (pooler regions + direct host)."""
    urls: list[str] = []
    for key in ("DATABASE_URL", "SUPABASE_DB_URL", "DIRECT_URL"):
        val = (os.environ.get(key) or "").strip()
        if val:
            urls.append(val)

    password = (os.environ.get("SUPABASE_DB_PASSWORD") or "").strip()
    supabase_url = (
        (os.environ.get("SUPABASE_URL") or "").strip()
        or (os.environ.get("VITE_SUPABASE_URL") or "").strip()
    )
    ref = project_ref_from_url(supabase_url or "")
    if not password or not ref:
        return urls

    encoded = quote(password, safe="")
    preferred = (os.environ.get("SUPABASE_DB_REGION") or "").strip()
    regions = []
    if preferred:
        regions.append(preferred)
    for region in (
        "aws-0-eu-central-1",
        "aws-0-eu-west-1",
        "aws-0-eu-west-2",
        "aws-0-us-east-1",
        "aws-0-us-west-1",
        "aws-1-eu-central-1",
        "aws-1-us-east-1",
    ):
        if region not in regions:
            regions.append(region)

    # Direct database host first (works when pooler tenant lookup fails).
    urls.append(f"postgresql://postgres:{encoded}@db.{ref}.supabase.co:5432/postgres")

    # Session pooler (5432) then transaction pooler (6543).
    for region in regions:
        urls.append(
            f"postgresql://postgres.{ref}:{encoded}@{region}.pooler.supabase.com:5432/postgres"
        )
        urls.append(
            f"postgresql://postgres.{ref}:{encoded}@{region}.pooler.supabase.com:6543/postgres"
        )

    return urls


def resolve_database_url() -> str | None:
    candidates = resolve_database_url_candidates()
    return candidates[0] if candidates else None


def connect_with_fallback(psycopg, candidates: list[str]):
    errors: list[str] = []
    connect = psycopg.connect
    sslmode = os.environ.get("PGSSLMODE", "require")
    for url in candidates:
        host = urlparse(url).hostname or "?"
        port = urlparse(url).port or 5432
        try:
            conn = connect(url, sslmode=sslmode, connect_timeout=12)
            print(f"Connected via {host}:{port}")
            return conn, url
        except Exception as exc:  # noqa: BLE001
            msg = str(exc).split("\n", 1)[0]
            errors.append(f"{host}:{port} → {msg}")
            print(f"  retry {host}:{port} failed")
    raise RuntimeError(
        "Could not connect to Supabase Postgres.\n"
        + "\n".join(f"  - {e}" for e in errors[:8])
        + "\n\nSet DATABASE_URL from Dashboard → Project Settings → Database → URI,"
        " or set SUPABASE_DB_REGION to your pooler region."
    )


def list_migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("*.sql"), key=lambda p: p.name)


def soften_sql(sql: str) -> str:
    """Make historical migrations safer to re-run on a partially migrated DB."""
    out = sql
    out = re.sub(
        r"\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)",
        "CREATE TABLE IF NOT EXISTS ",
        out,
        flags=re.IGNORECASE,
    )
    out = re.sub(
        r"\bCREATE\s+UNIQUE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ",
        out,
        flags=re.IGNORECASE,
    )
    out = re.sub(
        r"\bCREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)",
        "CREATE INDEX IF NOT EXISTS ",
        out,
        flags=re.IGNORECASE,
    )

    def wrap_enum(m: re.Match[str]) -> str:
        # Skip CREATE TYPE already inside DO $$ BEGIN … EXCEPTION blocks.
        prefix = out[max(0, m.start() - 48) : m.start()]
        if re.search(r"BEGIN\s*$", prefix, flags=re.IGNORECASE | re.MULTILINE):
            return m.group(0)
        name, values = m.group(1), m.group(2)
        return (
            "DO $cylix_enum$ BEGIN "
            f"CREATE TYPE {name} AS ENUM ({values}); "
            "EXCEPTION WHEN duplicate_object THEN NULL; "
            "END $cylix_enum$;"
        )

    out = re.sub(
        r"CREATE\s+TYPE\s+([a-zA-Z0-9_.]+)\s+AS\s+ENUM\s*\(([\s\S]*?)\)\s*;",
        wrap_enum,
        out,
        flags=re.IGNORECASE,
    )

    def wrap_policy(m: re.Match[str]) -> str:
        policy, table = m.group(1), m.group(2)
        return f"DROP POLICY IF EXISTS {policy} ON {table};\nCREATE POLICY {policy} ON {table}"

    out = re.sub(
        r"CREATE\s+POLICY\s+(\"?[a-zA-Z0-9_ -]+\"?)\s+ON\s+([a-zA-Z0-9_.]+)",
        wrap_policy,
        out,
        flags=re.IGNORECASE,
    )

    def wrap_trigger(m: re.Match[str]) -> str:
        name, mid, table = m.group(2), m.group(3), m.group(4)
        return f"DROP TRIGGER IF EXISTS {name} ON {table};\nCREATE TRIGGER {name} {mid} ON {table}"

    out = re.sub(
        r"CREATE\s+(CONSTRAINT\s+)?TRIGGER\s+(\w+)\s+([\s\S]*?)\s+ON\s+([a-zA-Z0-9_.]+)",
        wrap_trigger,
        out,
        flags=re.IGNORECASE,
    )

    # Historical seed inserts (demo UUIDs) — ignore FK/unique conflicts.
    seed_tables = (
        "users|accounts|sessions|subathons|timer_states|rules|overlays|"
        "audit_logs|events|platform_connections|widgets|goals"
    )

    def wrap_seed_insert(m: re.Match[str]) -> str:
        stmt = m.group(0).rstrip().rstrip(";")
        if re.search(r"ON\s+CONFLICT", stmt, re.I):
            body = stmt
        else:
            body = f"{stmt} ON CONFLICT DO NOTHING"
        return (
            "DO $cylix_seed$ BEGIN\n"
            f"  {body};\n"
            "EXCEPTION\n"
            "  WHEN foreign_key_violation THEN NULL;\n"
            "  WHEN unique_violation THEN NULL;\n"
            "  WHEN not_null_violation THEN NULL;\n"
            "END $cylix_seed$;"
        )

    out = re.sub(
        rf"INSERT\s+INTO\s+(public\.)?({seed_tables})\b[\s\S]*?;",
        wrap_seed_insert,
        out,
        flags=re.IGNORECASE,
    )

    return out


def is_ignorable_sql_error(exc: BaseException) -> bool:
    msg = str(exc)
    code = getattr(exc, "sqlstate", None) or getattr(exc, "pgcode", None)
    return code in {
        "42P07",  # duplicate_table
        "42710",  # duplicate_object
        "42701",  # duplicate_column
        "42P16",  # invalid_table_definition
        "23505",  # unique_violation
        "23503",  # foreign_key_violation (seed rows)
        "42704",  # undefined_object sometimes on DROP
    } or bool(
        re.search(
            r"already exists|duplicate key|multiple primary keys|"
            r"violates foreign key constraint|"
            r"00000000-0000-4000-8000-00000000000",
            msg,
            re.I,
        )
    )


def import_psycopg():
    try:
        import psycopg  # type: ignore

        return psycopg
    except ImportError:
        pass
    try:
        import psycopg2  # type: ignore

        return psycopg2
    except ImportError as err:
        print(
            "Missing driver. Install one of:\n"
            "  pip install \"psycopg[binary]\"\n"
            "  pip install psycopg2-binary",
            file=sys.stderr,
        )
        raise SystemExit(3) from err


def probe_tables() -> int:
    import urllib.request

    url = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "").rstrip(
        "/"
    )
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY") or ""
    if not url or not key:
        print("Probe skipped (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)")
        return 0

    print(f"\nProbing PostgREST on {urlparse(url).hostname} …")
    missing = 0
    for table in CRITICAL_TABLES:
        req = urllib.request.Request(
            f"{url}/rest/v1/{table}?select=*&limit=0",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Prefer": "count=exact",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                ok = res.status in (200, 206)
        except Exception as exc:
            ok = False
            code = getattr(exc, "code", "?")
            print(f"  FAIL {code}  {table}")
            missing += 1
            continue
        if not ok:
            missing += 1
        print(f"  {'OK  ' if ok else 'FAIL'}  {table}")
    return missing


def main() -> int:
    load_env_file()
    dry_run = os.environ.get("DRY_RUN") == "1"
    force_all = os.environ.get("FORCE_ALL") == "1"
    probe_only = os.environ.get("PROBE_ONLY") == "1"

    files = list_migration_files()
    print(f"Found {len(files)} migration file(s) in {MIGRATIONS_DIR}")

    if dry_run:
        for path in files:
            print(f"  {path.name}")
        return 0

    if probe_only:
        return 1 if probe_tables() > 0 else 0

    candidates = resolve_database_url_candidates()
    if not candidates:
        print(
            """
Cannot apply migrations: no database connection string.

Add to .env (or the shell), then re-run:
  SUPABASE_DB_PASSWORD=<password from Supabase → Project Settings → Database>
  SUPABASE_DB_REGION=aws-0-<your-region>   # optional but recommended

Or paste the full URI:
  DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres

Then:
  python scripts/apply_migrations.py
""",
            file=sys.stderr,
        )
        probe_tables()
        return 2

    ref = project_ref_from_url(
        os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or ""
    )
    print(f"Applying to project: {ref or '(from DATABASE_URL)'}")
    print(f"Trying {len(candidates)} connection candidate(s)…")

    psycopg = import_psycopg()
    report: list[dict[str, str]] = []
    applied = skipped = warned = failed = 0

    try:
        conn, _used_url = connect_with_fallback(psycopg, candidates)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        probe_tables()
        return 2

    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE SCHEMA IF NOT EXISTS supabase_migrations;
                CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
                  version text PRIMARY KEY,
                  statements text[],
                  name text
                );
                """
            )

        for path in files:
            version_key = path.stem
            with conn.cursor() as cur:
                if not force_all:
                    cur.execute(
                        "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = %s LIMIT 1",
                        (version_key,),
                    )
                    if cur.fetchone():
                        print(f"skip  {path.name}")
                        skipped += 1
                        report.append({"file": path.name, "status": "skipped"})
                        continue

            raw = path.read_text(encoding="utf-8")
            sql = soften_sql(raw)
            print(f"apply {path.name} …")

            try:
                with conn.cursor() as cur:
                    cur.execute(sql)
                    cur.execute(
                        """
                        INSERT INTO supabase_migrations.schema_migrations (version, name)
                        VALUES (%s, %s) ON CONFLICT (version) DO NOTHING
                        """,
                        (version_key, path.name),
                    )
                applied += 1
                print("  ok")
                report.append({"file": path.name, "status": "ok"})
            except Exception as exc:  # noqa: BLE001 — report all SQL failures
                if is_ignorable_sql_error(exc):
                    msg = str(exc).split("\n", 1)[0]
                    print(f"  warn (ignored): {msg}")
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            INSERT INTO supabase_migrations.schema_migrations (version, name)
                            VALUES (%s, %s) ON CONFLICT (version) DO NOTHING
                            """,
                            (version_key, path.name),
                        )
                    warned += 1
                    applied += 1
                    report.append({"file": path.name, "status": "warned", "detail": msg})
                    continue

                print(f"FAILED {path.name}: {exc}", file=sys.stderr)
                failed += 1
                report.append({"file": path.name, "status": "failed", "detail": str(exc)})
                break

        with conn.cursor() as cur:
            cur.execute("NOTIFY pgrst, 'reload schema'")
    finally:
        conn.close()

    print("\n========== REPORT ==========")
    print(f"total={len(files)} applied={applied} skipped={skipped} warned={warned} failed={failed}")
    for row in report:
        detail = f" — {row['detail']}" if row.get("detail") else ""
        print(f"  [{row['status']}] {row['file']}{detail}")
    print("============================\n")

    missing = probe_tables()
    if failed:
        return 1
    if missing:
        print(f"\n{missing} critical table(s) still missing from PostgREST.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
