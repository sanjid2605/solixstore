const C = window.SOLIX_CONFIG;
const db = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
const SIZES = ["S", "M", "L", "XL", "XXL"];
const $ = id => document.getElementById(id);
const money = n => C.CURRENCY + Number(n).toLocaleString("en-US");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg, ok) {
  document.querySelectorAll(".toast-error").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "toast-error" + (ok ? " toast-ok" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.15;
    o.start(); o.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

/* ---------- AUTH ---------- */
async function init() {
  const { data } = await db.auth.getSession();
  data.session ? showApp() : ($("login").classList.remove("hidden"), $("app").classList.add("hidden"));
}
$("login-btn").onclick = async () => {
  const { error } = await db.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
  if (error) return toast("Login failed. Check email and password.");
  showApp();
};
$("logout").onclick = async () => { await db.auth.signOut(); location.reload(); };

let started = false;
function showApp() {
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  if (started) return;
  started = true;
  loadProducts();
  loadOrders();
  db.channel("orders-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => {
      newCount++;
      const b = $("order-badge");
      b.textContent = newCount; b.classList.remove("hidden");
      beep(); toast("New order received!", true);
      loadOrders();
    })
    .subscribe();
}

let newCount = 0;
document.querySelectorAll(".tab[data-tab]").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll(".tab[data-tab]").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    $("tab-products").classList.toggle("hidden", b.dataset.tab !== "products");
    $("tab-orders").classList.toggle("hidden", b.dataset.tab !== "orders");
    if (b.dataset.tab === "orders") { newCount = 0; $("order-badge").classList.add("hidden"); loadOrders(); }
  };
});

/* ---------- PRODUCT LIST ---------- */
let limit = 50, search = "", cache = {};
const totalOf = p => p.has_sizes ? (p.product_sizes || []).reduce((n, s) => n + s.stock, 0) : p.stock;

async function loadProducts() {
  let q = db.from("products")
    .select("*, product_sizes(size,stock), product_images(id,url,position)")
    .order("created_at", { ascending: false }).limit(limit);
  if (search) q = q.ilike("name", "%" + search + "%");
  const { data, error } = await q;
  if (error) return ($("plist").innerHTML = `<p class="empty">Error loading products</p>`);

  cache = {};
  data.forEach(p => { cache[p.id] = p; });
  $("more").classList.toggle("hidden", data.length < limit);

  if (!data.length) return ($("plist").innerHTML = `<p class="empty">No products. Press + Add.</p>`);

  $("plist").innerHTML = data.map(p => {
    const imgs = (p.product_images || []).sort((a, b) => a.position - b.position);
    const total = totalOf(p);
    const out = p.is_stock_out || total <= 0;
    const sizeText = p.has_sizes
      ? SIZES.map(s => s + ":" + (((p.product_sizes || []).find(x => x.size === s) || {}).stock || 0)).join("  ")
      : "No sizes";
    return `
      <div class="row">
        ${imgs[0] ? `<img src="${esc(imgs[0].url)}" loading="lazy" alt="">` : `<div class="noimg"></div>`}
        <div>
          <div style="font-weight:600">${esc(p.name)}</div>
          <div class="muted">${money(p.price)}${p.original_price ? " (was " + money(p.original_price) + ")" : ""}</div>
          <div class="muted">${sizeText} | Total: ${total} ${out ? "| <b style='color:#ff6b78'>STOCK OUT</b>" : ""}</div>
        </div>
        <div class="btns">
          <button class="mini" data-a="edit" data-id="${p.id}">Edit</button>
          <button class="mini ${p.is_stock_out ? "on" : ""}" data-a="out" data-id="${p.id}">${p.is_stock_out ? "Undo Stock Out" : "Mark Stock Out"}</button>
          <button class="mini danger" data-a="del" data-id="${p.id}">Delete</button>
        </div>
      </div>`;
  }).join("");
}

$("plist").onclick = async e => {
  const b = e.target.closest("button[data-a]");
  if (!b) return;
  const p = cache[b.dataset.id];
  if (b.dataset.a === "edit") openForm(p);
  if (b.dataset.a === "out") {
    await db.from("products").update({ is_stock_out: !p.is_stock_out }).eq("id", p.id);
    loadProducts();
  }
  if (b.dataset.a === "del") {
    if (!confirm("Delete this product permanently?")) return;
    await removeFiles((p.product_images || []).map(i => i.url));
    const { error } = await db.from("products").delete().eq("id", p.id);
    error ? toast("Delete failed") : (toast("Deleted", true), loadProducts());
  }
};

let st;
$("search").oninput = e => { clearTimeout(st); st = setTimeout(() => { search = e.target.value.trim(); limit = 50; loadProducts(); }, 350); };
$("more").onclick = () => { limit += 50; loadProducts(); };

/* ---------- FORM ---------- */
let editingId = null, imgs = [], removed = [];

function recalcTotal() {
  const t = $("f-has").checked
    ? SIZES.reduce((n, s) => n + (parseInt($("st-" + s).value) || 0), 0)
    : (parseInt($("f-stock").value) || 0);
  $("f-total").textContent = t;
}
function toggleSizes() {
  $("sizes-box").classList.toggle("hidden", !$("f-has").checked);
  $("nosize-box").classList.toggle("hidden", $("f-has").checked);
  recalcTotal();
}
["f-has", "f-stock", ...SIZES.map(s => "st-" + s)].forEach(id => { $(id).oninput = toggleSizes; $(id).onchange = toggleSizes; });

function openForm(p) {
  editingId = p ? p.id : null;
  removed = [];
  $("m-title").textContent = p ? "Edit product" : "Add product";
  $("f-name").value = p ? p.name : "";
  $("f-price").value = p ? p.price : "";
  $("f-old").value = p && p.original_price ? p.original_price : "";
  $("f-has").checked = p ? p.has_sizes : true;
  $("f-stock").value = p ? p.stock : 0;
  $("f-out").checked = p ? p.is_stock_out : false;
  SIZES.forEach(s => {
    const r = p ? (p.product_sizes || []).find(x => x.size === s) : null;
    $("st-" + s).value = r ? r.stock : 0;
  });
  imgs = p ? (p.product_images || []).sort((a, b) => a.position - b.position).map(i => ({ id: i.id, url: i.url })) : [];
  $("f-files").value = "";
  renderImgs();
  toggleSizes();
  $("modal").classList.remove("hidden");
}
$("add-product").onclick = () => openForm(null);
$("m-cancel").onclick = () => $("modal").classList.add("hidden");

function renderImgs() {
  $("img-list").innerHTML = imgs.map((im, i) => `
    <div class="img-item">
      <img src="${esc(im.url)}" alt="">
      <button type="button" class="mini ${i === 0 ? "on" : ""}" data-i="${i}" data-a="main">${i === 0 ? "Main" : "Make main"}</button>
      <button type="button" class="mini danger" data-i="${i}" data-a="rm">Remove</button>
    </div>`).join("");
}
$("img-list").onclick = e => {
  const b = e.target.closest("button[data-a]");
  if (!b) return;
  const i = Number(b.dataset.i);
  if (b.dataset.a === "main") imgs.unshift(imgs.splice(i, 1)[0]);
  if (b.dataset.a === "rm") { const r = imgs.splice(i, 1)[0]; if (r.id) removed.push(r); }
  renderImgs();
};
$("f-files").onchange = e => {
  Array.from(e.target.files).forEach(f => imgs.push({ file: f, url: URL.createObjectURL(f) }));
  e.target.value = "";
  renderImgs();
};

/* ---------- IMAGES ---------- */
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, "image/webp", 0.82));
}
async function removeFiles(urls) {
  const paths = urls.map(u => (u.split("/product-images/")[1] || "")).filter(Boolean);
  if (paths.length) await db.storage.from("product-images").remove(paths);
}

/* ---------- SAVE ---------- */
$("m-save").onclick = async () => {
  const name = $("f-name").value.trim();
  const price = parseFloat($("f-price").value);
  if (!name) return toast("Enter product name");
  if (isNaN(price) || price < 0) return toast("Enter a valid price");
  if (!imgs.length) return toast("Add at least one image");

  const has = $("f-has").checked;
  const row = {
    name, price,
    original_price: $("f-old").value ? parseFloat($("f-old").value) : null,
    has_sizes: has,
    stock: has ? 0 : Math.max(0, parseInt($("f-stock").value) || 0),
    is_stock_out: $("f-out").checked
  };

  const btn = $("m-save");
  btn.disabled = true; btn.textContent = "Saving...";
  try {
    let pid = editingId;
    if (pid) {
      const { error } = await db.from("products").update(row).eq("id", pid);
      if (error) throw error;
    } else {
      const { data, error } = await db.from("products").insert(row).select("id").single();
      if (error) throw error;
      pid = data.id;
    }

    if (has) {
      const rows = SIZES.map(s => ({ product_id: pid, size: s, stock: Math.max(0, parseInt($("st-" + s).value) || 0) }));
      const { error } = await db.from("product_sizes").upsert(rows, { onConflict: "product_id,size" });
      if (error) throw error;
    }

    if (removed.length) {
      await db.from("product_images").delete().in("id", removed.map(r => r.id));
      await removeFiles(removed.map(r => r.url));
    }

    for (let i = 0; i < imgs.length; i++) {
      const im = imgs[i];
      if (im.id) {
        await db.from("product_images").update({ position: i }).eq("id", im.id);
      } else {
        const blob = await shrink(im.file);
        const path = pid + "/" + Date.now() + "-" + i + ".webp";
        const up = await db.storage.from("product-images").upload(path, blob, { contentType: "image/webp", cacheControl: "31536000" });
        if (up.error) throw up.error;
        const url = db.storage.from("product-images").getPublicUrl(path).data.publicUrl;
        const ins = await db.from("product_images").insert({ product_id: pid, url, position: i });
        if (ins.error) throw ins.error;
      }
    }

    toast("Saved", true);
    $("modal").classList.add("hidden");
    loadProducts();
  } catch (err) {
    console.error(err);
    toast("Save failed: " + (err.message || "error"));
  }
  btn.disabled = false; btn.textContent = "Save";
};

/* ---------- ORDERS ---------- */
async function loadOrders() {
  const { data, error } = await db.from("orders").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return ($("olist").innerHTML = `<p class="empty">Error loading orders</p>`);
  if (!data.length) return ($("olist").innerHTML = `<p class="empty">No orders yet.</p>`);

  $("olist").innerHTML = data.map(o => `
    <div class="order ${o.status === "new" ? "new" : ""}">
      <div style="display:flex;justify-content:space-between">
        <b>${esc(o.customer_name)}</b>
        <span class="muted">${new Date(o.created_at).toLocaleString()}</span>
      </div>
      <div class="muted">${esc(o.phone)}</div>
      <div class="muted">${esc([o.address, o.area, o.zone, o.city].filter(Boolean).join(", "))}</div>
      <div style="margin-top:8px">
        ${(o.items || []).map(i => `${esc(i.name)} ${i.size ? "(" + esc(i.size) + ")" : ""} x${i.qty}`).join("<br>")}
      </div>
      <div class="total-line">Subtotal ${money(o.subtotal)} + Delivery ${money(o.delivery_charge)} = ${money(o.total)}</div>
      <div class="muted">Pathao: ${esc(o.pathao_consignment_id || "not created")} ${o.pathao_status ? "(" + esc(o.pathao_status) + ")" : ""}</div>
      <div style="margin-top:8px">
        <span class="muted">Status: ${esc(o.status)}</span>
        ${o.status === "new" ? `<button class="mini" data-oid="${o.id}">Mark as seen</button>` : ""}
      </div>
    </div>`).join("");
}
$("olist").onclick = async e => {
  const b = e.target.closest("button[data-oid]");
  if (!b) return;
  await db.from("orders").update({ status: "seen" }).eq("id", b.dataset.oid);
  loadOrders();
};

init();
