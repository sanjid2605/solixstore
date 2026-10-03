const pid = new URLSearchParams(location.search).get("id");
const root = document.getElementById("product");
const SIZES = ["S", "M", "L", "XL", "XXL"];
const SIZE_NAMES = { S: "Small", M: "Medium", L: "Large", XL: "X-Large", XXL: "2X-Large" };

let P = null;
let images = [];
let stockBySize = {};
let selectedSize = null;

function totalStock() {
  return P.has_sizes
    ? SIZES.reduce((n, s) => n + (stockBySize[s] || 0), 0)
    : Number(P.stock);
}
function isOut() { return P.is_stock_out || totalStock() <= 0; }
function availableNow() { return P.has_sizes ? (stockBySize[selectedSize] || 0) : Number(P.stock); }

async function load() {
  if (!pid) { root.innerHTML = `<p class="empty">Product not found.</p>`; return; }

  const [p, im, sz] = await Promise.all([
    db.from("products").select("*").eq("id", pid).single(),
    db.from("product_images").select("url,position").eq("product_id", pid).order("position"),
    db.from("product_sizes").select("size,stock").eq("product_id", pid)
  ]);

  if (p.error || !p.data) { root.innerHTML = `<p class="empty">Product not found.</p>`; return; }
  P = p.data;
  images = (im.data || []).map(i => i.url);
  (sz.data || []).forEach(r => { stockBySize[r.size] = r.stock; });
  document.title = P.name + " | SOLIX";
  render();
}

function render() {
  const out = isOut();
  const old = P.original_price && Number(P.original_price) > Number(P.price)
    ? `<span class="old">${money(P.original_price)}</span>` : "";

  const thumbs = images.length > 1
    ? `<div class="thumbs">${images.map((u, i) =>
        `<button type="button" class="${i === 0 ? "active" : ""}" data-i="${i}"><img src="${esc(u)}" alt="" loading="lazy"></button>`
      ).join("")}</div>` : "";

  const sizeBlock = P.has_sizes ? `
    <div class="label">Select size</div>
    <div class="sizes">
      ${SIZES.map(s => {
        const st = stockBySize[s] || 0;
        const dis = out || st <= 0;
        return `<button type="button" class="size" data-size="${s}" ${dis ? "disabled" : ""}>
          ${s}<small>${SIZE_NAMES[s]}</small><small>${st > 0 && !out ? st + " left" : "Out of stock"}</small>
        </button>`;
      }).join("")}
    </div>` : "";

  root.innerHTML = `
    <div class="gallery">
      <div class="main-img">${images[0] ? `<img id="main-img" src="${esc(images[0])}" alt="${esc(P.name)}">` : ""}</div>
      ${thumbs}
    </div>
    <div class="info">
      <h1>${esc(P.name)}</h1>
      <div class="price">${money(P.price)}${old}</div>
      ${sizeBlock}
      <div class="total-stock">${out ? `<span class="stock-out-text">Stock Out</span>` : `Total Stock: ${totalStock()}`}</div>
      <div class="actions">
        <button class="btn btn-ghost" id="add" ${out ? "disabled" : ""}>Add to Cart</button>
        <button class="btn btn-primary" id="buy" ${out ? "disabled" : ""}>Buy Now</button>
      </div>
    </div>`;

  root.querySelectorAll(".thumbs button").forEach(b => {
    b.onclick = () => {
      document.getElementById("main-img").src = images[b.dataset.i];
      root.querySelectorAll(".thumbs button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
    };
  });

  root.querySelectorAll(".size").forEach(b => {
    b.onclick = () => {
      selectedSize = b.dataset.size;
      root.querySelectorAll(".size").forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");
    };
  });

  document.getElementById("add").onclick = () => { if (addToCart()) showToast("Added to cart", true); };
  document.getElementById("buy").onclick = buyNow;
}

function sizeOk() {
  if (P.has_sizes && !selectedSize) { showToast("Select the size please"); return false; }
  return true;
}

function cartLine(items) {
  const size = P.has_sizes ? selectedSize : "";
  return { size, line: items.find(i => i.id === P.id && i.size === size) };
}

function addToCart() {
  if (!sizeOk()) return false;
  const items = Cart.get();
  const { size, line } = cartLine(items);
  const max = availableNow();
  const have = line ? line.qty : 0;
  if (max <= 0) { showToast("Out of stock"); return false; }
  if (have + 1 > max) { showToast("Only " + max + " available for this size"); return false; }
  if (line) line.qty++;
  else items.push({ id: P.id, name: P.name, image: images[0] || "", size, qty: 1, price: Number(P.price) });
  Cart.save(items);
  return true;
}

function buyNow() {
  if (!sizeOk()) return;
  const { line } = cartLine(Cart.get());
  if (line || addToCart()) location.href = "cart.html";
}

load();
