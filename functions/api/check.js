export async function onRequestGet({ env }) {
  const names = [
    "PATHAO_BASE_URL", "PATHAO_CLIENT_ID", "PATHAO_CLIENT_SECRET",
    "PATHAO_USERNAME", "PATHAO_PASSWORD", "PATHAO_STORE_ID",
    "SUPABASE_URL", "SUPABASE_SERVICE_KEY"
  ];
  const out = {};
  names.forEach(n => { out[n] = env[n] ? "found" : "MISSING"; });
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
