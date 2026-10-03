const root = document.getElementById("cart");
let items = [];

async function loadCart() {
  items = Cart.get();
  if (!items.length) return render();

  const ids = [...new Set(items.map(i => i.id))];
  const [pr, sz] = await Promise.all([
    db.from("products").select("id,name,price,stock,has_sizes,is_stock_out").in("id", ids),
    db.from("product_sizes").select("product_id,size,stock").in("product_id", ids)
  ]);

  const prod = {};
  (pr.data || []).forEach(p => { prod[p.id] = p; });
  const sizeStock = {};
  (sz.data || []).forEach(r => { sizeStock[r.product_id + "|" + r.size] = r.stock; });

  const before = items.length;
  items = items.map(i => {
    const p = prod[i.id];
    if (!p) return null;
    const max = p.is_stock_out ? 0 : (p.has_sizes ? (sizeStock[i.id + "|" + i.size] || 0) : p.stock);
    if (max <= 0) return null;
    return { ...i, name: p.name, price: Number(p.price), max, qty: Math.min(i.qty, max) };
  }).filter(Boolean);

  if (items.length < before) showToast("Some items are out of stock and were removed");
  Cart.save(items);
  render();
}

function render() {
  if (!items.length) {
    root.innerHTML = `<p class="empty">Your cart is empty.<br><br><a class="btn btn-primary" style="display:inline-block;padding:12px 24px" href="index.html">Shop now</a></p>`;
    return;
  }
  const total = items.reduce((n, i) => n + i.price * i.qty, 0);

  root.innerHTML = items.map((i, idx) => `
    <div class="cart-item">
      ${i.image ? `<img src="${esc(i.image)}" alt="">` : `<div></div>`}
      <div>
        <div style="font-weight:600">${esc(i.name)}</div>
        <div style="color:var(--muted);font-size:.85rem">${i.size ? "Size: " + esc(i.size) : ""}</div>
        <div class="qty">
          <button data-act="minus" data-i="${idx}">−</button>
          <span>${i.qty}</span>
          <button data-act="plus" data-i="${idx}" ${i.qty >= i.max ? "disabled" : ""}>+</button>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700">${money(i.price * i.qty)}</div>
        <button class="remove" data-act="remove" data-i="${idx}">Remove</button>
      </div>
    </div>`).join("") + `
    <div class="cart-total"><span>Subtotal</span><span>${money(total)}</span></div>
    <a class="btn btn-primary" style="display:block;text-align:center" href="checkout.html">Checkout</a>`;

  root.querySelectorAll("button[data-act]").forEach(b => {
    b.onclick = () => {
      const i = Number(b.dataset.i);
      if (b.dataset.act === "plus" && items[i].qty < items[i].max) items[i].qty++;
      if (b.dataset.act === "minus") items[i].qty--;
      if (b.dataset.act === "remove" || items[i].qty <= 0) items.splice(i, 1);
      Cart.save(items);
      render();
    };
  });
}

loadCart();
