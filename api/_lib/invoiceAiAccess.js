// Access control for the AI invoice reader.
// Files and folders that start with "_" inside /api are not exposed by Vercel as endpoints.
//
// The endpoint spends the company's OpenAI credit, so every request must come from a
// signed-in MarginFlow user and, when a company id is supplied, from an active member
// of that company. Verification is delegated to Supabase with the caller's own token,
// so no service-role key is needed here and row-level security still applies.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const INVOICE_AI_LIMITS = Object.freeze({
  maxBodyBytes: 4 * 1024 * 1024, // Vercel rejects bodies above ~4.5 MB anyway; fail early with a clear message.
  requestsPerWindow: 30,
  windowMs: 10 * 60 * 1000,
});

export function supabaseServerConfig(env = process.env) {
  return {
    url: String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/+$/, ""),
    anonKey: String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ""),
  };
}

export function bearerToken(headers = {}) {
  const raw = headers.authorization || headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(Array.isArray(raw) ? raw[0] : raw).trim());
  return match ? match[1].trim() : "";
}

// Best-effort limiter. Serverless instances do not share memory, so this only slows down
// abuse from a single warm instance; a shared quota table is still a launch requirement.
export function createRateLimiter({ requestsPerWindow, windowMs } = INVOICE_AI_LIMITS, now = () => Date.now()) {
  const hits = new Map();
  return function allow(key) {
    const time = now();
    const recent = (hits.get(key) || []).filter((stamp) => time - stamp < windowMs);
    if (recent.length >= requestsPerWindow) {
      hits.set(key, recent);
      return false;
    }
    recent.push(time);
    hits.set(key, recent);
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    return true;
  };
}

function denied(statusCode, error, detail) {
  return { ok: false, statusCode, error, detail };
}

export async function verifyInvoiceAiAccess({ headers = {}, companyId = "", env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const { url, anonKey } = supabaseServerConfig(env);
  if (!url || !anonKey) {
    return denied(503, "Invoice reading is not configured", "The server cannot verify the signed-in user. Set SUPABASE_URL and SUPABASE_ANON_KEY (or the VITE_ equivalents) in Vercel.");
  }
  const token = bearerToken(headers);
  if (!token) return denied(401, "Sign in required", "Sign in to MarginFlow again and retry.");

  let user;
  try {
    const response = await fetchImpl(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return denied(401, "Session expired", "Sign in to MarginFlow again and retry.");
    user = await response.json();
  } catch {
    return denied(503, "Could not verify your session", "Try again in a moment.");
  }
  if (!user?.id) return denied(401, "Session expired", "Sign in to MarginFlow again and retry.");

  const company = String(companyId || "").trim();
  if (company && UUID_PATTERN.test(company)) {
    try {
      const response = await fetchImpl(`${url}/rest/v1/rpc/is_active_company_member`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ target_company_id: company }),
      });
      if (!response.ok) return denied(503, "Could not verify company access", "Try again in a moment.");
      const isMember = await response.json();
      if (isMember !== true) return denied(403, "No access to this company", "Your account is not an active member of this company.");
    } catch {
      return denied(503, "Could not verify company access", "Try again in a moment.");
    }
  }

  return { ok: true, userId: user.id, companyId: company };
}
