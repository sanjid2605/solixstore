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
  const isShop = !!document.getElementById("grid");
  if (h) h.innerHTML = `
    <header class="site-header">
      <a class="logo" href="index.html">
        <img src="logo.png" alt="SOLIX"
          onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'SOLIX'}))">
      </a>
      ${isShop ? `<div class="head-search"><input id="search" type="search" placeholder="জার্সি খুঁজুন..." autocomplete="off" enterkeyhint="search"></div>` : ""}
      <a class="cart-link" href="cart.html">Cart <span class="cart-count" id="cart-count">0</span></a>
    </header>`;

  const f = document.getElementById("footer");
  if (f) {
    let care = "", share = "";
    if (C.FACEBOOK_URL) {
      const u = esc(C.FACEBOOK_URL);
      care += `<a class="care-link" href="${u}" target="_blank" rel="noopener"><span class="ci">${ICON_FB}</span><span>Facebook Page</span></a>`;
      share += `<a class="social-icon" href="${u}" target="_blank" rel="noopener" aria-label="Facebook">${ICON_FB}</a>`;
    }
    if (C.MESSENGER_URL) {
      const m = esc(C.MESSENGER_URL);
      care += `<a class="care-link" href="${m}" target="_blank" rel="noopener"><span class="ci">${ICON_MSG}</span><span>Messenger</span></a>`;
      share += `<a class="social-icon" href="${m}" target="_blank" rel="noopener" aria-label="Messenger">${ICON_MSG}</a>`;
    }
    f.innerHTML = `
      <footer class="site-footer">
        <div class="foot-grid">
          <div class="foot-care">
            <h4>CUSTOMER CARE</h4>
            ${care}
          </div>
          <div class="foot-brand">
            <img class="foot-logo" src="logo.png" alt="SOLIX" onerror="this.style.display='none'">
            <p>Jerseys &amp; more, delivered to your door.</p>
            ${share ? `<h4>SHARE WITH</h4><div class="foot-social">${share}</div>` : ""}
          </div>
          <div></div>
        </div>
        <div class="foot-copy">© SOLIX</div>
      </footer>
      ${C.MESSENGER_URL ? `<a class="float-messenger" href="${esc(C.MESSENGER_URL)}" target="_blank" rel="noopener" aria-label="Messenger">${ICON_MSG}</a>` : ""}`;
  }
  updateCartCount();
}

renderChrome();

(function () {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const bg = document.createElement("div");
  bg.className = "glow-bg";
  bg.innerHTML = '<span class="g1"></span><span class="g2"></span><span class="g3"></span>';
  document.body.prepend(bg);
  const g = bg.children;
  let ticking = false;

  function place(el, phase, k, a, R) {
    const x = Math.cos(a + phase) * R * k;
    const y = Math.sin(a + phase) * R * k;
    el.style.transform = "translate3d(" + x + "px," + y + "px,0)";
  }

  function update() {
    ticking = false;
    const a = (window.scrollY || 0) / 420;
    const R = Math.min(window.innerWidth, window.innerHeight) * 0.38;
    place(g[0], 0, 1, a, R);
    place(g[1], 2.1, 1, a, R);
    place(g[2], 4.2, 0.8, a, R);
  }

  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener("resize", update);
  update();
})();
(function () {
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const SEL = ".card,.hero,.gallery,.cart-item,.box,.foot-grid,.pager";
  const timers = new WeakMap();

  const io = new IntersectionObserver(function (entries) {
    let n = 0;
    entries.forEach(function (en) {
      const el = en.target;
      clearTimeout(timers.get(el));
      if (en.isIntersecting) {
        const d = n++ * 70;
        el.classList.remove("settled");
        el.style.transitionDelay = d + "ms";
        el.classList.add("in");
        timers.set(el, setTimeout(function () {
          el.style.transitionDelay = "";
          el.classList.add("settled");
        }, 900 + d));
      } else {
        el.classList.remove("in", "settled");
        el.style.transitionDelay = "";
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

  function prep(el) {
    if (el.dataset.rv) return;
    el.dataset.rv = "1";
    el.classList.add("reveal");
    io.observe(el);
  }
  function scan(root) {
    if (root.matches && root.matches(SEL)) prep(root);
    if (root.querySelectorAll) root.querySelectorAll(SEL).forEach(prep);
  }

  new MutationObserver(function (list) {
    list.forEach(function (r) {
      r.addedNodes.forEach(function (nd) { if (nd.nodeType === 1) scan(nd); });
    });
  }).observe(document.body, { childList: true, subtree: true });

  scan(document.body);
})();
