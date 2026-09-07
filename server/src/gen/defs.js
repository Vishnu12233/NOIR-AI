// NOIR knowledge layer: feature registry, palettes, templates, entity presets.
// These definitions drive requirement analysis, planning and code generation.

export const PALETTES = [
  { key: 'obsidian', name: 'Obsidian', bg: '#0a0a0f', card: '#131319', border: '#26262f', accent: '#c9a86a', accent2: '#e8d9b8', text: '#e8e6e1', muted: '#8b8a94' },
  { key: 'graphite', name: 'Graphite', bg: '#0c0e12', card: '#14171d', border: '#252b35', accent: '#5b9cff', accent2: '#9cc3ff', text: '#e6eaf0', muted: '#7d8794' },
  { key: 'ermine', name: 'Ermine', bg: '#0d0f0e', card: '#151917', border: '#273029', accent: '#63c78b', accent2: '#a4e3bd', text: '#e7ece8', muted: '#818f86' },
  { key: 'umber', name: 'Umber', bg: '#0e0c0a', card: '#171310', border: '#2d2620', accent: '#e08a5a', accent2: '#f2c4a4', text: '#ede7e1', muted: '#94877d' },
  { key: 'violet', name: 'Violet', bg: '#0c0a12', card: '#151222', border: '#292340', accent: '#a78bfa', accent2: '#cdbcfc', text: '#ece9f4', muted: '#8a83a3' },
  { key: 'cyan', name: 'Cyan', bg: '#071013', card: '#0d1a1f', border: '#1b3038', accent: '#4fd6e8', accent2: '#a2eaf3', text: '#e4eef0', muted: '#74adb8' },
  { key: 'crimson', name: 'Crimson', bg: '#0f0a0c', card: '#1a1115', border: '#33202a', accent: '#e4587f', accent2: '#f3a5bb', text: '#f0e7ea', muted: '#9c7f8a' },
  { key: 'azure', name: 'Azure', bg: '#f6f8fb', card: '#ffffff', border: '#dfe5ee', accent: '#2563eb', accent2: '#1e40af', text: '#0f172a', muted: '#64748b' },
];

// product archetypes: which pages/features the analyzer prefers for a category
export const ARCHETYPES = {
  crm: { entity: 'leads', pages: ['dashboard', 'items', 'detail', 'kanban'], features: ['search'], nameHint: 'CRM', accent: 'umber' },
  saas: { entity: 'customers', pages: ['dashboard', 'items', 'detail', 'settings'], features: ['payments', 'search'], nameHint: 'SaaS', accent: 'graphite' },
  ecommerce: { entity: 'products', pages: ['store', 'product', 'cart', 'orders', 'admin'], features: ['payments', 'search', 'uploads'], nameHint: 'Store', accent: 'crimson' },
  blog: { entity: 'posts', pages: ['feed', 'post', 'admin'], features: ['search'], nameHint: 'Blog', accent: 'ermine' },
  dashboard: { entity: 'metrics', pages: ['dashboard', 'settings'], features: ['charts'], nameHint: 'Dashboard', accent: 'cyan' },
  portfolio: { entity: 'projects', pages: ['portfolio', 'detail', 'contact'], features: ['email'], nameHint: 'Portfolio', accent: 'azure', light: true },
  ai_app: { entity: 'documents', pages: ['dashboard', 'chat', 'items'], features: ['ai_chat'], nameHint: 'AI App', accent: 'violet' },
  chatbot: { entity: 'documents', pages: ['chat'], features: ['ai_chat'], nameHint: 'Assistant', accent: 'violet' },
  marketplace: { entity: 'products', pages: ['store', 'product', 'orders', 'admin'], features: ['payments', 'search'], nameHint: 'Marketplace', accent: 'umber' },
  education: { entity: 'courses', pages: ['dashboard', 'items', 'detail', 'progress'], features: ['search'], nameHint: 'Academy', accent: 'cyan' },
  healthcare: { entity: 'patients', pages: ['dashboard', 'items', 'detail', 'appointments'], features: ['search'], nameHint: 'Clinic', accent: 'ermine' },
  finance: { entity: 'transactions', pages: ['dashboard', 'items', 'budgets'], features: ['charts'], nameHint: 'Finance', accent: 'graphite' },
  social: { entity: 'posts', pages: ['feed', 'profile', 'chat'], features: ['search'], nameHint: 'Social', accent: 'violet' },
  forum: { entity: 'threads', pages: ['feed', 'post', 'profile'], features: ['search'], nameHint: 'Forum', accent: 'azure', light: true },
  erp: { entity: 'employees', pages: ['dashboard', 'items', 'detail', 'departments'], features: ['search', 'charts'], nameHint: 'ERP', accent: 'umber' },
  devtools: { entity: 'features', pages: ['dashboard', 'items', 'detail', 'docs'], features: ['search'], nameHint: 'DevTools', accent: 'graphite' },
  news: { entity: 'articles', pages: ['feed', 'post', 'admin'], features: ['search'], nameHint: 'Newsroom', accent: 'crimson' },
  booking: { entity: 'appointments', pages: ['dashboard', 'book', 'items'], features: ['email', 'search'], nameHint: 'Booking', accent: 'cyan' },
  analytics: { entity: 'events', pages: ['dashboard', 'items'], features: ['charts'], nameHint: 'Analytics', accent: 'violet' },
  general: { entity: 'items', pages: ['dashboard', 'items', 'detail'], features: ['search'], nameHint: 'App', accent: 'obsidian' },
};

export const FEATURES = [
  { key: 'auth', label: 'Email + password accounts', cost: 'high' },
  { key: 'google_auth', label: 'Google sign-in', cost: 'high', requires: 'auth' },
  { key: 'payments', label: 'Payments (Stripe-compatible)', cost: 'high' },
  { key: 'ai_chat', label: 'AI assistant chat', cost: 'high' },
  { key: 'search', label: 'Search & filters', cost: 'low' },
  { key: 'uploads', label: 'File uploads', cost: 'medium' },
  { key: 'charts', label: 'Charts & analytics', cost: 'medium' },
  { key: 'notifications', label: 'Notifications', cost: 'medium', requires: 'auth' },
  { key: 'email', label: 'Contact / mail forms', cost: 'low' },
  { key: 'comments', label: 'Comments', cost: 'medium' },
  { key: 'roles', label: 'Roles & permissions', cost: 'high', requires: 'auth' },
  { key: 'export', label: 'CSV export', cost: 'low' },
];

export const TEMPLATES = [
  { key: 'saas', name: 'SaaS', icon: 'layers', tag: 'Subscriptions', desc: 'Customer portal, plans, billing checkout flow and usage dashboard.', dark: false },
  { key: 'ai-app', name: 'AI Application', icon: 'sparkles', tag: 'LLM powered', desc: 'Conversational assistant with provider key management and chat history.', dark: true },
  { key: 'dashboard', name: 'Dashboard', icon: 'chart', tag: 'Admin analytics', desc: 'KPI cards, charts, CSV export and admin console over your data.', dark: false },
  { key: 'ecommerce', name: 'Ecommerce', icon: 'bag', tag: 'Storefront', desc: 'Product catalog, cart, checkout stub and order management.', dark: false },
  { key: 'crm', name: 'CRM', icon: 'contacts', tag: 'Sales pipeline', desc: 'Lead kanban board, pipelines, activity notes and search.', dark: false },
  { key: 'erp', name: 'ERP', icon: 'briefcase', tag: 'Operations', desc: 'Departments, employees, inventory and operations dashboards.', dark: false },
  { key: 'portfolio', name: 'Portfolio', icon: 'user', tag: 'Personal site', desc: 'Project showcase with contact form and polished light pages.', dark: true },
  { key: 'blog', name: 'Blog', icon: 'edit', tag: 'Content', desc: 'Posts with categories, search, and a writer admin panel.', dark: false },
  { key: 'education', name: 'Education', icon: 'graduation', tag: 'Learning', desc: 'Courses, lessons, enrollments and learner progress tracking.', dark: false },
  { key: 'healthcare', name: 'Healthcare', icon: 'heart', tag: 'Patient care', desc: 'Patient records, appointments and practitioner dashboards.', dark: false },
  { key: 'finance', name: 'Finance', icon: 'coins', tag: 'Money', desc: 'Transactions, budgets, and category analytics with charts.', dark: false },
  { key: 'marketplace', name: 'Marketplace', icon: 'store', tag: 'Multi-vendor', desc: 'Sellers, listings, orders and simple commission tracking.', dark: false },
  { key: 'social', name: 'Social Network', icon: 'globe', tag: 'Community', desc: 'Feeds, profiles, follows and direct messaging between users.', dark: false },
  { key: 'developer-tools', name: 'Developer Tools', icon: 'terminal', tag: 'For builders', desc: 'Feature-flag console, API key management and docs area.', dark: true },
  { key: 'landing', name: 'Landing Page', icon: 'layout', tag: 'Marketing', desc: 'Hero, sections, pricing table and newsletter capture page.', dark: false },
];

export const BUILTIN_PROJECT_TYPES = {
  full: 'Full application (frontend, API, database)',
  frontend: 'Frontend only',
  api: 'API only',
};

export const PROJECT_DEFAULTS = {
  entity: 'items', pages: ['dashboard', 'items'], features: ['auth', 'search'],
};
