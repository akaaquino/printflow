import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".next",
  "node_modules",
  "out",
  "build",
  "coverage",
]);
const ignoredFiles = new Set([
  "CLAUDE.md",
  "SECURITY.md",
  "package-lock.json",
  "security-check.mjs",
  "tsconfig.tsbuildinfo",
]);
const allowedExtensions = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".env",
  ".example",
  ".rules",
]);

const findings = [];

const secretPatterns = [
  {
    name: "OpenAI API key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: "Private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----/g,
  },
  {
    name: "Generic hardcoded secret",
    pattern:
      /\b(?:token|secret|password|apiKey|api_key|clientSecret|client_secret|privateKey|private_key|accessToken|access_token|refreshToken|refresh_token|authToken|auth_token|secretKey|secret_key)\s*[:=]\s*["'][^"']{16,}["']/gi,
  },
  {
    name: "AWS access key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    name: "Google/Firebase API key",
    pattern: /\bAIzaSy[0-9A-Za-z_-]{33}\b/g,
  },
  {
    name: "Stripe API key",
    pattern: /\b(?:sk|pk|rk)_(?:test|live)_[0-9A-Za-z]{16,}\b/g,
  },
  {
    name: "Slack token",
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
  },
];

const riskyPatterns = [
  {
    name: "Possible unsafe eval",
    pattern: /\beval\s*\(/g,
  },
  {
    name: "Possible Function constructor",
    pattern: /\bnew\s+Function\s*\(/g,
  },
  {
    name: "Possible hard reload",
    pattern: /\blocation\.reload\s*\(/g,
  },
];

function shouldReadFile(filePath) {
  const basename = path.basename(filePath);
  if (ignoredFiles.has(basename)) return false;
  if (basename.startsWith(".env") && basename !== ".env.example") return false;

  const extension = path.extname(filePath);
  return allowedExtensions.has(extension) || basename.includes(".env.example");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        await walk(fullPath);
      }
      continue;
    }

    if (!entry.isFile() || !shouldReadFile(fullPath)) continue;

    const fileStat = await stat(fullPath);
    if (fileStat.size > 512 * 1024) continue;

    const content = await readFile(fullPath, "utf8");
    const relativePath = path.relative(root, fullPath);

    for (const check of [...secretPatterns, ...riskyPatterns]) {
      check.pattern.lastIndex = 0;
      if (check.pattern.test(content)) {
        findings.push(`${relativePath}: ${check.name}`);
      }
    }
  }
}

await walk(root);

if (findings.length > 0) {
  console.error("Security check found issues:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Security check passed.");
