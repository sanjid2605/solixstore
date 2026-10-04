const C = window.SOLIX_CONFIG;
const db = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);

const ICON_FB = `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#1877F2"/><path fill="#fff" d="M13.4 24v-8.6h2.9l.45-3.4H13.4V9.9c0-.98.27-1.65 1.68-1.65h1.8V5.2c-.31-.04-1.38-.13-2.62-.13-2.6 0-4.38 1.58-4.38 4.5V12H6.9v3.4h2.98V24h3.52z"/></svg>`;

const ICON_MSG = `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><defs><linearGradient id="mg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0099FF"/><stop offset=".6" stop-color="#A033FF"/><stop offset="1" stop-color="#FF5280"/></linearGradient></defs><path fill="url(#mg)" d="M12 1C5.9 1 1 5.6 1 11.4c0 3.2 1.5 6 3.8 7.9V23l3.5-1.9c1.2.3 2.4.5 3.7.5 6.1 0 11-4.6 11-10.4S18.1 1 12 1z"/><path fill="#fff" d="M5.2 14.6L10.1 9l3.1 2.6L18.8 9l-4.9 6-3.1-2.6z"/></svg>`;

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
    let icons = "";
    if (C.FACEBOOK_URL) icons += `<a class="social-icon" href="${esc(C.FACEBOOK_URL)}" target="_blank" rel="noopener" aria-label="Facebook">${ICON_FB}</a>`;
    f.innerHTML = `<footer class="site-footer"><div style="margin-bottom:8px">${icons}</div><div>© SOLIX</div></footer>`;
  }
  updateCartCount();
}

document.addEventListener("DOMContentLoaded", renderChrome);
