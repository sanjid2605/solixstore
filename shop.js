let page = 1;
let totalPages = 1;
let q = "";
let tab = "all";
let reqId = 0;
let offerLive = false;
let cdTimer = null;

const grid = document.getElementById("grid");
const pager = document.getElementById("pager");
const hero = document.querySelector(".hero");
const offerBox = document.getElementById("offer");

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
  if (hero) hero.classList.toggle("hidden", !show);
  offerBox.classList.toggle("hidden", !(show && offerLive));
}

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

/* ---------- offer section ---------- */
const p2 = n => String(n).padStart(2, "0");

function startCountdown(end) {
  clearInterval(cdTimer);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const tick = () => {
    let s = Math.floor((end - Date.now()) / 1000);
    if (s <= 0) {
      clearInterval(cdTimer);
      offerLive = false;
      updateTop();
      return;
    }
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    set("cd-d", p2(d)); set("cd-h", p2(h)); set("cd-m", p2(m)); set("cd-s", p2(s));
  };
  tick();
  cdTimer = setInterval(tick, 1000);
}

async function loadOffer() {
  try {
    const { data: o } = await db.from("offers").select("*").eq("id", 1).maybeSingle();
    if (!o || !o.is_active || !o.ends_at) return;
    const end = new Date(o.ends_at).getTime();
    if (!(end > Date.now())) return;

    const { data: items } = await db
      .from("product_list").select("*").eq("in_offer", true)
      .order("created_at", { ascending: false }).limit(24);
    if (!items || !items.length) return;

    offerBox.innerHTML = `
      <div class="offer-head">
        <div class="offer-title"><small>🔥 চলমান অফার</small>${esc(o.title || "Special Offer")}</div>
        <div class="cd">
          <div><b id="cd-d">00</b><span>দিন</span></div>
          <div><b id="cd-h">00</b><span>ঘণ্টা</span></div>
          <div><b id="cd-m">00</b><span>মিনিট</span></div>
          <div><b id="cd-s">00</b><span>সেকেন্ড</span></div>
        </div>
      </div>
      <div class="offer-row">${items.map(p => cardHtml(p, true)).join("")}</div>`;
    offerLive = true;
    updateTop();
    startCountdown(end);
  } catch (e) {}
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
loadOffer();
