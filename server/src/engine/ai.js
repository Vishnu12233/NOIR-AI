// ai.js — AI provider abstraction. NOIR never fakes AI output:
//  * when a provider key is configured (OPENAI_API_KEY etc.), calls the real API
//  * otherwise a transparent deterministic "built-in planner" answers are produced
//    from the project context — clearly labelled as such in the UI.
import crypto from 'node:crypto';
import { config } from '../config.js';

export const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', key: 'OPENAI_API_KEY', base: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'], default: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', key: 'ANTHROPIC_API_KEY', base: 'https://api.anthropic.com/v1', models: ['claude-3-5-haiku-latest', 'claude-sonnet-4-20250514'], default: 'claude-3-5-haiku-latest' },
  { id: 'google', label: 'Google Gemini', key: 'GOOGLE_API_KEY', base: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-2.0-flash'], default: 'gemini-2.0-flash' },
  { id: 'groq', label: 'Groq', key: 'GROQ_API_KEY', base: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile'], default: 'llama-3.3-70b-versatile' },
  { id: 'xai', label: 'xAI', key: 'XAI_API_KEY', base: 'https://api.x.ai/v1', models: ['grok-2-latest'], default: 'grok-2-latest' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', key: 'CUSTOM_AI_API_KEY', base: 'env:CUSTOM_AI_BASE', models: ['custom'], default: 'custom' },
];

export const MODES = {
  auto: { label: 'Auto', model: null },
  fast: { label: 'Fast', model: null },
  balanced: { label: 'Balanced', model: null },
  powerful: { label: 'Powerful', model: null },
};

export function configuredProviders(envVars = {}) {
  return PROVIDERS.filter((p) => {
    const v = envVars[p.key] || process.env[p.key];
    return !!v;
  }).map((p) => ({ id: p.id, label: p.label, model: envVars[p.id + '_model'] || p.default }));
}

function pickProvider(mode = 'auto', envVars = {}) {
  const got = configuredProviders(envVars);
  if (!got.length) return null;
  const order = { auto: 0, fast: 0, balanced: 0, powerful: 1 };
  const pref = (order[mode] ?? 0);
  const ranked = [...got].sort((a, b) => {
    const pa = PROVIDERS.find((p) => p.id === a.id);
    return (pref === 1 ? (pa && pa.id === 'custom' ? -1 : 1) : (pa && pa.id === 'custom' ? 1 : -1));
  });
  return ranked[0];
}

export async function aiComplete({ mode = 'auto', system, prompt, envVars = {}, maxTokens = 700, temperature = 0.2 }) {
  const provider = pickProvider(mode, envVars);
  if (!provider) return { provider: null, content: null, builtin: true };
  const pdef = PROVIDERS.find((p) => p.id === provider.id);
  const apiKey = envVars[pdef.key] || process.env[pdef.key];
  const base = pdef.base.startsWith('env:') ? (process.env[pdef.base.slice(4)] || '') : pdef.base;
  const model = envVars[pdef.id + '_model'] || pdef.default;
  try {
    if (pdef.id === 'anthropic') {
      const r = await fetch(base + '/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system: system || '', messages: [{ role: 'user', content: prompt }] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || ('HTTP ' + r.status));
      return { provider: provider.id, model, content: j.content?.map((c) => c.text || '').join('') || null, builtin: false, usage: j.usage };
    }
    const r = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature, messages: [{ role: 'system', content: system || 'You are NOIR, an AI software engineering teammate.' }, { role: 'user', content: prompt }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || ('HTTP ' + r.status));
    return { provider: provider.id, model, content: j.choices?.[0]?.message?.content || null, builtin: false, usage: j.usage };
  } catch (e) {
    return { provider: provider.id, error: String(e.message || e), content: null, builtin: true };
  }
}

/**
 * Streaming completion (openai-compatible providers only; Anthropic falls back to
 * a non-streamed call). Calls onDelta(deltaText) per token chunk; resolves the full
 * reply once finished. Returns { provider, model, content, streamed }.
 */
export async function aiStreamComplete({ mode = 'auto', system, prompt, envVars = {}, maxTokens = 700, temperature = 0.2, onDelta = () => {} }) {
  const provider = pickProvider(mode, envVars);
  if (!provider) return { provider: null, content: null, builtin: true, streamed: false };
  const pdef = PROVIDERS.find((p) => p.id === provider.id);
  const apiKey = envVars[pdef.key] || process.env[pdef.key];
  const base = pdef.base.startsWith('env:') ? (envVars[pdef.base.slice(4)] || process.env[pdef.base.slice(4)] || '') : pdef.base;
  const model = envVars[pdef.id + '_model'] || pdef.default;
  try {
    if (pdef.id === 'anthropic') {
      const r = await aiComplete({ mode, system, prompt, envVars, maxTokens, temperature });
      if (r.builtin) return r;
      onDelta(r.content || '');
      return { ...r, streamed: false };
    }
    const res = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature, stream: true, messages: [{ role: 'system', content: system || 'You are NOIR, an AI software engineering teammate.' }, { role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok || !res.body) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); msg = (j.error && (j.error.message || j.error)) || msg; } catch { /* keep */ }
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', content = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          const delta = j.choices && j.choices[0] && j.choices[0].delta && (j.choices[0].delta.content || '');
          if (delta) { content += delta; onDelta(delta); }
        } catch { /* partial json — ignore */ }
      }
    }
    return { provider: provider.id, model, content, builtin: false, streamed: true };
  } catch (e) {
    return { provider: provider.id, error: String(e.message || e), content: null, builtin: true, streamed: false };
  }
}

/** Structured output helper: asks AI for JSON, falls back to null on failure. */
export async function aiJson({ mode, system, prompt, envVars }) {
  const r = await aiComplete({ mode, system: (system || 'Reply with valid JSON only, no markdown fences.') + '\nJSON schema hints: follow the requested structure exactly.', prompt, envVars, temperature: 0 });
  if (r.builtin || !r.content) return r;
  try {
    const cleaned = String(r.content).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    return { ...r, json: JSON.parse(cleaned) };
  } catch {
    return { ...r, json: null, parseError: 'Model did not return valid JSON' };
  }
}

// ---------------- deterministic built-in reasoning ----------------
// When no provider is configured these functions return honest, context-derived
// answers. Every UI surfaces the provider state so users know what ran.

const CATEGORY_WORDS = {
  saas: ['saas', 'subscription', 'billing', 'tenant', 'b2b'],
  crm: ['crm', 'sales', 'pipeline', 'lead', 'prospect', 'client management'],
  ecommerce: ['ecommerce', 'e-commerce', 'store', 'shop', 'sell product', 'cart'],
  marketplace: ['marketplace', 'multi-vendor', 'listing', 'classified'],
  ai_app: ['ai app', 'chatbot', 'llm', 'gpt', 'assistant', 'intelligence', 'copilot'],
  dashboard: ['dashboard', 'admin panel', 'internal tool'],
  analytics: ['analytics', 'metrics', 'reporting', 'kpi'],
  blog: ['blog', 'content', 'articles', 'writing'],
  social: ['social', 'community feed', 'followers'],
  forum: ['forum', 'discussion board', 'q&a'],
  education: ['education', 'learning', 'course', 'school', 'academy', 'lms', 'student'],
  healthcare: ['healthcare', 'clinic', 'hospital', 'patient', 'medical'],
  finance: ['finance', 'expense', 'budget', 'money', 'bookkeeping'],
  erp: ['erp', 'inventory', 'warehouse', 'employees', 'operations', 'hr'],
  devtools: ['developer tool', 'api keys', 'feature flag', 'devtool'],
  portfolio: ['portfolio', 'personal site', 'showcase'],
  news: ['news', 'newsroom', 'magazine'],
  booking: ['booking', 'appointment', 'reservation', 'scheduling'],
  landing: ['landing page', 'marketing site', 'pricing page'],
};

const FEATURE_WORDS = [
  ['auth', ['sign in', 'sign up', 'login', 'accounts', 'register', 'authentication']],
  ['payments', ['payment', 'stripe', 'checkout', 'pay', 'billing', 'subscription charge']],
  ['ai_chat', ['ai', 'chat assistant', 'ask questions', 'chatbot']],
  ['search', ['search', 'find', 'filter']],
  ['uploads', ['upload', 'file', 'image']],
  ['comments', ['comment', 'discuss']],
  ['email', ['contact form', 'email', 'newsletter']],
  ['charts', ['chart', 'graph', 'visualize', 'analytics']],
];

export function detectCategory(text) {
  const t = String(text || '').toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORY_WORDS)) {
    if (words.some((w) => t.includes(w))) return cat;
  }
  for (const w of ['manage', 'track', 'organize', 'tool', 'internal']) {
    if (t.includes(w)) return 'general';
  }
  return 'general';
}

export function detectFeatures(text) {
  const t = String(text || '').toLowerCase();
  const out = [];
  for (const [key, words] of FEATURE_WORDS) {
    if (words.some((w) => t.includes(w))) out.push(key);
  }
  return out;
}

export function detectUsers(text) {
  const t = String(text || '').toLowerCase();
  if (/public|anyone|visitor|external|no login|without account/.test(t)) return 'public';
  if (/team|internal|employees|staff only/.test(t)) return 'team';
  return 'mixed';
}

export function suggestName(text) {
  const t = String(text || '').trim();
  const phrases = t.match(/called ["']?([A-Z][A-Za-z0-9 _-]{1,40}?)(?:["']|,|\.|$)/);
  if (phrases) return phrases[1].trim();
  const cat = detectCategory(text);
  const NAME = { saas: 'Lumen SaaS', crm: 'Pulse CRM', ecommerce: 'Meridian Store', marketplace: 'Bazaar', ai_app: 'Atlas AI', chatbot: 'Echo Assistant', dashboard: 'Vertex Console', analytics: 'Signal Analytics', blog: 'Inkwell', social: 'Circles', forum: 'Townhall', education: 'Brightpath', healthcare: 'Careline', finance: 'Ledgerly', erp: 'Foundry ERP', devtools: 'Toolkit', portfolio: 'Portfolio', news: 'The Bulletin', booking: 'Slot', landing: 'Landing Page' };
  return NAME[cat] || 'Nova App';
}
