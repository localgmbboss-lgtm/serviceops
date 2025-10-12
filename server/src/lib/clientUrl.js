const CANDIDATE_ENV_KEYS = [
  "CLIENT_BASE_URL",
  "PUBLIC_APP_URL",
  "APP_BASE_URL",
  "PUBLIC_URL",
  "RENDER_EXTERNAL_URL",
  "CLIENT_ORIGIN",
  "CLIENT_URL",
  "APP_URL",
  "WEB_APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "FRONTEND_URL",
  "WEB_URL",
  "SITE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "REACT_APP_BASE_URL",
  "PUBLIC_CLIENT_URL",
];

const DEFAULT_BASE = "http://localhost:3000";

const toOrigin = (parsed) => {
  const port = parsed.port ? `:${parsed.port}` : "";
  return `${parsed.protocol}//${parsed.hostname}${port}`;
};

const tryParseOrigin = (input) => {
  if (!input) return null;
  try {
    const parsed = new URL(input);
    if (!parsed.protocol || !/^https?:$/i.test(parsed.protocol)) return null;
    return toOrigin(parsed);
  } catch {
    return null;
  }
};

const normalizeBaseUrl = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const direct = tryParseOrigin(trimmed);
  if (direct) return direct;

  if (!/^https?:/i.test(trimmed)) {
    const inferred = tryParseOrigin(`https://${trimmed}`);
    if (inferred) return inferred;
  }

  return trimmed.replace(/\/+$/, "");
};

let memoized;

export function getClientBaseUrl() {
  if (memoized) return memoized;

  for (const key of CANDIDATE_ENV_KEYS) {
    const normalized = normalizeBaseUrl(process.env[key]);
    if (normalized) {
      memoized = normalized;
      return memoized;
    }
  }

  memoized = DEFAULT_BASE;
  return memoized;
}

const pickHeader = (req, header) => {
  if (!req) return null;
  try {
    if (typeof req.get === "function") {
      const value = req.get(header);
      if (value) return value;
    }
  } catch {
    // ignore
  }

  const raw = req.headers?.[header];
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0];
  return raw;
};

export function resolveClientBaseUrl(req) {
  const envBase = getClientBaseUrl();
  if (envBase && envBase !== DEFAULT_BASE) {
    return envBase;
  }

  const origin = pickHeader(req, "origin");
  const normalizedOrigin = normalizeBaseUrl(origin);
  if (normalizedOrigin) {
    return normalizedOrigin;
  }

  const referer = pickHeader(req, "referer");
  const normalizedReferer = normalizeBaseUrl(referer);
  if (normalizedReferer) {
    return normalizedReferer;
  }

  return envBase || DEFAULT_BASE;
}