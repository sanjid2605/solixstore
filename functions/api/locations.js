import { pathao, json } from "../_lib/pathao.js";

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const type = q.get("type");
  let path, idKey, nameKey;

  if (type === "cities") {
    path = "/aladdin/api/v1/city-list"; idKey = "city_id"; nameKey = "city_name";
  } else if (type === "zones" && /^\d+$/.test(q.get("city") || "")) {
    path = `/aladdin/api/v1/cities/${q.get("city")}/zone-list`; idKey = "zone_id"; nameKey = "zone_name";
  } else if (type === "areas" && /^\d+$/.test(q.get("zone") || "")) {
    path = `/aladdin/api/v1/zones/${q.get("zone")}/area-list`; idKey = "area_id"; nameKey = "area_name";
  } else {
    return json({ error: "Bad request" }, 400);
  }

  try {
    const r = await pathao(env, "GET", path);
    if (!r.ok) return json({ error: "Could not load list" }, 502);
    const list = (r.json && r.json.data && r.json.data.data) || [];
    const items = list
      .filter(x => x.home_delivery_available !== false)
      .map(x => ({ id: x[idKey], name: String(x[nameKey] || "").trim() }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return json({ items }, 200, { "Cache-Control": "public, max-age=3600" });
  } catch (e) {
        return json({ error: "Delivery service unavailable", detail: String(e && e.message) }, 502);
  }
}
