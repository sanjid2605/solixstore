import { pathao, json } from "../_lib/pathao.js";

export async function onRequestGet({ env }) {
  const out = { env_store_id: String(env.PATHAO_STORE_ID || "") };
  try {
    const s = await pathao(env, "GET", "/aladdin/api/v1/stores");
    const list = (s.json && s.json.data && s.json.data.data) || [];
    out.store_count = list.length;
    out.match = list.some(x => String(x.store_id) === out.env_store_id.trim());

    const z = await pathao(env, "GET", "/aladdin/api/v1/cities/1/zone-list");
    const zones = ((z.json && z.json.data && z.json.data.data) || []).slice(0, 3);
    out.tests = [];
    for (const zone of zones) {
      for (const sid of [out.env_store_id.trim(), Number(out.env_store_id)]) {
        const r = await pathao(env, "POST", "/aladdin/api/v1/merchant/price-plan", {
          store_id: sid, item_type: 2, delivery_type: 48, item_weight: 0.5,
          recipient_city: 1, recipient_zone: zone.zone_id
        });
        out.tests.push({
          zone: zone.zone_name,
          type: typeof sid,
          status: r.status,
          price: r.json && r.json.data && r.json.data.final_price,
          msg: r.json && r.json.message
        });
      }
    }
  } catch (e) {
    out.error = String(e && e.message);
  }
  return json(out);
}
