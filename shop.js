let page = 1;
let totalPages = 1;
let q = "";
let reqId = 0;
const grid = document.getElementById("grid");
const pager = document.getElementById("pager");

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
    grid.innerHTML = `<p class="empty">Could not load products.</p>`;
    pager.innerHTML = "";
    return;
  }
  if (!data.length) {
    grid.innerHTML = `<p class="empty">${q ? "কোনো প্রোডাক্ট পাওয়া যায়নি।" : "No products yet."}</p>`;
    pager.innerHTML = "";
    return;
  }

  totalPages = Math.max(1, Math.ceil(count / C.PAGE_SIZE));

  grid.innerHTML = data.map(p => {
    const out = p.is_stock_out || Number(p.total_stock) <= 0;
    const old = p.original_price && Number(p.original_price) > Number(p.price)
      ? `<span class="old">${money(p.original_price)}</span>` : "";
    return `
      <a class="card ${out ? "is-out" : ""}" href="product.html?id=${p.id}">
        <div class="img-wrap">
          ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" decoding="async">` : ""}
        </div>
        ${out ? `<span class="badge-out">Stock Out</span>` : ""}
        <div class="card-body">
          <div class="card-name">${esc(p.name)}</div>
          <div class="card-price">${money(p.price)}${old}</div>
        </div>
      </a>`;
  }).join("");

  pager.innerHTML = totalPages > 1 ? `
    <button id="prev" ${page <= 1 ? "disabled" : ""}>← Prev</button>
    <span>${page} / ${totalPages}</span>
    <button id="next" ${page >= totalPages ? "disabled" : ""}>Next →</button>` : "";

  const prev = document.getElementById("prev"), next = document.getElementById("next");
  if (prev) prev.onclick = () => { page--; loadProducts(); window.scrollTo(0, 0); };
  if (next) next.onclick = () => { page++; loadProducts(); window.scrollTo(0, 0); };
}

let timer;
document.getElementById("search").addEventListener("input", e => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    q = e.target.value.trim().replace(/[%_\\]/g, "");
    page = 1;
    loadProducts();
  }, 350);
});

loadProducts();
