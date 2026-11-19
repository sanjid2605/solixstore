let page = 1;
let totalPages = 1;
let q = "";
let reqId = 0;
let offerLive = false;
let heroReady = false;
let sectionsReady = false;
let cdTimer = null;
let heroTimer = null;

const grid = document.getElementById("grid");
const pager = document.getElementById("pager");
const heroBox = document.getElementById("hero");
const offersBox = document.getElementById("offers");
const sectionsBox = document.getElementById("sections");
const allTitle = document.getElementById("all-title");

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

function cardHtml(p, forceOffer, hideTag) {
  const out = p.is_stock_out || Number(p.total_stock) <= 0;
  const old = p.original_price && Number(p.original_price) > Number(p.price)
    ? `<span class="old">${money(p.original_price)}</span>` : "";
  const tg = forceOffer ? "OFFER" : (hideTag ? "" : tagText(p));
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
  const show = q === "";
  heroBox.classList.toggle("hidden", !(show && heroReady));
  offersBox.classList.toggle("hidden", !(show && offerLive));
  sectionsBox.classList.toggle("hidden", !(show && sectionsReady));
  allTitle.textContent = show ? "All Products" : "Search Results";
}

/* a row of cards that slides by itself (pauses while you touch it) */
function autoSlide(el, ms) {
  let paused = false, hold = 0;
  const touch = () => { paused = true; clearTimeout(hold); hold = setTimeout(() => { paused = false; }, 6000); };
  el.addEventListener("touchstart", touch, { passive: true });
  el.addEventListener("wheel", touch, { passive: true });
  el.addEventListener("mouseenter", () => { paused = true; });
  el.addEventListener("mouseleave", () => { paused = false; });
  setInterval(() => {
    if (paused || document.hidden || !el.isConnected) return;
    if (el.scrollWidth <= el.clientWidth + 8) return;
    const card = el.querySelector(".card");
    const step = card ? card.getBoundingClientRect().width + 12 : 200;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) el.scrollTo({ left: 0, behavior: "smooth" });
    else el.scrollBy({ left: step, behavior: "smooth" });
  }, ms);
}

/* ---------- all products ---------- */
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

  const { data, count, error } = await query;
  if (my !== reqId) return;

  if (error) {
    dbg("products error: " + error.message);
    grid.innerHTML = `<p class="empty">Could not load products.</p>`;
    pager.innerHTML = "";
    return;
  }
  if (!data.length) {
    grid.innerHTML = `<p class="empty">${q ? "No products found." : "No products yet."}</p>`;
    pager.innerHTML = "";
    return;
  }

  totalPages = Math.max(1, Math.ceil(count / C.PAGE_SIZE));
  grid.innerHTML = data.map(p => cardHtml(p, false, false)).join("");

  pager.innerHTML = totalPages > 1 ? `
    <button id="prev" ${page <= 1 ? "disabled" : ""}>← Prev</button>
    <span>${page} / ${totalPages}</span>
    <button id="next" ${page >= totalPages ? "disabled" : ""}>Next →</button>` : "";

  const prev = document.getElementById("prev"), next = document.getElementById("next");
  if (prev) prev.onclick = () => { page--; loadProducts(); window.scrollTo(0, 0); };
  if (next) next.onclick = () => { page++; loadProducts(); window.scrollTo(0, 0); };
}

/* ---------- Featured / Top Selling / New Arrivals ---------- */
function sectionHtml(title, key, items) {
  return `
    <section class="hsec" data-key="${key}">
      <h2 class="sec-title">${title}</h2>
      <div class="sec-row">${items.map(p => cardHtml(p, false, true)).join("")}</div>
    </section>`;
}

async function loadSections() {
  try {
    const get = tag => db.from("product_list").select("*").contains("tags", [tag])
      .order("created_at", { ascending: false }).limit(20);
    const [f, t, n] = await Promise.all([get("featured"), get("top"), get("new")]);
    [f, t, n].forEach(r => { if (r.error) dbg("sections error: " + r.error.message); });
    const fi = f.data || [], ti = t.data || [], ni = n.data || [];
    dbg("featured " + fi.length + ", top " + ti.length + ", new " + ni.length);

    const html = [
      fi.length ? sectionHtml("Featured", "featured", fi) : "",
      ti.length ? sectionHtml("Top Selling", "top", ti) : "",
      ni.length ? sectionHtml("New Arrivals", "new", ni) : ""
    ].join("");
    if (!html) return;

    sectionsBox.innerHTML = html;
    sectionsReady = true;
    updateTop();
    const row = sectionsBox.querySelector('[data-key="featured"] .sec-row');
    if (row) autoSlide(row, 3000);
  } catch (e) { dbg("sections crash: " + e.message); }
}

/* ---------- top picture(s) ---------- */
function renderHero(urls, width, ratio) {
  heroBox.style.maxWidth = width + "px";
  heroBox.innerHTML = `
    <div class="hero-track" style="aspect-ratio:${ratio}">${urls.map((u, i) =>
      `<a class="slide${i === 0 ? " on" : ""}" href="#all-title"><img src="${esc(u)}" alt="" ${i ? 'loading="lazy"' : ""}></a>`).join("")}</div>
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
  let urls = [], width = 860, ratio = "16/9";
  try {
    const [b, s] = await Promise.all([
      db.from("banners").select("url").order("position", { ascending: true }),
      db.from("settings").select("*").in("key", ["banner_width", "banner_ratio"])
    ]);
    if (b.error) dbg("banners error: " + b.error.message);
    urls = (b.data || []).map(r => r.url);
    (s.data || []).forEach(r => {
      if (r.key === "banner_width" && Number(r.value) >= 200) width = Math.min(1200, Number(r.value));
      if (r.key === "banner_ratio" && /^\d+\/\d+$/.test(r.value)) ratio = r.value;
    });
    dbg("banners: " + urls.length + ", width " + width + ", ratio " + ratio);
  } catch (e) { dbg("banners crash: " + e.message); }
  if (!urls.length) urls = ["poster.jpg"];
  renderHero(urls, width, ratio);
}

/* ---------- offers (many) ---------- */
const p2 = n => String(n).padStart(2, "0");

function offerHtml(c, items) {
  return `
    <section class="offer" data-end="${new Date(c.ends_at).getTime()}">
      <div class="offer-head">
        <div class="offer-title"><small>🔥 LIMITED OFFER</small>${esc(c.title)}</div>
        <div class="cd">
          <div><b class="cd-d">00</b><span>Days</span></div>
          <div><b class="cd-h">00</b><span>Hours</span></div>
          <div><b class="cd-m">00</b><span>Min</span></div>
          <div><b class="cd-s">00</b><span>Sec</span></div>
        </div>
      </div>
      <div class="offer-row">${items.map(p => cardHtml(p, true, true)).join("")}</div>
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
    offersBox.querySelectorAll(".offer-row").forEach(r => autoSlide(r, 3000));
  } catch (e) { dbg("offers crash: " + e.message); }
}

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
loadOffers();
loadHero();
loadSections();
