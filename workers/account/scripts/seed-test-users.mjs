import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ACCOUNTS = [
  { login: "test", password: "test", tier: "account" },
  { login: "testpro", password: "testpro", tier: "pro" },
  { login: "testunlimited", password: "testunlimited", tier: "unlimited" },
];

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const bits = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
  return `pbkdf2$100000$${b64url(salt)}$${b64url(bits)}`;
}

const ts = new Date().toISOString();
const emails = ACCOUNTS.map((a) => `${a.login}@local.test`);
const sql = [
  `DELETE FROM entitlements WHERE user_id IN (SELECT id FROM users WHERE email IN (${emails.map((e) => `'${e}'`).join(",")}));`,
  `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email IN (${emails.map((e) => `'${e}'`).join(",")}));`,
  `DELETE FROM users WHERE email IN (${emails.map((e) => `'${e}'`).join(",")});`,
];

for (const a of ACCOUNTS) {
  const id = randomUUID();
  const email = `${a.login}@local.test`;
  const hash = hashPassword(a.password).replace(/'/g, "''");
  sql.push(
    `INSERT INTO users (id, email, password_hash, locale, marketing_opt_in, email_verified_at, created_at, updated_at) VALUES ('${id}', '${email}', '${hash}', 'cs', 0, '${ts}', '${ts}', '${ts}');`,
  );
  sql.push(`INSERT INTO entitlements (user_id, tier, status) VALUES ('${id}', '${a.tier}', 'active');`);
}

const root = dirname(fileURLToPath(import.meta.url));
const file = join(tmpdir(), "ft-seed-test-users.sql");
writeFileSync(file, sql.join("\n") + "\n");

const remote = process.argv.includes("--remote");
const run = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "ft-account", remote ? "--remote" : "--local", `--file=${file}`],
  {
    cwd: join(root, ".."),
    stdio: "inherit",
    shell: false,
  },
);
process.exit(run.status ?? 1);
