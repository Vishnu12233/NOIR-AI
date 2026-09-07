// Landing page (used when archetype is 'landing'): hero, features, pricing, newsletter, contact
import { App } from '../app.js';
import { $, api, esc, el, toast, loadingNode, fetchTable, pageHead } from './ui.js';

export function landingPage() {
  const root = el(`<div></div>`);
  const hasAuth = App.meta.auth;
  const brand = esc(App.meta.name);
  root.innerHTML = `
    <div class="port-hero" style="max-width:760px;margin:0 auto">
      <div class="brand-dot" style="display:inline-block;width:14px;height:14px;border-radius:4px"></div>
      <h1 style="font-size:clamp(34px,6vw,56px);margin-top:10px">${brand}</h1>
      <div class="port-tag muted">${esc(App.meta.tagline || '')}</div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:22px;flex-wrap:wrap">
        ${hasAuth ? '' : '<a class="btn primary lg" href="#/signup">Get started</a>'}
        ${hasAuth ? '<a class="btn primary lg" href="#/">Open dashboard</a>' : '<a class="btn ghost lg" href="#/login">Sign in</a>'}
      </div>
    </div>
    <section id="features" style="max-width:900px;margin:26px auto 0">
      <h2 style="text-align:center">Everything you need</h2>
      <div class="grid cols-3" data-feats style="margin-top:16px"><div class="page-loading">Loading…</div></div>
    </section>
    <section id="pricing" style="max-width:900px;margin:40px auto 0">
      <h2 style="text-align:center">Simple pricing</h2>
      <div class="grid cols-3" data-plans style="margin-top:16px"></div>
    </section>
    <section id="newsletter" class="card" style="max-width:520px;margin:46px auto 0;text-align:center">
      <h3>Stay in the loop</h3>
      <p class="muted">Product updates, no spam. Unsubscribe anytime.</p>
      <form data-sub style="display:flex;gap:8px;margin-top:10px">
        <input type="email" name="email" placeholder="you@example.com" required>
        <button class="btn primary">Subscribe</button>
      </form>
      <p class="hint">Subscribers are stored in this app's database.</p>
    </section>
    ${App.meta.tables.some((t) => t.table === 'inquiries') ? `<section class="card" style="max-width:520px;margin:30px auto 40px">
      <h3>Contact us</h3>
      <form data-contact>
        <label>Name</label><input name="name" required>
        <label>Email</label><input type="email" name="email" required>
        <label>Message</label><textarea name="message" required></textarea>
        <button class="btn primary" style="margin-top:12px">Send</button>
      </form></section>` : ''}
    <div class="footer-meta">${brand} · generated with NOIR</div>`;
  const featsBox = $('[data-feats]', root);
  const plansBox = $('[data-plans]', root);
  (async () => {
    try {
      const feats = await fetchTable('features').catch(() => []);
      if (feats.length) {
        featsBox.innerHTML = feats.map((f) => `<div class="card"><div style="font-size:22px;margin-bottom:6px">🧩</div><h4 style="margin:0 0 4px">${esc(f.title)}</h4><div class="muted small">${esc(f.description || '')}</div><div style="margin-top:8px"><span class="badge ${f.status === 'launched' ? 'ok' : f.status === 'in_progress' ? 'accent' : ''}">${esc(f.status || 'planned')}</span></div></div>`).join('');
      } else { featsBox.innerHTML = '<div class="card"><h4>Built with NOIR</h4><div class="muted">This project was generated end-to-end by an AI engineering team.</div></div>'; }
      const plans = await fetchTable('plans').catch(() => []);
      plansBox.innerHTML = plans.length ? plans.map((p) => `<div class="card" style="text-align:center"><h3>${esc(p.name)}</h3>
        <div style="font-size:28px;font-weight:800;margin:8px 0">$${Number(p.price || 0)}<span class="muted" style="font-size:13px">/${esc(p.interval || 'mo')}</span></div>
        <p class="muted small">${esc(p.highlights || '')}</p>
        <a class="btn ${p.name === 'Pro' ? 'primary' : 'ghost'} sm" href="${hasAuth ? '#/' : '#/signup'}">Choose ${esc(p.name)}</a></div>`).join('') : '<p class="muted" style="grid-column:1/-1;text-align:center">Pricing coming soon.</p>';
    } catch { /* leave loading text replaced */ featsBox.innerHTML = ''; plansBox.innerHTML = '<p class="muted">—</p>'; }
  })();
  const sub = $('[data-sub]', root);
  if (sub) sub.onsubmit = async (e) => {
    e.preventDefault();
    const email = new FormData(sub).get('email');
    try { await api('/api/subscribers', { body: { email } }); toast('Subscribed!'); sub.reset(); }
    catch (err) { toast(err.message, 'error'); }
  };
  const contact = $('[data-contact]', root);
  if (contact) contact.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(contact);
    try { await api('/api/inquiries', { body: { name: fd.get('name'), email: fd.get('email'), message: fd.get('message'), status: 'new' } }); toast('Message sent'); contact.reset(); }
    catch (err) { toast(err.message, 'error'); }
  };
  return root;
}
