// Storefront: shop grid, product page, cart with checkout (order creation)
import { App } from '../app.js';
import { $, $$, api, esc, escAttr, el, toast, fmtDate, pageHead, loadingNode, errorBox, wireRetry, fetchTable, metaTable, statusBadge, guard, confirmDialog } from './ui.js';

const prodT = () => { const t = App.meta.tables.find((x) => x.shop === true) || App.meta.tables.find((x) => x.client !== false && x.client !== 'admin'); return t ? t.table : 'products'; };
const money = (v) => '$' + Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function cartKey() { return App.meta.name + ':cart'; }
export function getCart() { try { return JSON.parse(localStorage.getItem(cartKey()) || '[]'); } catch { return []; } }
function setCart(c) { try { localStorage.setItem(cartKey(), JSON.stringify(c)); } catch { /* noop */ } }

export function cartCount() { return getCart().reduce((s, i) => s + i.qty, 0); }

export function shop() {
  const root = el(`<div></div>`);
  root.append(pageHead('Shop', 'Browse the catalog.', `<a class="btn primary sm" href="#/cart">🛒 Cart (${cartCount()})</a>`));
  root.append(loadingNode());
  const load = async () => {
    try {
      const items = await fetchTable(prodT());
      $('.page-loading', root)?.remove();
      const grid = el(`<div class="grid cols-3"></div>`);
      for (const p of items) {
        const emoji = p.emoji || p.image_emoji || '📦';
        const card = el(`<div class="card product-card">
          <div class="prod-emoji">${emoji}</div>
          <div><a href="#/product/${escAttr(p.id)}" class="linkish" style="font-size:16px;font-weight:600">${esc(p.name || p.title)}</a></div>
          <div class="muted small">${esc((p.category || p.description || '').slice(0, 90))}</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="price">${money(p.price)}</span>
            <button class="btn sm primary" data-add>Add to cart</button>
          </div></div>`);
        $('[data-add]', card).onclick = () => {
          const c = getCart(); const found = c.find((x) => x.id === p.id);
          if (found) found.qty += 1; else c.push({ id: p.id, name: p.name || p.title, price: Number(p.price || 0), emoji, qty: 1 });
          setCart(c);
          toast('Added to cart');
          $('.page-head .btn', root).textContent = `🛒 Cart (${cartCount()})`;
        };
        grid.append(card);
      }
      root.append(grid);
    } catch (e) { const eb = errorBox(e); root.append(eb); wireRetry(eb, load); }
  };
  load();
  return root;
}

export function product(params) {
  const root = el(`<div></div>`);
  root.append(loadingNode());
  const load = async () => {
    try {
      const p = await api(`/api/${prodT()}/${encodeURIComponent(params[0])}`);
      root.innerHTML = '';
      const meta = metaTable(prodT());
      const cols = (meta?.fields || []).filter((f) => !f.hidden && !f.noAuto && !f.private && f.key !== 'image_emoji');
      root.append(el(`<div style="max-width:760px;margin:0 auto"></div>`));
      const w = root.firstChild;
      w.append(el(`<a class="muted small" href="#/shop">← Shop</a>`));
      w.append(el(`<div class="card" style="margin-top:10px">
        <div class="prod-emoji" style="font-size:64px">${esc(p.image_emoji || '📦')}</div>
        <h1 style="margin:10px 0 2px">${esc(p.name || p.title)}</h1>
        <div class="muted">${esc(p.category || '')}</div>
        <div class="price" style="font-size:22px;margin:12px 0">${money(p.price)}</div>
        <p>${esc(p.description || '')}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
          <button class="btn primary" data-add>Add to cart</button>
          <a class="btn ghost" href="#/cart">Go to cart</a>
        </div></div>`));
      $('[data-add]', w).onclick = () => { const c = getCart(); const f = c.find((x) => x.id === p.id); if (f) f.qty += 1; else c.push({ id: p.id, name: p.name || p.title, price: Number(p.price || 0), emoji: p.image_emoji || '📦', qty: 1 }); setCart(c); toast('Added to cart'); };
    } catch (e) { const eb = errorBox(e); root.append(eb); wireRetry(eb, load); }
  };
  load();
  return root;
}

export function cart() {
  const root = el(`<div></div>`);
  root.append(pageHead('Your cart', '', ''));
  const paint = () => {
    const items = getCart();
    root.innerHTML = '';
    root.append(pageHead('Your cart', `${items.length ? items.reduce((s, i) => s + i.qty, 0) + ' items' : ''}`));
    if (!items.length) { root.append(el(`<div class="empty"><h3>Your cart is empty</h3><p><a href="#/shop" class="btn primary" style="margin-top:8px">Browse the shop</a></p></div>`)); return; }
    let total = 0;
    const rows = items.map((i) => {
      total += i.price * i.qty;
      return el(`<div class="cart-row">
        <span style="font-size:26px">${i.emoji}</span>
        <div style="flex:1"><strong>${esc(i.name)}</strong><div class="muted small">${money(i.price)} each</div></div>
        <button class="btn ghost sm" data-dec>−</button><span class="mono">${i.qty}</span><button class="btn ghost sm" data-inc>+</button>
        <span class="price" style="width:90px;text-align:right">${money(i.price * i.qty)}</span>
        <button class="btn ghost sm" data-rm>✕</button></div>`);
    });
    const wrap = el(`<div class="card">${rows.map((r) => r.outerHTML).join('')}
      <hr class="divider"><div style="display:flex;justify-content:space-between;align-items:center">
        <div><div class="muted small">Total</div><div class="price" style="font-size:22px">${money(total)}</div></div>
        <button class="btn primary lg" data-checkout>Checkout</button></div>
      <p class="hint">Demo storefront — orders are recorded; online payment requires a configured payment provider in NOIR.</p></div>`);
    root.append(wrap);
    $$('[data-checkout]', wrap).forEach((b) => b.onclick = async () => {
      if (!App.user) { toast('Sign in to place an order', 'error'); location.hash = '#/login'; return; }
      try {
        const o = await api('/api/orders', { body: { items: JSON.stringify(items.map((i) => ({ name: i.name, qty: i.qty, price: i.price }))), total: total.toFixed(2), status: 'pending' } });
        toast('Order #' + o.id + ' placed');
        setCart([]);
        paint();
      } catch (e) { toast(e.message, 'error'); }
    });
    $$('.cart-row', wrap).forEach((rowEl) => {
      const rowIdx = [...$$('.cart-row', wrap)].indexOf(rowEl);
      $('[data-inc]', rowEl).onclick = () => { items[rowIdx].qty += 1; setCart(items); paint(); };
      $('[data-dec]', rowEl).onclick = () => { items[rowIdx].qty -= 1; if (items[rowIdx].qty < 1) items.splice(rowIdx, 1); setCart(items); paint(); };
      $('[data-rm]', rowEl).onclick = () => { items.splice(rowIdx, 1); setCart(items); paint(); };
    });
  };
  paint();
  return root;
}
