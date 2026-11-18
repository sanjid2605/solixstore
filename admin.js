const C = window.SOLIX_CONFIG;
const db = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
const SIZES = ["S", "M", "L", "XL", "XXL"];
const TAGS = { featured: "Featured", new: "New arrival", top: "Top selling" };
const $ = id => document.getElementById(id);
const money = n => C.CURRENCY + Number(n || 0).toLocaleString("en-US");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad2 = n => String(n).padStart(2, "0");

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

/* ================= AUTH ================= */
async function init() {
  const { data } = await db.auth.getSession();
  if (data.session) showApp();
  else { $("login").classList.remove("hidden"); $("app").classList.add("hidden"); }
}
$("login-btn").onclick = async () => {
  const { error } = await db.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
  if (error) return toast("Login failed: " + error.message);
  showApp();
};
$("password").addEventListener("keydown", e => { if (e.key === "Enter") $("login-btn").click(); });
$("logout").onclick = async () => { await db.auth.signOut(); location.reload(); };

let started = false;
let newCount = 0;
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

document.querySelectorAll(".tab[data-tab]").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll(".tab[data-tab]").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    ["products", "orders", "sales", "offer"].forEach(n => $("tab-" + n).classList.toggle("hidden", n !== b.dataset.tab));
    if (b.dataset.tab === "orders") { newCount = 0; $("order-badge").classList.add("hidden"); loadOrders(); }
    if (b.dataset.tab === "sales") loadSales();
    if (b.dataset.tab === "offer") loadOfferTab();
  };
});

/* ================= PRODUCT LIST ================= */
let limit = 50, search = "", cache = {};
const sel = new Set();
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
    const chips = [...(p.tags || []).map(t => TAGS[t]).filter(Boolean), p.in_offer ? "In offer" : null]
      .filter(Boolean).map(t => `<span class="chip">${esc(t)}</span>`).join("");
    return `
      <div class="row">
        <input type="checkbox" data-sel="${p.id}" ${sel.has(p.id) ? "checked" : ""}>
        ${imgs[0] ? `<img src="${esc(imgs[0].url)}" loading="lazy" alt="">` : `<div class="noimg"></div>`}
        <div>
          <div style="font-weight:600">${esc(p.name)}</div>
          <div class="muted">${money(p.price)}${p.original_price ? " (was " + money(p.original_price) + ")" : ""}</div>
          <div class="muted">${sizeText} | Total: ${total} ${out ? "| <b style='color:#ff6b78'>STOCK OUT</b>" : ""}</div>
          <div>${chips}</div>
        </div>
        <div class="btns">
          <button class="mini" data-a="edit" data-id="${p.id}">Edit</button>
          <button class="mini" data-a="restock" data-id="${p.id}">Restock</button>
          <button class="mini ${p.is_stock_out ? "on" : ""}" data-a="out" data-id="${p.id}">${p.is_stock_out ? "Back in stock" : "Mark Stock Out"}</button>
          <button class="mini danger" data-a="del" data-id="${p.id}">Delete</button>
        </div>
      </div>`;
  }).join("");
}

$("plist").onclick = async e => {
  const cb = e.target.closest("input[data-sel]");
  if (cb) { cb.checked ? sel.add(cb.dataset.sel) : sel.delete(cb.dataset.sel); return; }

  const b = e.target.closest("button[data-a]");
  if (!b) return;
  const p = cache[b.dataset.id];
  if (!p) return;

  if (b.dataset.a === "edit") openForm(p);
  if (b.dataset.a === "restock") openRestock(p);

  if (b.dataset.a === "out") {
    const next = !p.is_stock_out;
    const { error } = await db.from("products").update({ is_stock_out: next }).eq("id", p.id);
    if (error) return toast("Update failed");
    await loadProducts();
    if (!next && totalOf(p) <= 0) {
      toast("Product is back. Now add stock for the sizes.", true);
      openRestock(cache[p.id] || p);
    }
  }

  if (b.dataset.a === "del") {
    if (!confirm("Delete this product permanently?")) return;
    await removeFiles((p.product_images || []).map(i => i.url));
    const { error } = await db.from("products").delete().eq("id", p.id);
    if (error) toast("Delete failed");
    else { sel.delete(p.id); toast("Deleted", true); loadProducts(); }
  }
};

let st;
$("search").oninput = e => {
  clearTimeout(st);
  st = setTimeout(() => { search = e.target.value.trim().replace(/[%_\\]/g, ""); limit = 50; loadProducts(); }, 350);
};
$("more").onclick = () => { limit += 50; loadProducts(); };

/* ================= BULK PRICE ================= */
$("sel-all").onchange = e => {
  document.querySelectorAll("#plist input[data-sel]").forEach(cb => {
    cb.checked = e.target.checked;
    e.target.checked ? sel.add(cb.dataset.sel) : sel.delete(cb.dataset.sel);
  });
};

async function bulkPrice(all) {
  const price = parseFloat($("bulk-price").value);
  if (isNaN(price) || price < 0) return toast("Enter the new price");
  const patch = { price };
  if ($("bulk-clear").checked) patch.original_price = null;
  else if ($("bulk-old").value.trim() !== "") {
    const o = parseFloat($("bulk-old").value);
    if (isNaN(o) || o < 0) return toast("Original price is not valid");
    patch.original_price = o;
  }
  const ids = [...sel];

  if (all) {
    if (!confirm("Set the price of EVERY product to " + money(price) + "? This cannot be undone.")) return;
    const { error } = await db.from("products").update(patch).gte("price", 0);
    if (error) return toast("Update failed: " + error.message);
  } else {
    if (!ids.length) return toast("Tick some products first");
    if (!confirm("Set the price of " + ids.length + " product(s) to " + money(price) + "?")) return;
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await db.from("products").update(patch).in("id", ids.slice(i, i + 100));
      if (error) return toast("Update failed: " + error.message);
    }
  }
  toast("Prices updated", true);
  loadProducts();
}
$("bulk-sel").onclick = () => bulkPrice(false);
$("bulk-all").onclick = () => bulkPrice(true);

/* ================= PRODUCT FORM ================= */
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
  const tg = (p && p.tags) || [];
  $("f-tag-featured").checked = tg.includes("featured");
  $("f-tag-new").checked = tg.includes("new");
  $("f-tag-top").checked = tg.includes("top");
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

/* ---------- images ---------- */
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

/* ---------- save product ---------- */
$("m-save").onclick = async () => {
  const name = $("f-name").value.trim();
  const price = parseFloat($("f-price").value);
  if (!name) return toast("Enter product name");
  if (isNaN(price) || price < 0) return toast("Enter a valid price");
  if (!imgs.length) return toast("Add at least one image");

  const has = $("f-has").checked;
  const tags = [];
  if ($("f-tag-featured").checked) tags.push("featured");
  if ($("f-tag-new").checked) tags.push("new");
  if ($("f-tag-top").checked) tags.push("top");

  const row = {
    name, price,
    original_price: $("f-old").value ? parseFloat($("f-old").value) : null,
    has_sizes: has,
    stock: has ? 0 : Math.max(0, parseInt($("f-stock").value) || 0),
    is_stock_out: $("f-out").checked,
    tags
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

/* ================= RESTOCK (quick size stock) ================= */
let restockP = null;

function recalcR() {
  const t = restockP && restockP.has_sizes
    ? SIZES.reduce((n, s) => n + (parseInt($("rs-" + s).value) || 0), 0)
    : (parseInt($("r-stock").value) || 0);
  $("r-total").textContent = t;
}
[...SIZES.map(s => "rs-" + s), "r-stock"].forEach(id => { $(id).oninput = recalcR; });

function openRestock(p) {
  restockP = p;
  $("r-title").textContent = "Restock: " + p.name;
  $("r-sizes-box").classList.toggle("hidden", !p.has_sizes);
  $("r-nosize-box").classList.toggle("hidden", !!p.has_sizes);
  SIZES.forEach(s => {
    const r = (p.product_sizes || []).find(x => x.size === s);
    $("rs-" + s).value = r ? r.stock : 0;
  });
  $("r-stock").value = p.stock || 0;
  recalcR();
  $("rmodal").classList.remove("hidden");
}
$("r-cancel").onclick = () => $("rmodal").classList.add("hidden");

$("r-save").onclick = async () => {
  const p = restockP;
  if (!p) return;
  const btn = $("r-save");
  btn.disabled = true;
  try {
    if (p.has_sizes) {
      const rows = SIZES.map(s => ({ product_id: p.id, size: s, stock: Math.max(0, parseInt($("rs-" + s).value) || 0) }));
      const r1 = await db.from("product_sizes").upsert(rows, { onConflict: "product_id,size" });
      if (r1.error) throw r1.error;
    } else {
      const r2 = await db.from("products").update({ stock: Math.max(0, parseInt($("r-stock").value) || 0) }).eq("id", p.id);
      if (r2.error) throw r2.error;
    }
    const r3 = await db.from("products").update({ is_stock_out: false }).eq("id", p.id);
    if (r3.error) throw r3.error;
    toast("Stock saved", true);
    $("rmodal").classList.add("hidden");
    loadProducts();
  } catch (err) {
    toast("Save failed: " + (err.message || "error"));
  }
  btn.disabled = false;
};

/* ================= ORDERS ================= */
async function addBack(items) {
  for (const it of items || []) {
    if (it.size) {
      const { data } = await db.from("product_sizes").select("stock").eq("product_id", it.id).eq("size", it.size).maybeSingle();
      if (data) await db.from("product_sizes").update({ stock: data.stock + it.qty }).eq("product_id", it.id).eq("size", it.size);
    } else {
      const { data } = await db.from("products").select("stock").eq("id", it.id).maybeSingle();
      if (data) await db.from("products").update({ stock: data.stock + it.qty }).eq("id", it.id);
    }
  }
}

let ordersCache = {};
async function loadOrders() {
  const { data, error } = await db.from("orders").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return ($("olist").innerHTML = `<p class="empty">Error loading orders</p>`);
  if (!data.length) return ($("olist").innerHTML = `<p class="empty">No orders yet.</p>`);

  ordersCache = {};
  data.forEach(o => { ordersCache[o.id] = o; });

  $("olist").innerHTML = data.map(o => `
    <div class="order ${o.status === "new" ? "new" : ""} ${o.status === "cancelled" ? "cancelled" : ""}">
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
        ${o.status === "new" ? `<button class="mini" data-oid="${o.id}" data-act="seen">Mark as seen</button>` : ""}
        ${o.status !== "cancelled" ? `<button class="mini danger" data-oid="${o.id}" data-act="cancel">Mark cancelled</button>` : ""}
      </div>
    </div>`).join("");
}
$("olist").onclick = async e => {
  const b = e.target.closest("button[data-oid]");
  if (!b) return;
  const o = ordersCache[b.dataset.oid];
  if (!o) return;
  if (b.dataset.act === "seen") {
    await db.from("orders").update({ status: "seen" }).eq("id", o.id);
  }
  if (b.dataset.act === "cancel") {
    if (!confirm("Mark this order as cancelled? It will not be counted in sales. (Cancel the Pathao parcel separately.)")) return;
    const back = confirm("Put the items of this order back into stock?");
    const { error } = await db.from("orders").update({ status: "cancelled" }).eq("id", o.id);
    if (error) return toast("Update failed");
    if (back) await addBack(o.items);
    toast("Order cancelled", true);
  }
  loadOrders();
  if (b.dataset.act === "cancel") loadProducts();
};

/* ================= SALES ================= */
function dhakaMonth() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" }).slice(0, 7);
}
function dayLabel(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
function monthLabel(m) {
  const [y, mm] = m.split("-").map(Number);
  return new Date(y, mm - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

async function loadSales() {
  if (!$("s-month").value) $("s-month").value = dhakaMonth();
  const m = $("s-month").value;
  const [y, mm] = m.split("-").map(Number);
  const last = new Date(y, mm, 0).getDate();

  const d = await db.from("sales_daily").select("*")
    .gte("day", m + "-01").lte("day", m + "-" + pad2(last)).order("day", { ascending: false });
  if (d.error) {
    $("s-cards").innerHTML = "";
    $("s-daily").innerHTML = `<p class="empty">Could not load sales. Did you run the new SQL?</p>`;
    return;
  }
  const days = d.data || [];
  const sum = (k) => days.reduce((n, r) => n + Number(r[k] || 0), 0);
  const orders = sum("orders"), total = sum("total");

  $("s-cards").innerHTML = `
    <div class="stat"><span class="muted">${esc(monthLabel(m))}</span><b>${money(total)}</b></div>
    <div class="stat"><span class="muted">Orders</span><b>${orders}</b></div>
    <div class="stat"><span class="muted">Products</span><b>${money(sum("products_total"))}</b></div>
    <div class="stat"><span class="muted">Delivery</span><b>${money(sum("delivery_total"))}</b></div>
    <div class="stat"><span class="muted">Average order</span><b>${orders ? money(Math.round(total / orders)) : money(0)}</b></div>`;

  $("s-daily").innerHTML = days.length ? `
    <table class="tbl">
      <tr><th>Date</th><th class="r">Orders</th><th class="r">Total</th></tr>
      ${days.map(r => `<tr><td>${esc(dayLabel(r.day))}</td><td class="r">${r.orders}</td><td class="r">${money(r.total)}</td></tr>`).join("")}
      <tr><th>Month total</th><th class="r">${orders}</th><th class="r">${money(total)}</th></tr>
    </table>` : `<p class="empty">No orders in this month.</p>`;

  const mo = await db.from("sales_monthly").select("*").order("month", { ascending: false }).limit(24);
  const rows = (mo.data || []);
  $("s-monthly").innerHTML = rows.length ? `
    <table class="tbl">
      <tr><th>Month</th><th class="r">Orders</th><th class="r">Total</th></tr>
      ${rows.map(r => `<tr data-m="${esc(r.month)}"><td>${esc(monthLabel(r.month))}</td><td class="r">${r.orders}</td><td class="r">${money(r.total)}</td></tr>`).join("")}
    </table>` : `<p class="empty">No sales yet.</p>`;
}
$("s-month").onchange = loadSales;
$("s-monthly").onclick = e => {
  const tr = e.target.closest("tr[data-m]");
  if (!tr) return;
  $("s-month").value = tr.dataset.m;
  loadSales();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

/* ================= OFFER ================= */
let offSel = new Set(), offAll = [];

function toLocalInput(iso) {
  const d = new Date(iso);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

function renderOfferList() {
  const f = $("o-search").value.trim().toLowerCase();
  const list = offAll.filter(p => !f || p.name.toLowerCase().includes(f));
  $("o-list").innerHTML = list.length
    ? list.map(p => `<label><input type="checkbox" data-oid="${p.id}" ${offSel.has(p.id) ? "checked" : ""}> ${esc(p.name)}</label>`).join("")
    : `<p class="muted" style="padding:10px 0">No products found.</p>`;
  $("o-count").textContent = offSel.size;
}

async function loadOfferTab() {
  const { data: o } = await db.from("offers").select("*").eq("id", 1).maybeSingle();
  $("o-active").checked = !!(o && o.is_active);
  $("o-title").value = (o && o.title) || "";
  $("o-end").value = o && o.ends_at ? toLocalInput(o.ends_at) : "";

  let status = "No offer is running.";
  if (o && o.is_active && o.ends_at) {
    status = new Date(o.ends_at) > new Date()
      ? "Offer is LIVE until " + new Date(o.ends_at).toLocaleString()
      : "The offer time has ended. Set a new end time to run it again.";
  }
  $("o-status").textContent = status;

  const { data: ps } = await db.from("products").select("id,name,in_offer").order("created_at", { ascending: false }).limit(1000);
  offAll = ps || [];
  offSel = new Set(offAll.filter(p => p.in_offer).map(p => p.id));
  renderOfferList();
}
$("o-search").oninput = renderOfferList;
$("o-list").onchange = e => {
  const cb = e.target.closest("input[data-oid]");
  if (!cb) return;
  cb.checked ? offSel.add(cb.dataset.oid) : offSel.delete(cb.dataset.oid);
  $("o-count").textContent = offSel.size;
};

$("o-save").onclick = async () => {
  const active = $("o-active").checked;
  const title = $("o-title").value.trim() || "Special Offer";
  const endv = $("o-end").value;
  if (active && !endv) return toast("Set the end date and time");
  const ends = endv ? new Date(endv).toISOString() : null;
  if (active && new Date(ends) <= new Date()) return toast("The end time must be in the future");
  if (active && !offSel.size) return toast("Select at least one product");

  const btn = $("o-save");
  btn.disabled = true;
  try {
    const r1 = await db.from("offers").upsert({ id: 1, title, is_active: active, ends_at: ends, updated_at: new Date().toISOString() });
    if (r1.error) throw r1.error;
    const r2 = await db.from("products").update({ in_offer: false }).eq("in_offer", true);
    if (r2.error) throw r2.error;
    const ids = [...offSel];
    for (let i = 0; i < ids.length; i += 100) {
      const r3 = await db.from("products").update({ in_offer: true }).in("id", ids.slice(i, i + 100));
      if (r3.error) throw r3.error;
    }
    toast("Offer saved", true);
    loadOfferTab();
    loadProducts();
  } catch (err) {
    toast("Save failed: " + (err.message || "error"));
  }
  btn.disabled = false;
};

init();
