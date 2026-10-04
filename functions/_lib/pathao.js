let cached = { token: null, exp: 0 };

const base = env => env.PATHAO_BASE_URL.replace(/\/$/, "");

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra }
  });
}

async function getToken(env) {
  const now = Date.now();
  if (cached.token && now < cached.exp) return cached.token;
  const r = await fetch(base(env) + "/aladdin/api/v1/issue-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.PATHAO_CLIENT_ID,
      client_secret: env.PATHAO_CLIENT_SECRET,
      grant_type: "password",
      username: env.PATHAO_USERNAME,
      password: env.PATHAO_PASSWORD
    })
  });
  const j = await r.json().catch(() => ({}));
   if (!r.ok || !j.access_token) throw new Error("Pathao login failed: " + r.status + " " + String(j.message || j.error || "").slice(0, 120)); if (!r.ok || !j.access_token) throw new Error("Pathao login failed");
  cached = { token: j.access_token, exp: now + Math.max(60, (j.expires_in || 7200) - 3600) * 1000 };
  return cached.token;
}

export async function pathao(env, method, path, body) {
  const call = async () => {
    const token = await getToken(env);
    return fetch(base(env) + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: body ? JSON.stringify(body) : undefined
    });
  };
  let r = await call();
  if (r.status === 401) { cached = { token: null, exp: 0 }; r = await call(); }
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

export async function getCharge(env, city, zone, weight) {
  const r = await pathao(env, "POST", "/aladdin/api/v1/merchant/price-plan", {
    store_id: String(env.PATHAO_STORE_ID),
    item_type: 2,
    delivery_type: 48,
    item_weight: weight || 0.5,
    recipient_city: Number(city),
    recipient_zone: Number(zone)
  });
  const price = r.json && r.json.data && r.json.data.final_price;
  if (!r.ok || typeof price !== "number") throw new Error("Could not get delivery charge");
  return price;
}
