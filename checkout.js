const root = document.getElementById("checkout");
let items = Cart.get();
let charge = null;

if (!items.length) {
  root.innerHTML = `<p class="empty">Your cart is empty.<br><br><a class="btn btn-primary" style="display:inline-block;padding:12px 24px" href="index.html">Shop now</a></p>`;
} else {
  init();
}

function subtotal () {returnitems.reduce((n, i) => n + i.price * i.qty, 0);}
const $ = id => document.getElementById(id);

async function api(url, opts) {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong");
  return j;
}

function fill(sel, list, placeholder) {
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    list.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
  sel.disabled = !list.length;
}

function selText(sel) {
  return sel.value ? sel.options[sel.selectedIndex].text : "";
}

function renderTotals() {
  const sub = subtotal();
  $("t-sub").textContent = money(sub);
  $("t-del").textContent = charge === null ? "Select city and zone" : money(charge);
  $("t-total").textContent = charge === null ? money(sub) : money(sub + charge);
}

function init() {
  root.innerHTML = `
    <div class="field"><label>Full name</label><input id="c-name" autocomplete="name"></div>
    <div class="field"><label>Mobile number</label><input id="c-phone" type="tel" inputmode="numeric" placeholder="01XXXXXXXXX" autocomplete="tel"></div>
    <div class="field"><label>City</label><select id="c-city" disabled><option value="">Loading...</option></select></div>
    <div class="field"><label>Zone</label><select id="c-zone" disabled><option value="">Select zone</option></select></div>
    <div class="field"><label>Area (optional)</label><select id="c-area" disabled><option value="">Select area</option></select></div>
    <div class="field"><label>Full address (house, road, landmark)</label><textarea id="c-address" rows="3"></textarea></div>

    <div class="box">
      ${items.map(i => `<div class="line"><span>${esc(i.name)}${i.size ? " (" + esc(i.size) + ")" : ""} x${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join("")}
      <div class="line" style="border-top:1px solid var(--line);padding-top:8px"><span>Subtotal</span><span id="t-sub"></span></div>
      <div class="line"><span>Delivery charge</span><span id="t-del"></span></div>
      <div class="line grand"><span>Total</span><span id="t-total"></span></div>
      <div class="muted" style="color:var(--muted);font-size:.85rem;margin-top:8px">Payment: Cash on Delivery</div>
    </div>

    <button class="btn btn-primary" id="place" style="width:100%;margin-top:16px">Place Order</button>`;

  renderTotals();

  const city = $("c-city"), zone = $("c-zone"), area = $("c-area");

  api("/api/locations?type=cities").then(d => fill(city, d.items, "Select city"))
    .catch(() => showToast("Could not load cities. Refresh the page."));

  city.onchange = async () => {
    charge = null; renderTotals();
    fill(zone, [], "Select zone"); fill(area, [], "Select area");
    if (!city.value) return;
    zone.innerHTML = `<option value="">Loading...</option>`;
    try {
      const d = await api("/api/locations?type=zones&city=" + city.value);
      fill(zone, d.items, "Select zone");
    } catch (e) { showToast(e.message); }
  };

  zone.onchange = async () => {
    charge = null; renderTotals();
    fill(area, [], "Select area");
    if (!zone.value) return;
    try {
      const [a, c] = await Promise.all([
        api("/api/locations?type=areas&zone=" + zone.value),
        api("/api/delivery-charge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city: city.value, zone: zone.value }) })
      ]);
      fill(area, a.items, "Select area");
      charge = c.charge; renderTotals();
    } catch (e) { showToast(e.message); }
  };

  $("place").onclick = async () => {
    const name = $("c-name").value.trim();
    const phone = $("c-phone").value.replace(/[\s-]/g, "").replace(/^\+?88/, "");
    const address = $("c-address").value.trim();

    if (name.length < 2) return showToast("Enter your name");
    if (!/^01[3-9]\d{8}$/.test(phone)) return showToast("Enter a valid 11-digit mobile number");
    if (!city.value) return showToast("Select your city");
    if (!zone.value) return showToast("Select your zone");
    if (address.length < 10) return showToast("Enter your full address");

    const btn = $("place");
    btn.disabled = true; btn.textContent = "Placing order...";
    try {
      const res = await api("/api/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, phone, address,
          city: city.value, zone: zone.value, area: area.value,
          cityName: selText(city), zoneName: selText(zone), areaName: selText(area),
          items: items.map(i => ({ id: i.id, size: i.size || "", qty: i.qty }))
        })
      });
      localStorage.removeItem(Cart.key);
      updateCartCount();
      root.innerHTML = `
        <div class="done">
          <h2>Order placed!</h2>
          <p style="margin:10px 0">Order no: <b>${esc(res.orderNo)}</b></p>
          <p>Total to pay on delivery: <b>${money(res.total)}</b></p>
          <p style="color:var(--muted);margin-top:8px">We will contact you on ${esc(phone)} soon.</p>
          <a class="btn btn-primary" style="display:inline-block;margin-top:20px;padding:12px 24px" href="index.html">Continue shopping</a>
        </div>`;
    } catch (e) {
      showToast(e.message);
      btn.disabled = false; btn.textContent = "Place Order";
    }
  };
}
