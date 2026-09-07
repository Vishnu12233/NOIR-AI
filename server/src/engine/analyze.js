// analyze.js — requirement analyzer: natural language → structured specification.
// Rule engine always runs (deterministic). When an AI provider is configured the
// rules are used as guardrails and the AI may only refine labels/descriptions.
import { aiComplete, detectCategory, detectFeatures, detectUsers, suggestName } from './ai.js';
import { detectEntity } from '../gen/spec.js';
import { config } from '../config.js';

const CATEGORY_LABELS = {
  saas: 'SaaS', crm: 'CRM', ecommerce: 'E-commerce', ai_app: 'AI application', dashboard: 'Dashboard',
  analytics: 'Analytics', blog: 'Blog', social: 'Social network', forum: 'Forum', education: 'Education',
  healthcare: 'Healthcare', finance: 'Finance', erp: 'ERP / Operations', devtools: 'Developer tool',
  portfolio: 'Portfolio', news: 'Newsroom', booking: 'Booking / Scheduling', landing: 'Landing page',
  chatbot: 'AI chatbot', marketplace: 'Marketplace', general: 'Web application',
};

const DEFAULT_FEATURES = {
  saas: ['auth', 'payments', 'search'], crm: ['auth', 'search'], ecommerce: ['auth', 'payments', 'search', 'uploads'],
  marketplace: ['auth', 'payments', 'search'], ai_app: ['auth', 'ai_chat'], chatbot: ['ai_chat'],
  dashboard: ['auth', 'charts'], analytics: ['auth', 'charts'], blog: ['auth', 'comments', 'search'],
  social: ['auth', 'comments', 'search'], forum: ['auth', 'comments', 'search'], education: ['auth', 'search'],
  healthcare: ['auth', 'search'], finance: ['auth', 'charts'], erp: ['auth', 'search', 'charts'],
  devtools: ['auth', 'search'], portfolio: ['email'], news: ['auth', 'comments', 'search'],
  booking: ['auth', 'email', 'search'], landing: ['email'], general: ['auth', 'search'],
};

export function analyzeRequirement(prompt, { envVars = {} } = {}) {
  const text = String(prompt || '').trim();
  const raw = { text };
  const category = detectCategory(text);
  const featuresFromText = detectFeatures(text);
  const defaults = (DEFAULT_FEATURES[category] || []).filter((f) => !featuresFromText.includes(f));
  const features = [...new Set([...featuresFromText, ...defaults])].filter((f) => f !== 'charts' || category === 'dashboard' || category === 'analytics' || featuresFromText.includes('charts'));
  const entity = detectEntity(text);

  const spec = {
    name: suggestName(text),
    tagline: null,
    category,
    categoryLabel: CATEGORY_LABELS[category] || 'Web application',
    users: detectUsers(text),
    features,
    entity,
    assumptions: [],
    questions: [],
  };
  spec.tagline = taglineFor(spec);
  if (!/called|named/i.test(text) && spec.name.endsWith('App')) spec.assumptions.push('Project name is a working title — rename it in the specification.');
  if (featuresFromText.length === 0) spec.assumptions.push('No explicit feature list was given — NOIR added the standard set for a ' + spec.categoryLabel.toLowerCase() + '.');

  // Optional: AI polish when a provider is available (never invents structure beyond rules)
  return spec;
}

function taglineFor(spec) {
  const base = {
    saas: 'Subscription management, plans and customer self-service.',
    crm: 'Pipeline tracking, contact records and sales activity.',
    ecommerce: 'Storefront, catalog, cart and order management.',
    marketplace: 'Listings, sellers and buyer checkout flows.',
    ai_app: 'A conversational layer over your own data.',
    chatbot: 'An assistant trained on your content.',
    dashboard: 'At-a-glance operational metrics and controls.',
    analytics: 'Events, metrics and time-series reporting.',
    blog: 'Writing, publishing and reader engagement.',
    social: 'Profiles, posts and community conversations.',
    forum: 'Threads, replies and topic organization.',
    education: 'Courses, enrollment and progress tracking.',
    healthcare: 'Patient records and appointment scheduling.',
    finance: 'Transactions, budgets and money analytics.',
    erp: 'Inventory, employees and operational workflows.',
    devtools: 'Tools for developers with key and feature management.',
    portfolio: 'Your work, presented cleanly.',
    news: 'Editorial workflow and public articles.',
    booking: 'Scheduling with confirmations.',
    landing: 'A conversion-focused marketing page.',
    general: 'A full-stack application with a database and API.',
  };
  return base[spec.category] || 'A full-stack application.';
}

export async function enhanceWithAi(analysis, text, envVars) {
  try {
    const sys = 'You are NOIR\'s requirement analyzer. You refine names and taglines only. Reply with JSON: {"name": "...", "tagline": "..."}. Keep name <= 40 chars. Never change category or structure decisions.';
    const prompt = 'Project description: "' + text.slice(0, 2000) + '"\nDraft name: ' + analysis.name + '\nDraft tagline: ' + analysis.tagline;
    const r = await aiComplete({ mode: 'balanced', system: sys, prompt, envVars, maxTokens: 140, temperature: 0.2 });
    if (r.builtin || !r.content) return analysis;
    const m = String(r.content).match(/\{[\s\S]*\}/);
    if (!m) return analysis;
    const j = JSON.parse(m[0]);
    if (j.name && /^[A-Za-z0-9][A-Za-z0-9 _\-]{2,39}$/.test(String(j.name))) analysis.name = String(j.name).trim();
    if (j.tagline && j.tagline.length < 140) analysis.tagline = String(j.tagline).trim();
    analysis.polishedBy = 'ai';
  } catch {
    /* keep rule output */
  }
  return analysis;
}

export { CATEGORY_LABELS };
