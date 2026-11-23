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
  if (!r.ok || !j.access_token) throw new Error("Pathao login failed");
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

/* delivery charge + Pathao's cash-on-delivery percentage for a city and zone */
export async function getPricing(env, city, zone, weight) {
  const r = await pathao(env, "POST", "/aladdin/api/v1/merchant/price-plan", {
    store_id: String(env.PATHAO_STORE_ID),
    item_type: 2,
    delivery_type: 48,
    item_weight: weight || 0.5,
    recipient_city: Number(city),
    recipient_zone: Number(zone)
  });
  const d = r.json && r.json.data;
  const price = d && d.final_price;
  if (!r.ok || typeof price !== "number") throw new Error("Could not get delivery charge");
  const pct = Number(d.cod_percentage);
  return { charge: price, codPct: pct > 0 && pct < 0.5 ? pct : 0 };
}

export async function getCharge(env, city, zone, weight) {
  return (await getPricing(env, city, zone, weight)).charge;
}

/* ---------- Supabase helper (server side, secret key) ---------- */
export async function sb(env, path, opts = {}) {
  const key = String(env.SUPABASE_SERVICE_KEY);
  const r = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + path, {
    ...opts,
    headers: {
      apikey: key,
      ...(key.startsWith("eyJ") ? { Authorization: "Bearer " + key } : {}),
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  return { ok: r.ok, data };
}

/* total weight of a cart in kg, from the weights saved on the products.
   Rounded up to 0.1 kg, at least 0.5 kg, at most 10 kg (Pathao's limits). */
export async function cartWeightKg(env, items) {
  const DEFAULT_G = 250;
  const ids = [...new Set(items.map(i => i.id))];
  const w = {};
  if (ids.length) {
    const r = await sb(env, `/rest/v1/products?id=in.(${ids.join(",")})&select=id,weight_grams`);
    if (r.ok && Array.isArray(r.data)) r.data.forEach(p => { w[p.id] = Number(p.weight_grams) || DEFAULT_G; });
  }
  let grams = 0;
  for (const i of items) grams += (w[i.id] || DEFAULT_G) * i.qty;
  const kg = Math.ceil((grams / 1000) * 10) / 10;
  return Math.min(10, Math.max(0.5, kg));
}
