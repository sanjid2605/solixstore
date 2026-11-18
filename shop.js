let page = 1;
let totalPages = 1;
let q = "";
let tab = "all";
let reqId = 0;
let offerLive = false;
let heroReady = false;
let cdTimer = null;
let heroTimer = null;

const grid = document.getElementById("grid");
const pager = document.getElementById("pager");
const heroBox = document.getElementById("hero");
const offersBox = document.getElementById("offers");

/* add ?debug to the address to see what the page loaded: solixbd.me/?debug */
const DEBUG = location.search.indexOf("debug") !== -1;
function dbg(m) {
  if (!DEBUG) return;
  let b = document.getElementById("dbg");
  if (!b) {
    b = document.createElement("pre");
    b.id = "dbg";
    b.style.cssText = "position:fixed;bottom:8px;left:8px;right:8px;max-height:40vh;overflow:auto;z-index:99;background:#000;color:#0f0;font-size:12px;padding:8px;border-radius:8px;white-space:pre-wrap";
    document.body.appendChild(b);
  }
  b.textContent += m + "\n";
}

const TAG_LABEL = { top: "TOP SELLING", new: "NEW", featured: "FEATURED" };

function tagText(p) {
  const t = p.tags || [];
  for (const k of ["top", "new", "featured"]) if (t.includes(k)) return TAG_LABEL[k];
  return "";
}

function cardHtml(p, forceOffer) {
  const out = p.is_stock_out || Number(p.total_stock) <= 0;
  const old = p.original_price && Number(p.original_price) > Number(p.price)
    ? `<span class="old">${money(p.original_price)}</span>` : "";
  const tg = forceOffer ? "OFFER" : tagText(p);
  return `
    <a class="card ${out ? "is-out" : ""}" href="product.html?id=${p.id}">
      <div class="img-wrap">
        ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" decoding="async">` : ""}
      </div>
      ${out ? `<span class="badge-out">Stock Out</span>` : ""}
      ${tg ? `<span class="tag-badge${forceOffer ? " tag-offer" : ""}">${tg}</span>` : ""}
      <div class="card-body">
        <div class="card-name">${esc(p.name)}</div>
        <div class="card-price">${money(p.price)}${old}</div>
      </div>
    </a>`;
}

function updateTop() {
  const show = q === "" && tab === "all";
  heroBox.classList.toggle("hidden", !(show && heroReady));
  offersBox.classList.toggle("hidden", !(show && offerLive));
}

/* ---------- products ---------- */
async function loadProducts() {
  const my = ++reqId;
  const from = (page - 1) * C.PAGE_SIZE;
  const to = from + C.PAGE_SIZE - 1;

  let query = db
    .from("product_list")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (q) query = query.ilike("name", "%" + q + "%");
  if (tab !== "all") query = query.contains("tags", [tab]);

  const { data, count, error } = await query;
  if (my !== reqId) return;

  if (error) {
    dbg("products error: " + error.message);
    grid.innerHTML = `<p class="empty">Could not load products.</p>`;
    pager.innerHTML = "";
    return;
  }
  if (!data.length) {
    grid.innerHTML = `<p class="empty">${q || tab !== "all" ? "কোনো প্রোডাক্ট পাওয়া যায়নি।" : "No products yet."}</p>`;
    pager.innerHTML = "";
    return;
  }

  totalPages = Math.max(1, Math.ceil(count / C.PAGE_SIZE));
  grid.innerHTML = data.map(p => cardHtml(p, false)).join("");

  pager.innerHTML = totalPages > 1 ? `
    <button id="prev" ${page <= 1 ? "disabled" : ""}>← Prev</button>
    <span>${page} / ${totalPages}</span>
    <button id="next" ${page >= totalPages ? "disabled" : ""}>Next →</button>` : "";

  const prev = document.getElementById("prev"), next = document.getElementById("next");
  if (prev) prev.onclick = () => { page--; loadProducts(); window.scrollTo(0, 0); };
  if (next) next.onclick = () => { page++; loadProducts(); window.scrollTo(0, 0); };
}

/* ---------- top picture(s) ---------- */
function renderHero(urls) {
  heroBox.innerHTML = `
    <div class="hero-track">${urls.map((u, i) =>
      `<a class="slide${i === 0 ? " on" : ""}" href="#grid"><img src="${esc(u)}" alt="" ${i ? 'loading="lazy"' : ""}></a>`).join("")}</div>
    ${urls.length > 1 ? `<div class="hero-dots">${urls.map((_, i) =>
      `<button type="button" data-i="${i}" class="${i === 0 ? "on" : ""}" aria-label="Picture ${i + 1}"></button>`).join("")}</div>` : ""}`;

  const first = heroBox.querySelector("img");
  if (urls.length === 1) {
    first.addEventListener("error", () => { heroReady = false; heroBox.innerHTML = ""; updateTop(); });
  }
  heroReady = true;
  updateTop();
  if (urls.length < 2) return;

  const slides = heroBox.querySelectorAll(".slide");
  const dots = heroBox.querySelectorAll(".hero-dots button");
  let cur = 0;
  const go = n => {
    cur = (n + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle("on", i === cur));
    dots.forEach((d, i) => d.classList.toggle("on", i === cur));
  };
  const start = () => { clearInterval(heroTimer); heroTimer = setInterval(() => go(cur + 1), 5000); };
  dots.forEach(d => { d.onclick = ev => { ev.preventDefault(); go(Number(d.dataset.i)); start(); }; });

  let x0 = null;
  heroBox.addEventListener("touchstart", ev => { x0 = ev.touches[0].clientX; }, { passive: true });
  heroBox.addEventListener("touchend", ev => {
    if (x0 === null) return;
    const dx = ev.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) { go(cur + (dx < 0 ? 1 : -1)); start(); }
    x0 = null;
  });
  start();
}

async function loadHero() {
  let urls = [];
  try {
    const { data, error } = await db.from("banners").select("url").order("position", { ascending: true });
    if (error) dbg("banners error: " + error.message);
    urls = (data || []).map(r => r.url);
    dbg("banners found: " + urls.length);
  } catch (e) { dbg("banners crash: " + e.message); }
  if (!urls.length) urls = ["poster.jpg"];
  renderHero(urls);
}

/* ---------- offers (many) ---------- */
const p2 = n => String(n).padStart(2, "0");

function offerHtml(c, items) {
  return `
    <section class="offer" data-end="${new Date(c.ends_at).getTime()}">
      <div class="offer-head">
        <div class="offer-title"><small>🔥 চলমান অফার</small>${esc(c.title)}</div>
        <div class="cd">
          <div><b class="cd-d">00</b><span>দিন</span></div>
          <div><b class="cd-h">00</b><span>ঘণ্টা</span></div>
          <div><b class="cd-m">00</b><span>মিনিট</span></div>
          <div><b class="cd-s">00</b><span>সেকেন্ড</span></div>
        </div>
      </div>
      <div class="offer-row">${items.map(p => cardHtml(p, true)).join("")}</div>
    </section>`;
}

function tickOffers() {
  const now = Date.now();
  let left = 0;
  offersBox.querySelectorAll(".offer").forEach(el => {
    let s = Math.floor((Number(el.dataset.end) - now) / 1000);
    if (s <= 0) { el.remove(); return; }
    left++;
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    el.querySelector(".cd-d").textContent = p2(d);
    el.querySelector(".cd-h").textContent = p2(h);
    el.querySelector(".cd-m").textContent = p2(m);
    el.querySelector(".cd-s").textContent = p2(s);
  });
  if (!left) { clearInterval(cdTimer); offerLive = false; updateTop(); }
}

async function loadOffers() {
  try {
    const c = await db.from("campaigns").select("*")
      .eq("is_active", true).gt("ends_at", new Date().toISOString()).order("ends_at", { ascending: true });
    if (c.error) { dbg("offers error: " + c.error.message); return; }
    const cs = c.data || [];
    dbg("live offers: " + cs.length);
    if (!cs.length) return;

    const p = await db.from("product_list").select("*")
      .in("offer_id", cs.map(x => x.id)).order("created_at", { ascending: false });
    if (p.error) { dbg("offer products error: " + p.error.message); return; }
    const items = p.data || [];
    dbg("offer products: " + items.length);

    const html = cs.map(o => {
      const mine = items.filter(i => i.offer_id === o.id);
      return mine.length ? offerHtml(o, mine) : "";
    }).join("");
    if (!html) return;

    offersBox.innerHTML = html;
    offerLive = true;
    updateTop();
    tickOffers();
    clearInterval(cdTimer);
    cdTimer = setInterval(tickOffers, 1000);
  } catch (e) { dbg("offers crash: " + e.message); }
}

/* ---------- tabs ---------- */
document.getElementById("tabs").addEventListener("click", e => {
  const b = e.target.closest(".tab-btn");
  if (!b) return;
  document.querySelectorAll(".tab-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  tab = b.dataset.tab;
  page = 1;
  updateTop();
  loadProducts();
});

/* ---------- search ---------- */
let timer;
document.getElementById("search").addEventListener("input", e => {
  q = e.target.value.trim().replace(/[%_\\]/g, "");
  updateTop();
  clearTimeout(timer);
  timer = setTimeout(() => {
    page = 1;
    loadProducts();
  }, 350);
});

loadProducts();
loadHero();
loadOffers();
