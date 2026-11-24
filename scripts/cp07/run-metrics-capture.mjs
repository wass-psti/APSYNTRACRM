import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export function isValidSecretApiKey(value) {
  return typeof value === "string" && /^sb_secret_[A-Za-z0-9_-]+$/.test(value);
}

export function readSecretFromTerminal({
  input = process.stdin,
  output = process.stdout,
} = {}) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Run this command in an interactive Terminal window.");
  }

  return new Promise((resolveSecret, reject) => {
    let secret = "";

    function finish(error) {
      input.off("data", handleInput);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolveSecret(secret);
      secret = "";
    }

    function handleInput(buffer) {
      for (const character of String(buffer)) {
        if (character === "\u0003") {
          finish(new Error("Cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          secret = secret.slice(0, -1);
          continue;
        }
        if (character >= " " && character !== "\u007f") {
          secret += character;
        }
      }
    }

    output.write("Enter the existing Supabase Secret API key (input hidden): ");
    input.setRawMode(true);
    input.resume();
    input.on("data", handleInput);
  });
}

async function main() {
  let secret;
  try {
    secret = await readSecretFromTerminal();
  } catch (error) {
    if (error.message === "Cancelled") {
      console.error("Metrics capture cancelled. No request was made.");
      process.exitCode = 130;
      return;
    }
    console.error(error.message);
    process.exitCode = 2;
    return;
  }

  if (!isValidSecretApiKey(secret)) {
    console.error(
      "The entered value is not a valid existing Supabase Secret API key. No request was made.",
    );
    process.exitCode = 2;
    secret = "";
    return;
  }

  const scriptPath = fileURLToPath(import.meta.url);
  const repoRoot = resolve(dirname(scriptPath), "../..");
  const childEnvironment = {
    ...process.env,
    SUPABASE_METRICS_SECRET_KEY: secret,
  };
  let child;
  try {
    child = spawn(
      process.execPath,
      [resolve(repoRoot, "scripts/cp06/capture-metrics.mjs")],
      {
        cwd: repoRoot,
        env: childEnvironment,
        stdio: "inherit",
      },
    );
  } catch {
    secret = "";
    childEnvironment.SUPABASE_METRICS_SECRET_KEY = "";
    console.error("Metrics capture process could not start.");
    process.exitCode = 1;
    return;
  }

  secret = "";
  childEnvironment.SUPABASE_METRICS_SECRET_KEY = "";

  try {
    const exitCode = await new Promise((resolveExit, reject) => {
      child.once("error", () =>
        reject(new Error("Metrics capture process could not start.")),
      );
      child.once("exit", (code) => resolveExit(code ?? 1));
    });
    process.exitCode = exitCode;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main().catch(() => {
    console.error("Secret-safe metrics runner failed.");
    process.exitCode = 1;
  });
}
