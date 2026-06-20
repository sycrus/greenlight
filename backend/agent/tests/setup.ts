// Loads .env from the repo root into process.env before tests run.
// Only sets vars that aren't already in the environment (CI values take precedence).
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env")

try {
  const lines = readFileSync(root, "utf-8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const raw = trimmed.slice(eq + 1).trim()
    // Strip inline comments unless value is quoted
    const val = raw.startsWith('"') || raw.startsWith("'")
      ? raw.replace(/^(['"])(.*)\1$/, "$2")
      : raw.replace(/\s+#.*$/, "")
    if (key && !(key in process.env)) process.env[key] = val
  }
} catch {
  // .env not present (CI) — env vars expected from the environment directly
}
