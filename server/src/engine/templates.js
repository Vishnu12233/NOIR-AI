// engine/templates.js — one-click starter specs (each generates a real project).
import { compileSpec } from '../gen/spec.js';

export const TEMPLATE_SPECS = {
  saas: { category: 'saas', features: ['auth', 'payments', 'search', 'charts'], light: false, theme: 'graphite', entity: null },
  'ai-app': { category: 'ai_app', features: ['auth', 'ai_chat'], light: false, theme: 'violet', entity: null },
  dashboard: { category: 'dashboard', features: ['auth', 'charts', 'search'], light: false, theme: 'cyan', entity: null },
  ecommerce: { category: 'ecommerce', features: ['auth', 'payments', 'search', 'uploads'], light: false, theme: 'crimson', entity: null },
  crm: { category: 'crm', features: ['auth', 'search'], light: false, theme: 'umber', entity: null },
  erp: { category: 'erp', features: ['auth', 'search', 'charts'], light: false, theme: 'graphite', entity: null },
  portfolio: { category: 'portfolio', features: ['email'], light: true, theme: 'azure', entity: null },
  blog: { category: 'blog', features: ['auth', 'comments', 'search'], light: false, theme: 'ermine', entity: null },
  education: { category: 'education', features: ['auth', 'search'], light: false, theme: 'cyan', entity: null },
  healthcare: { category: 'healthcare', features: ['auth', 'search'], light: false, theme: 'ermine', entity: null },
  finance: { category: 'finance', features: ['auth', 'charts'], light: false, theme: 'umber', entity: null },
  marketplace: { category: 'marketplace', features: ['auth', 'payments', 'search'], light: false, theme: 'crimson', entity: null },
  social: { category: 'social', features: ['auth', 'comments', 'search'], light: false, theme: 'violet', entity: null },
  'developer-tools': { category: 'devtools', features: ['auth', 'search'], light: false, theme: 'graphite', entity: null },
  landing: { category: 'landing', features: ['email'], light: true, theme: 'azure', entity: null },
  analytics: { category: 'analytics', features: ['auth', 'charts'], light: false, theme: 'cyan', entity: null },
  forum: { category: 'forum', features: ['auth', 'comments', 'search'], light: false, theme: 'obsidian', entity: null },
  booking: { category: 'booking', features: ['auth', 'email', 'search'], light: false, theme: 'cyan', entity: null },
};

export function specForTemplate(tkey, name, tagline) {
  const t = TEMPLATE_SPECS[tkey];
  if (!t) return null;
  return compileSpec({
    name: name || defaultName(tkey), tagline: tagline || '', category: t.category,
    features: t.features, withSeed: true, light: t.light, theme: t.theme,
  });
}
export const DEFAULT_TEMPLATE_NAMES = {
  saas: 'Northwind SaaS', 'ai-app': 'Atlas AI', dashboard: 'Vertex Console', ecommerce: 'Meridian Store',
  crm: 'Pulse CRM', erp: 'Foundry ERP', portfolio: 'My Portfolio', blog: 'Inkwell Blog',
  education: 'Brightpath Academy', healthcare: 'Careline Clinic', finance: 'Ledgerly Finance',
  marketplace: 'Bazaar Market', social: 'Circles Social', 'developer-tools': 'Toolkit DevTools',
  landing: 'Launchpad Landing', analytics: 'Signal Analytics', forum: 'Townhall Forum', booking: 'Slot Booking',
};
const defaultName = (k) => DEFAULT_TEMPLATE_NAMES[k] || 'NOIR App';
