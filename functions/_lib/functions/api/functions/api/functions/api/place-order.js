import { pathao, json, getCharge } from "../_lib/pathao.js";

const SIZES = ["S", "M", "L", "XL", "XXL"];
const WEIGHT = 0.5; // kg per order

async function sb(env, path, opts = {}) {
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

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Bad request" }, 400); }

  const name = String(b.name || "").trim().slice(0, 100);
  let phone = String(b.phone || "").replace(/[\s-]/g, "").replace(/^\+?88/, "");
  const address = String(b.address || "").trim().slice(0, 200);
  const city = String(b.city || ""), zone = String(b.zone || ""), area = String(b.area || "");
  const cityName = String(b.cityName || "").slice(0, 60);
  const zoneName = String(b.zoneName || "").slice(0, 60);
  const areaName = String(b.areaName || "").slice(0, 60);

  if (name.length < 2) return json({ error: "Enter your name" }, 400);
  if (!/^01[3-9]\d{8}$/.test(phone)) return json({ error: "Enter a valid 11-digit mobile number" }, 400);
  if (address.length < 10) return json({ error: "Enter your full address (at least 10 characters)" }, 400);
  if (!/^\d+$/.test(city) || !/^\d+$/.test(zone)) return json({ error: "Select city and zone" }, 400);
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 20) return json({ error: "Cart is empty" }, 400);

  const map = new Map();
  for (const i of b.items) {
    const id = String(i.id || "");
    const size = String(i.size || "");
    const qty = parseInt(i.qty, 10);
    if (!/^[0-9a-f-]{36}$/i.test(id) || !(qty >= 1 && qty <= 20) || (size && !SIZES.includes(size))) {
      return json({ error: "Invalid cart" }, 400);
    }
    const k = id + "|" + size;
    map.set(k, { id, size, qty: (map.get(k)?.qty || 0) + qty });
  }
  const lines = [...map.values()];

  const ids = [...new Set(lines.map(l => l.id))];
  const pr = await sb(env, `/rest/v1/products?id=in.(${ids.join(",")})&select=id,name,price,has_sizes,is_stock_out`);
  if (!pr.ok || !Array.isArray(pr.data)) return json({ error: "Could not check products" }, 500);
  const prod = {};
  pr.data.forEach(p => { prod[p.id] = p; });

  const orderItems = [];
  let subtotal = 0, totalQty = 0;
  for (const l of lines) {
    const p = prod[l.id];
    if (!p || p.is_stock_out) return json({ error: "Some items are no longer available" }, 409);
    if (p.has_sizes && !l.size) return json({ error: "Select the size please" }, 400);
    const size = p.has_sizes ? l.size : "";
    orderItems.push({ id: l.id, name: p.name, size, qty: l.qty, price: Number(p.price) });
    subtotal += Number(p.price) * l.qty;
    totalQty += l.qty;
  }

  let charge;
  try { charge = await getCharge(env, city, zone, WEIGHT); }
  catch (e) { return json({ error: "Could not calculate delivery charge. Try again." }, 502); }

  const total = Math.round(subtotal + charge);
  const stockPayload = orderItems.map(i => ({ id: i.id, size: i.size, qty: i.qty }));

  const rs = await sb(env, "/rest/v1/rpc/reserve_stock", { method: "POST", body: JSON.stringify({ p_items: stockPayload }) });
  if (!rs.ok) return json({ error: "Sorry, some items just went out of stock." }, 409);

  const ins = await sb(env, "/rest/v1/orders", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      customer_name: name, phone, city: cityName, zone: zoneName, area: areaName, address,
      items: orderItems, subtotal, delivery_charge: charge, total,
      status: "new", pathao_status: "pending"
    })
  });
  if (!ins.ok || !Array.isArray(ins.data) || !ins.data[0]) {
    await sb(env, "/rest/v1/rpc/release_stock", { method: "POST", body: JSON.stringify({ p_items: stockPayload }) });
    return json({ error: "Could not save order. Try again." }, 500);
  }
  const order = ins.data[0];

  let consignment = null, status = "failed";
  try {
    const fullAddress = [address, areaName, zoneName, cityName].filter(Boolean).join(", ");
    const desc = orderItems.map(i => `${i.name}${i.size ? " (" + i.size + ")" : ""} x${i.qty}`).join(", ").slice(0, 200);
    const pc = await pathao(env, "POST", "/aladdin/api/v1/orders", {
      store_id: Number(env.PATHAO_STORE_ID),
      merchant_order_id: order.id,
      recipient_name: name,
      recipient_phone: phone,
      recipient_address: fullAddress,
      delivery_type: 48,
      item_type: 2,
      special_instruction: "",
      item_quantity: totalQty,
      item_weight: String(WEIGHT),
      item_description: desc,
      amount_to_collect: total
    });
    consignment = pc.json && pc.json.data && pc.json.data.consignment_id;
    if (pc.ok && consignment) status = "created";
  } catch (e) {}

  await sb(env, `/rest/v1/orders?id=eq.${order.id}`, {
    method: "PATCH",
    body: JSON.stringify({ pathao_consignment_id: consignment ? String(consignment) : null, pathao_status: status })
  });

  return json({ ok: true, orderNo: order.id.slice(0, 8).toUpperCase(), subtotal, charge, total });
}
