#!/usr/bin/env python3
"""Verify three real GoTrue sign-ins against existing disposable LOCAL Auth only.

Never touches the connected staging/production project. Creates exactly three
random QA identities through the local GoTrue API and removes only those identities.
"""
import json
import secrets
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

DATABASE = "supabase_db_cp16019-disposable-local"
AUTH = "supabase_auth_cp16019-disposable-local"
ORIGIN = "http://127.0.0.1:54321"
EMAIL_DOMAIN = "example.com"

def command(*args, stdin=None):
    result = subprocess.run(list(args), input=stdin, capture_output=True,
                            text=True, check=True)
    return result.stdout.strip()

def database(statement):
    return command("docker", "exec", DATABASE, "psql", "-X", "-v",
                   "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
                   "-Atqc", statement)

def http_request(route, key, payload=None, bearer=None):
    headers = {"apikey": key, "Content-Type": "application/json"}
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        ORIGIN + route, headers=headers, data=data,
        method="POST" if payload is not None else "GET")
    with urllib.request.urlopen(request, timeout=9) as res:
        return res.status, json.load(res)

def snapshot():
    return database(
        "SELECT (SELECT count(*) FROM auth.users)||':'||"
        "(SELECT count(*) FROM auth.sessions)||':'||"
        "(SELECT count(*) FROM public.profiles)||':'||"
        "(SELECT count(*) FROM public.workspace_members)||':'||"
        "(SELECT count(*) FROM public.wm_workspace_application_roles)||':'||"
        "(SELECT count(*) FROM public.wm_application_role_audit)"
    )

def local_key(workdir):
    lines = command("supabase", "status", "--workdir", workdir,
                    "--output", "env").splitlines()
    settings = {}
    for line in lines:
        if "=" in line:
            key, value = line.split("=", 1)
            settings[key] = value.strip().strip('"')
    if settings.get("API_URL") != ORIGIN or not settings.get("ANON_KEY"):
        raise RuntimeError("Disposable local API origin or anon key not verified")
    return settings["ANON_KEY"]

def run():
    if not (len(sys.argv) == 2 and sys.argv[1] == "--local-disposable"):
        raise RuntimeError("Disposable local opt-in is required")
    inspected = json.loads(command("docker", "inspect", AUTH))[0]
    if inspected["Config"]["Labels"].get("com.supabase.cli.project") != "cp16019-disposable-local":
        raise RuntimeError("Unexpected Auth container target")
    workdir = inspected["Config"]["Labels"].get("com.supabase.cli.workdir")
    if not workdir or not workdir.startswith("/") or not __import__("os").path.isdir(workdir):
        raise RuntimeError("Verified disposable Supabase workdir unavailable")
    # Run only the read-only migration fingerprint check; never transplant
    # this ledger into a newer Auth instance as if it were a migration.
    import pathlib
    ledger_sql = pathlib.Path(__file__).resolve().parents[1] / (
        "sql/acceptance/cp-native-app-autosync-18-auth-migration-ledger.sql")
    command("docker","exec","-i",DATABASE,"psql","-X","-v","ON_ERROR_STOP=1",
            "-U","postgres","-d","postgres",stdin=ledger_sql.read_text())
    before = snapshot()
    anon = local_key(workdir)
    emails = []
    subjects = []
    last_token = None
    error = None
    try:
        for i in range(3):
            email = "cp18.qa." + secrets.token_hex(12) + "@" + EMAIL_DOMAIN
            password = secrets.token_urlsafe(32) + "Q9!"
            emails.append(email)
            _, signed_up = http_request("/auth/v1/signup", anon,
                                        {"email": email, "password": password})
            identity = (signed_up.get("user") or signed_up).get("id")
            if not identity:
                raise RuntimeError("GoTrue signup did not persist a subject")
            subjects.append(identity)
            _, signed = http_request("/auth/v1/token?grant_type=password", anon,
                                     {"email": email, "password": password})
            token = signed.get("access_token")
            if not token:
                raise RuntimeError("GoTrue password sign-in did not return access token")
            status, actor = http_request("/auth/v1/user", anon, bearer=token)
            if status != 200 or actor.get("id") != identity:
                raise RuntimeError("Independently signed /user verification failed")
            last_token = token
            try:
                http_request("/auth/v1/token?grant_type=password", anon,
                             {"email": email, "password": "incorrect-password"})
                raise RuntimeError("GoTrue unexpectedly accepted invalid password")
            except urllib.error.HTTPError as denied:
                if denied.code not in (400, 401, 422):
                    raise RuntimeError("Unexpected invalid-password response")
        if len(set(subjects)) != 3:
            raise RuntimeError("Independent GoTrue users not established")
        if int(database("SELECT count(*) FROM auth.users")) != int(before.split(":")[0]) + 3:
            raise RuntimeError("Local Auth count differs from three unique QA subjects")
        print("VERIFIED: three independent REAL local GoTrue signup/password sign-in/bearer /user checks")
        print("VERIFIED: three signed QA identities persisted in disposable LOCAL Auth")
    except Exception as exc:
        error = exc
    finally:
        if emails:
            # Emails below are random strings generated by this script, not user input.
            literals = ",".join("'" + email + "'" for email in emails)
            # Cleanup only exact QA subjects in a single transaction. The domain
            # predicate additionally prevents deletion of unrelated identities.
            cleanup = (
                "BEGIN;"
                "DELETE FROM public.profiles WHERE id IN "
                "(SELECT id FROM auth.users WHERE email IN (" + literals + ") "
                "AND email LIKE 'cp18.qa.%@example.com');"
                "DELETE FROM auth.users WHERE email IN (" + literals + ") "
                "AND email LIKE 'cp18.qa.%@example.com';"
                "COMMIT;")
            try:
                database(cleanup)
            except Exception:
                raise RuntimeError("LOCAL QA CLEANUP FAILED: inspect only cp18.qa fixture records")
        after = snapshot()
        if after != before:
            raise RuntimeError("LOCAL QA CLEANUP FAILED: Auth, workspace, role or audit baseline changed")
        print("VERIFIED: QA fixture cleanup restored Auth, sessions, profiles, memberships, roles and audit counts")
        if last_token:
            try:
                http_request("/auth/v1/user", anon, bearer=last_token)
                raise RuntimeError("Deleted QA account still resolves through GoTrue /user")
            except urllib.error.HTTPError as denied:
                if denied.code not in (401, 403):
                    raise RuntimeError("Unexpected deleted-account Auth response")
            print("VERIFIED: deleted QA subject no longer resolves through GoTrue /user")
    if error:
        raise error
    print("NOT VERIFIED: genuine remote staging sign-in, module role HTTP writer, new module contract")

if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        # No tokens, passwords, emails, user IDs or URLs in logs.
        print("BLOCKED: CP18 local GoTrue QA (" + type(exc).__name__ + ")",file=sys.stderr)
        sys.exit(2)
