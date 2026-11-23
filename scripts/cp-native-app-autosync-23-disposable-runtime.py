#!/usr/bin/env python3
"""Disposable GoTrue and PostgREST connectivity probe against CP20 owner clone.

No real users, passwords or tokens copied from any other database.
Temporary database password, network and service containers are destroyed by
the caller's EXIT cleanup and this probe's finally block.
"""
import json
import base64
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.parse
from pathlib import Path

DATABASE = "cp_native20_pg_owner_qa"
DB_NAME = "cp_native20_owner_clone"
NETWORK = "cp_native23_internal_qa"
AUTH = "cp_native23_auth_qa"
REST = "cp_native23_rest_qa"
SOURCE_AUTH = "supabase_auth_cp16019-disposable-local"
SOURCE_REST = "supabase_rest_cp16019-disposable-local"
SOURCE_DB = "supabase_db_cp16019-disposable-local"
AUTH_IMAGE = "public.ecr.aws/supabase/gotrue:v2.197.0"
REST_IMAGE = "public.ecr.aws/supabase/postgrest:v16.4"

def docker(*args, input_bytes=None):
    try:
        return subprocess.run(["docker", *args], input=input_bytes,
                              capture_output=True, check=True).stdout
    except subprocess.CalledProcessError as error:
        # Do not include stderr or full argv: they may contain credentials.
        allowed = {"exec", "inspect", "network", "run", "ps"}
        category = args[0] if args and args[0] in allowed else "docker"
        subcommand = args[1] if len(args) > 1 and args[0] == "network" else ""
        raise RuntimeError("Docker operation failed: " + category +
                           (" " + subcommand if subcommand in ("create", "connect", "rm") else "")) from None

def inspect(name):
    return json.loads(docker("inspect", name))[0]

def sql(statement):
    return docker("exec", DATABASE, "psql", "-X", "-U", "postgres",
                  "-d", DB_NAME, "-Atqc", statement).decode().strip()

def sanitized_container_log(name):
    """Inspect BOTH Docker log streams in memory; never echo raw log text."""
    if name not in (AUTH, REST, DATABASE):
        raise RuntimeError("Unrecognized disposable diagnostic container")
    result = subprocess.run(["docker", "logs", "--tail", "85", name],
                            capture_output=True, check=False)
    if result.returncode != 0:
        return ""
    return (result.stdout + result.stderr).decode(errors="replace").lower()



def health(service, port, path):
    # Check from the isolated PostgreSQL container itself. An --internal
    # Docker network cannot be assumed reachable from the host, even with a
    # loopback port mapping. No QA service ports are published.
    result = subprocess.run([
        "docker", "exec", DATABASE, "wget", "-S", "-O", "/dev/null",
        "-T", "2", f"http://{service}:{port}{path}"
    ], capture_output=True, text=True, check=False)
    import re
    codes = re.findall(r"HTTP/[0-9.]+\s+(\d{3})",
                       result.stdout + result.stderr)
    return int(codes[-1]) if codes else 0


def signed_http(service, port, path, workspace, payload=None, token=None):
    """Send HTTP from the private database network; no host port exposure.

    Random disposable passwords and JWTs enter Docker only through temporary
    restricted files, never through argv, logs or the shared source database.
    """
    if service not in (AUTH, REST) or path not in (
        "/signup", "/token?grant_type=password", "/user", "/"
    ):
        raise RuntimeError("Unsupported isolated HTTP endpoint")
    request_body = Path(workspace) / "cp23-body.json"
    bearer_file = Path(workspace) / "cp23-bearer"
    try:
        if payload is not None:
            request_body.write_text(json.dumps(payload))
            request_body.chmod(0o600)
            docker("cp", str(request_body), DATABASE + ":/tmp/cp23-body.json")
        if token is not None:
            bearer_file.write_text(token)
            bearer_file.chmod(0o600)
            docker("cp", str(bearer_file), DATABASE + ":/tmp/cp23-bearer")
        cmd = 'wget -S -O - -T 6 --header "Content-Type: application/json"'
        if token is not None:
            cmd += ' --header "Authorization: Bearer $(cat /tmp/cp23-bearer)"'
        if payload is not None:
            cmd += ' --post-file /tmp/cp23-body.json'
        cmd += f' http://{service}:{port}{path}'
        result = subprocess.run(
            ["docker", "exec", DATABASE, "sh", "-c", cmd],
            capture_output=True, check=False
        )
        if result.returncode != 0:
            import re
            statuses = re.findall(rb"HTTP/[0-9.]+\s+(\d{3})", result.stderr)
            status = statuses[-1].decode() if statuses else "unknown"
            if path == "/":
                rest_logs = sanitized_container_log(REST)
                signals = {
                    "invalid-jwt": ("invalid jwt", "jwt invalid", "jwt verification"),
                    "invalid-role": ("role does not exist", "invalid role", "role claim"),
                    "permission-denied": ("permission denied", "insufficient privilege"),
                    "jwt-expired": ("jwt expired", "token is expired"),
                    "missing-token": ("missing token", "no jwt"),
                }
                labels = [key for key,patterns in signals.items()
                          if any(pattern in rest_logs for pattern in patterns)]
                print("CP24_PGRST_LOG_CLASSES=" +
                      ",".join(labels or ["unclassified"]))
            if path in ("/signup", "/"):
                label = "CP24_AUTH_HTTP_ERROR_CODE" if path == "/signup" else "CP24_PGRST_ERROR_CODE"
                try:
                    response = json.loads(result.stdout.decode())
                    error_code = response.get("code") or response.get("error_code") or "not-exposed"
                    if not isinstance(error_code, str) or not error_code.replace("_", "").isalnum():
                        error_code = "not-exposed"
                    print(label + "=" + error_code[:64])
                except (ValueError, UnicodeDecodeError, AttributeError):
                    print(label + "=not-exposed")
            stage = {
                "/signup": "auth-signup", "/token?grant_type=password": "auth-login",
                "/user": "auth-user", "/": "data-api"
            }[path]
            raise RuntimeError("Isolated HTTP rejected: " + stage + " status " + status)
        return json.loads(result.stdout.decode())
    finally:
        subprocess.run(["docker", "exec", DATABASE, "rm", "-f",
                        "/tmp/cp23-body.json", "/tmp/cp23-bearer"],
                       capture_output=True, check=False)
        for file in (request_body, bearer_file):
            file.unlink(missing_ok=True)


def main():
    if len(sys.argv) != 3 or sys.argv[1] != "--disposable":
        raise RuntimeError("Explicit isolated runtime probe required")
    env_file = Path(sys.argv[2])
    if not env_file.is_file() or not str(env_file).startswith("/tmp/cp-native20."):
        raise RuntimeError("Unrecognized disposable credential file")
    original = dict(line.split("=", 1) for line in env_file.read_text().splitlines())
    db_password = original.get("POSTGRES_PASSWORD", "")
    if len(db_password) < 40 or not db_password.isascii():
        raise RuntimeError("Disposable password unavailable")
    if DATABASE not in docker("ps", "--format", "{{.Names}}").decode().splitlines():
        raise RuntimeError("Owner-compatible isolated database is not running")
    for name in (AUTH, REST):
        if name in docker("ps", "-a", "--format", "{{.Names}}").decode().splitlines():
            raise RuntimeError("Existing temporary service; refusing overwrite")
    a = inspect(SOURCE_AUTH)
    r = inspect(SOURCE_REST)
    if a["Config"]["Image"] != AUTH_IMAGE or r["Config"]["Image"] != REST_IMAGE:
        raise RuntimeError("Unverified installed Auth/Data API image")
    auth_env = dict(pair.split("=", 1) for pair in a["Config"]["Env"] if "=" in pair)
    rest_env = dict(pair.split("=", 1) for pair in r["Config"]["Env"] if "=" in pair)
    if urllib.parse.urlsplit(auth_env["GOTRUE_DB_DATABASE_URL"]).hostname != SOURCE_DB:
        raise RuntimeError("Unexpected source Auth database")
    if urllib.parse.urlsplit(rest_env["PGRST_DB_URI"]).hostname != SOURCE_DB:
        raise RuntimeError("Unexpected source Data API database")

    # Clone ONLY Auth migration IDs, not accounts/sessions/credentials.
    ledger = docker("exec", SOURCE_DB, "pg_dump", "-U", "postgres",
                    "-d", "postgres", "--data-only", "--column-inserts",
                    "-t", "auth.schema_migrations")
    if ledger.count(b"INSERT INTO auth.schema_migrations") != 82:
        raise RuntimeError("Installed GoTrue migration ledger changed")
    docker("exec", "-i", DATABASE, "psql", "-X", "-v", "ON_ERROR_STOP=1",
           "-U", "postgres", "-d", DB_NAME, input_bytes=ledger)
    sql("INSERT INTO auth.schema_migrations(version) VALUES "
        "('20260911120000'),('20261030120000')")
    fingerprint = sql("SELECT count(*)||':'||"
        "md5(string_agg(version,',' ORDER BY version)) FROM auth.schema_migrations")
    if fingerprint != "84:89b5e505220d565bc38e8092af7b6c0f":
        raise RuntimeError("Existing staging Auth migration fingerprint mismatch")
    print("PASS: isolated 84-version Auth migration fingerprint matches staging")

    created = []
    try:
        linked = inspect(DATABASE)
        if NETWORK not in linked["NetworkSettings"]["Networks"]:
            raise RuntimeError("Disposable database was not started on internal network")
        # The disposable postgres role is used ONLY for runtime connectivity.
        # This does not prove staging-equivalent GoTrue application grants.
        conn = ("postgres://postgres:" +
                urllib.parse.quote(db_password, safe="") +
                f"@{DATABASE}:5432/{DB_NAME}")
        jwt = secrets.token_urlsafe(48)
        auth_env["GOTRUE_DB_DATABASE_URL"] = conn + "?search_path=auth"
        auth_env["GOTRUE_DB_DB_NAMESPACE"] = "auth"
        auth_env["GOTRUE_JWT_SECRET"] = jwt
        # The source local service contains an asymmetric signing keyset.
        # Never transplant its private signing keys into this QA environment:
        # it would sign ES256 while PostgREST uses our disposable HS256 secret.
        auth_env["GOTRUE_JWT_KEYS"] = "[]"
        auth_env["GOTRUE_MAILER_AUTOCONFIRM"] = "true"
        auth_env["GOTRUE_DISABLE_SIGNUP"] = "false"
        rest_env["PGRST_DB_URI"] = conn
        rest_env["PGRST_JWT_SECRET"] = jwt
        rest_env["PGRST_DB_SCHEMAS"] = "public"
        tool = subprocess.run(["docker", "exec", DATABASE, "sh", "-c",
                               "command -v wget"],capture_output=True,check=False)
        if tool.returncode != 0:
            raise RuntimeError("Isolated PostgreSQL image lacks internal HTTP probe")
        with tempfile.TemporaryDirectory(prefix="cp-native23-", dir=str(env_file.parent)) as temp:
            for name, values, image in (
                (AUTH, auth_env, AUTH_IMAGE),
                (REST, rest_env, REST_IMAGE)
            ):
                path = Path(temp) / (name + ".env")
                path.write_text("".join(key + "=" + value + "\n" for key, value in values.items()))
                path.chmod(0o600)
                docker("run", "-d", "--name", name, "--network", NETWORK,
                       "--env-file", str(path), image)
                created.append(name)
        auth_status = 0
        rest_status = 0
        for _ in range(30):
            auth_status = health(AUTH, 9999, "/health")
            rest_status = health(REST, 3000, "/")
            if auth_status == 200 and rest_status in (200, 401, 403, 404):
                break
            time.sleep(0.4)
        print("CP23_GOTRUE_HEALTH=" + str(auth_status))
        print("CP23_POSTGREST_HTTP=" + str(rest_status))
        if auth_status != 200 or rest_status not in (200, 401, 403, 404):
            raise RuntimeError("Isolated Auth/Data API readiness failed")
        print("PASS: disposable GoTrue and Data API HTTP health on one database")
        identities = []
        for _ in range(3):
            email = "cp23-qa-" + secrets.token_hex(10) + "@example.com"
            password = secrets.token_urlsafe(28) + "Q9!"
            try:
                signup = signed_http(AUTH, 9999, "/signup", env_file.parent,
                                    {"email": email, "password": password})
            except RuntimeError:
                import re
                # Only inspect error labels and SQLSTATE. Never print raw logs,
                # tokens, body or full queries.
                logs = sanitized_container_log(AUTH)
                patterns = {
                    "missing-relation": "does not exist",
                    "permission-denied": "permission denied",
                    "null-constraint": "null value in column",
                    "foreign-key": "foreign key constraint",
                    "unique-constraint": "duplicate key",
                    "function-error": "pl/pgsql function",
                    "transaction-failed": "current transaction is aborted",
                    "database-error": "database error",
                }
                labels = [name for name, match in patterns.items() if match in logs]
                states = sorted(set(re.findall(
                    r"(?:sqlstate|sql_state|code)\s*[:=]\s*\"?([0-9a-z]{5})",
                    logs)))
                print("CP24_AUTH_SIGNUP_CLASSES=" + ",".join(labels or ["unclassified"]))
                print("CP24_AUTH_SQLSTATES=" + ",".join(states or ["not-exposed"]))
                # PostgreSQL logs are inspected in memory and reduced to
                # non-sensitive SQLSTATE/known failure labels before teardown.
                pg_logs = sanitized_container_log(DATABASE)
                pg_labels = [name for name, match in patterns.items()
                             if match in pg_logs]
                pg_states = sorted(set(re.findall(
                    r"(?:sqlstate|sql_state|code)\s*[:=]\s*\"?([0-9a-z]{5})",
                    pg_logs)))
                print("CP24_PG_CLASSES=" + ",".join(pg_labels or ["unclassified"]))
                print("CP24_PG_SQLSTATES=" + ",".join(pg_states or ["not-exposed"]))
                # Emit ONLY the database object type/name, never log lines.
                # SQL object identifiers cannot include user emails/passwords.
                targets = sorted(set(re.findall(
                    r"permission denied for (schema|table|relation|sequence|function) "
                    r"([a-z_][a-z0-9_]*)", logs + "\n" + pg_logs
                )))
                print("CP24_DENIED_DB_OBJECTS=" +
                      ",".join(kind + ":" + name for kind, name in targets)
                      if targets else "CP24_DENIED_DB_OBJECTS=not-exposed")
                raise
            actor = (signup.get("user") or signup).get("id")
            if not actor:
                raise RuntimeError("Genuine disposable GoTrue signup subject missing")
            session = signed_http(AUTH, 9999, "/token?grant_type=password",
                                  env_file.parent,
                                  {"email": email, "password": password})
            token = session.get("access_token")
            if not token:
                raise RuntimeError("Genuine disposable GoTrue sign-in token missing")
            profile = signed_http(AUTH, 9999, "/user", env_file.parent,
                                  token=token)
            if profile.get("id") != actor:
                raise RuntimeError("Signed disposable GoTrue identity mismatch")
            identities.append(actor)
        if len(set(identities)) != 3 or sql("SELECT count(*) FROM auth.users") != "3":
            raise RuntimeError("Exactly three distinct signed identities required")
        print("PASS: three independent actual GoTrue signup, sign-in and signed /user checks")
        # Inspect only non-identifying JWT header/audience/role metadata.
        header, claims = token.split(".")[:2]
        decoded = lambda item: json.loads(base64.urlsafe_b64decode(
            item + "=" * (-len(item) % 4)).decode())
        fields = decoded(header)
        body = decoded(claims)
        print("CP24_SIGNED_JWT_ALG=" + str(fields.get("alg", "missing"))[:12])
        print("CP24_SIGNED_JWT_ROLE=" + str(body.get("role", "missing"))[:25])
        print("CP24_SIGNED_JWT_AUD=" + str(body.get("aud", "missing"))[:25])
        signed_http(REST, 3000, "/", env_file.parent, token=token)
        print("PASS: same-backend authenticated Data API JWT request")
        print("NOT VERIFIED: newly registered module signed writer acceptance")
    finally:
        for name in reversed(created):
            subprocess.run(["docker", "rm", "-f", name],
                           capture_output=True, check=False)

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, KeyError, subprocess.CalledProcessError) as error:
        # No raw Docker logs, tokens, database URIs or passwords are printed.
        detail = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        if any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -:" for c in detail):
            detail = type(error).__name__
        print("BLOCKED: CP23 disposable runtime — " + detail, file=sys.stderr)
        sys.exit(2)
