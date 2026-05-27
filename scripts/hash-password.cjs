#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Bcrypt hash generator for the SUPERADMIN_PASSWORD_HASH env var.
 *
 * Reads the password from an interactive prompt (no echo, no shell
 * history) and prints the bcrypt hash to stdout. Paste the hash into
 * Render → Environment → SUPERADMIN_PASSWORD_HASH.
 *
 * Usage:
 *   node scripts/hash-password.js
 *
 * Requires bcryptjs to be installed in the api-server workspace —
 * which it already is, so resolve from there.
 */

const path = require("path");
const readline = require("readline");

// Resolve bcryptjs from the api-server's node_modules so we don't need a
// separate install at the repo root.
const apiServerNodeModules = path.resolve(__dirname, "..", "artifacts", "api-server", "node_modules");
let bcrypt;
try {
  bcrypt = require(path.join(apiServerNodeModules, "bcryptjs"));
} catch (err) {
  console.error("\nCould not load bcryptjs.");
  console.error("Run `pnpm install` inside artifacts/api-server first.\n");
  process.exit(1);
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Hide the typed characters from the terminal by intercepting writes.
    const stdout = process.stdout;
    const originalWrite = stdout.write.bind(stdout);
    let started = false;
    stdout.write = (chunk, ...rest) => {
      if (started && typeof chunk === "string" && chunk !== "\n" && chunk !== "\r\n") {
        return originalWrite("", ...rest);
      }
      return originalWrite(chunk, ...rest);
    };
    rl.question(question, (answer) => {
      stdout.write = originalWrite;
      rl.close();
      resolve(answer);
    });
    started = true;
  });
}

(async () => {
  console.log("");
  console.log("Generate a bcrypt hash for SUPERADMIN_PASSWORD_HASH.");
  console.log("Your input will not be echoed to the terminal.");
  console.log("");
  const pw1 = await promptHidden("New superadmin password: ");
  console.log("");
  const pw2 = await promptHidden("Confirm password:        ");
  console.log("");

  if (!pw1 || pw1.length < 12) {
    console.error("Password must be at least 12 characters. Aborted.\n");
    process.exit(1);
  }
  if (pw1 !== pw2) {
    console.error("Passwords do not match. Aborted.\n");
    process.exit(1);
  }
  // Reject the known-compromised legacy password explicitly so it can't
  // accidentally be re-used.
  if (pw1 === "Zetrynx.123@") {
    console.error("That password has been in the repo's git history and is compromised. Pick a new one.\n");
    process.exit(1);
  }

  const hash = bcrypt.hashSync(pw1, 12);
  console.log("─────────────────────────────────────────────────────────────");
  console.log("Paste this entire string into Render → SUPERADMIN_PASSWORD_HASH:");
  console.log("");
  console.log(hash);
  console.log("");
  console.log("It is safe to share/save the hash. Treat the plaintext password as secret.");
  console.log("─────────────────────────────────────────────────────────────");
})();
