const C = window.SOLIX_CONFIG;
const db = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);

const Cart = {
  key: "solix_cart",
  get() { try { return JSON.parse(localStorage.getItem(this.key)) || []; } catch (e) { return []; } },
  save(items) { localStorage.setItem(this.key, JSON.stringify(items)); updateCartCount(); },
  count() { return this.get().reduce((n, i) => n + i.qty, 0); }
};

function updateCartCount() {
  const el = document.getElementById("cart-count");
  if (el) el.textContent = Cart.count();
}

function money(n) { return C.CURRENCY + Number(n).toLocaleString("en-US"); }

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showToast(msg, ok) {
  document.querySelectorAll(".toast-error").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "toast-error" + (ok ? " toast-ok" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function renderChrome() {
  const h = document.getElementById("header");
  if (h) h.innerHTML = `
    <header class="site-header">
      <a class="logo" href="index.html">
        <img src="logo.png" alt="SOLIX"
          onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'SOLIX'}))">
      </a>
      <a class="cart-link" href="cart.html">Cart <span class="cart-count" id="cart-count">0</span></a>
    </header>`;

  const f = document.getElementById("footer");
  if (f) {
    let links = "";
    if (C.FACEBOOK_URL) links += `<a href="${esc(C.FACEBOOK_URL)}" target="_blank" rel="noopener">Facebook</a>`;
    if (C.MESSENGER_URL) links += `<a href="${esc(C.MESSENGER_URL)}" target="_blank" rel="noopener">Messenger</a>`;
    f.innerHTML = `<footer class="site-footer">${links}<div>© SOLIX</div></footer>`;
    if (C.MESSENGER_URL) {
      f.innerHTML += `<a class="float-messenger" href="${esc(C.MESSENGER_URL)}" target="_blank" rel="noopener">Chat</a>`;
    }
  }
  updateCartCount();
}

document.addEventListener("DOMContentLoaded", renderChrome);
