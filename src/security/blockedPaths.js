/** Path segments and filenames that must never be served */
const BLOCKED_SEGMENTS = [
  ".env",
  ".git",
  ".svn",
  ".hg",
  ".aws",
  ".docker",
  "wp-admin",
  "wp-login",
  "wp-content",
  "wp-includes",
  "phpmyadmin",
  "pma",
  "server-status",
  "server-info",
  "actuator",
  "web.config",
  "weblogic",
  "cgi-bin",
  "vendor/phpunit",
  "telescope",
  "debug",
  "_profiler",
  "config.php",
  "database.yml",
  "id_rsa",
  "authorized_keys",
];

const BLOCKED_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "package.json",
  "package-lock.json",
  "ecosystem.config.js",
  "composer.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "docker-compose.yml",
  "Dockerfile",
  "Procfile",
]);

/** URL substrings typical of automated exploit probes */
const EXPLOIT_SIGNATURES = [
  /\.\./,
  /%2e%2e/i,
  /union\s+select/i,
  /<script/i,
  /eval\s*\(/i,
  /base64_decode/i,
  /\/etc\/passwd/i,
  /proc\/self/i,
  /wget\s+/i,
  /curl\s+/i,
  /\$\{jndi:/i,
  /php:\/\/filter/i,
  /\/\.git\//i,
  /\/\.env/i,
];

function normalizePath(raw) {
  if (!raw || typeof raw !== "string") return "/";
  let p = raw.split("?")[0].split("#")[0];
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep encoded form
  }
  p = p.replace(/\\/g, "/").toLowerCase();
  return p;
}

function hasBlockedSegment(path) {
  const segments = path.split("/").filter(Boolean);
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    if (BLOCKED_SEGMENTS.some((b) => lower === b || lower.startsWith(b))) {
      return true;
    }
    if (lower.startsWith(".env")) return true;
    if (lower.endsWith(".pem") || lower.endsWith(".key")) return true;
    if (BLOCKED_FILES.has(lower)) return true;
  }
  return false;
}

function hasTraversal(path) {
  return (
    path.includes("..") ||
    path.includes("\0") ||
    /%2e%2e/i.test(path) ||
    /\.\.%2f/i.test(path)
  );
}

function hasExploitSignature(path, url) {
  const haystack = `${path} ${url || ""}`;
  return EXPLOIT_SIGNATURES.some((re) => re.test(haystack));
}

function classifyBlockedRequest(req) {
  const path = normalizePath(req.originalUrl || req.url || req.path);
  const raw = req.originalUrl || req.url || "";

  if (hasTraversal(path) || hasTraversal(raw)) {
    return { blocked: true, reason: "path_traversal", path };
  }
  if (hasBlockedSegment(path)) {
    return { blocked: true, reason: "blocked_path", path };
  }
  if (hasExploitSignature(path, raw)) {
    return { blocked: true, reason: "exploit_signature", path };
  }
  return { blocked: false, path };
}

module.exports = {
  BLOCKED_SEGMENTS,
  BLOCKED_FILES,
  classifyBlockedRequest,
  normalizePath,
};
