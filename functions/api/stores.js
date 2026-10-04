import { pathao, json } from "../_lib/pathao.js";

export async function onRequestGet({ env }) {
  try {
    const r = await pathao(env, "GET", "/aladdin/api/v1/stores");
    return json({ status: r.status, body: r.json });
  } catch (e) {
    return json({ error: String(e && e.message) }, 502);
  }
}
