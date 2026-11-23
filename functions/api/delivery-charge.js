import { json, getPricing, cartWeightKg } from "../_lib/pathao.js";

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Bad request" }, 400); }
  if (!/^\d+$/.test(String(b.city || "")) || !/^\d+$/.test(String(b.zone || ""))) {
    return json({ error: "Select city and zone" }, 400);
  }

  // the weight comes from the products in the cart (saved weights), never from the browser
  let weight = 0.5;
  if (Array.isArray(b.items) && b.items.length && b.items.length <= 20) {
    const items = [];
    for (const i of b.items) {
      const id = String(i.id || "");
      const qty = parseInt(i.qty, 10);
      if (/^[0-9a-f-]{36}$/i.test(id) && qty >= 1 && qty <= 20) items.push({ id, qty });
    }
    if (items.length) weight = await cartWeightKg(env, items);
  }

  try {
    const p = await getPricing(env, b.city, b.zone, weight);
    return json({ charge: p.charge, cod_pct: p.codPct, weight });
  } catch (e) {
    return json({ error: "Could not calculate delivery charge" }, 502);
  }
}
