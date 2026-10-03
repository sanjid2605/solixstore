let page = 1;
let totalPages = 1;
const grid = document.getElementById("grid");
const pager = document.getElementById("pager");

async function loadProducts() {
  grid.innerHTML = "";
  const from = (page - 1) * C.PAGE_SIZE;
  const to = from + C.PAGE_SIZE - 1;

  const { data, count, error } = await db
    .from("product_list")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    grid.innerHTML = `<p class="empty">Could not load products.</p>`;
    return;
  }
  if (!data.length) {
    grid.innerHTML = `<p class="empty">No products yet.</p>`;
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

  pager.innerHTML = `
    <button id="prev" ${page <= 1 ? "disabled" : ""}>← Prev</button>
    <span>${page} / ${totalPages}</span>
    <button id="next" ${page >= totalPages ? "disabled" : ""}>Next →</button>`;
  document.getElementById("prev").onclick = () => { page--; loadProducts(); window.scrollTo(0, 0); };
  document.getElementById("next").onclick = () => { page++; loadProducts(); window.scrollTo(0, 0); };
}

loadProducts();
