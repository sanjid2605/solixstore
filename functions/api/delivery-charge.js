import { json, getPricing } from "../_lib/pathao.js";

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Bad request" }, 400); }
  if (!/^\d+$/.test(String(b.city || "")) || !/^\d+$/.test(String(b.zone || ""))) {
    return json({ error: "Select city and zone" }, 400);
  }
  try {
    const p = await getPricing(env, b.city, b.zone);
    return json({ charge: p.charge, cod_pct: p.codPct });
  } catch (e) {
    return json({ error: "Could not calculate delivery charge" }, 502);
  }
}
