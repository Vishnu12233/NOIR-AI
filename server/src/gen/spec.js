// spec.js — NOIR requirement → concrete application specification.
// Deterministic, offline architecture engine: tables, fields, features, nav,
// routes and seed content are derived here from the analyzed request.
import { F } from './schema.js';

const title = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const plural = (s) => (s.endsWith('s') ? s : s + 's');

const ENTS = {
  users: { table: 'users', label: 'User', fields: [F('email', null, { type: 'email', unique: true }), F('name'), F('password_hash', null, { private: true, hidden: true }), F('role', null, { options: ['user', 'admin'] }), F('verified', null, { hidden: true })], search: ['name', 'email'], guarded: true, client: 'admin' },
  leads: { table: 'leads', label: 'Lead', fields: [F('name', null, { required: true }), F('email', null, { type: 'email' }), F('company'), F('value', 'Value (USD)', { type: 'number', money: true }), F('status', null, { options: ['new', 'contacted', 'qualified', 'won', 'lost'] })], search: ['name', 'email', 'company'] },
  customers: { table: 'customers', label: 'Customer', fields: [F('name', null, { required: true }), F('email', null, { type: 'email' }), F('company'), F('plan', null, { options: ['Free', 'Starter', 'Pro', 'Enterprise'] }), F('status', null, { options: ['active', 'trial', 'past_due', 'cancelled'] }), F('mrr', 'MRR (USD)', { type: 'number', money: true })], search: ['name', 'email', 'company'] },
  products: { table: 'products', label: 'Product', fields: [F('name', null, { required: true }), F('price', 'Price (USD)', { type: 'number', money: true, required: true }), F('category'), F('stock', null, { type: 'number' }), F('image_emoji', 'Emoji'), F('status', null, { options: ['active', 'draft', 'archived'] })], search: ['name', 'category'] },
  orders: { table: 'orders', label: 'Order', fields: [F('items', null, { hidden: true }), F('total', 'Total (USD)', { type: 'number', money: true }), F('status', null, { options: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'] }), F('user_id', null, { hidden: true })], search: ['status'], client: 'admin' },
  posts: { table: 'posts', label: 'Post', fields: [F('author'), F('title', null, { required: true }), F('body', null, { type: 'multiline' }), F('category'), F('likes', null, { type: 'number' }), F('status', null, { options: ['published', 'draft'], hidden: true })], search: ['title', 'body', 'author'] },
  comments: { table: 'comments', label: 'Comment', fields: [F('post_id', null, { hidden: true }), F('author'), F('body', null, { type: 'multiline', required: true })], search: ['author', 'body'], client: false },
  threads: { table: 'threads', label: 'Thread', fields: [F('title', null, { required: true }), F('body', null, { type: 'multiline' }), F('author'), F('category')], search: ['title', 'body', 'author'] },
  courses: { table: 'courses', label: 'Course', fields: [F('title', null, { required: true }), F('level', null, { options: ['Beginner', 'Intermediate', 'Advanced'] }), F('instructor'), F('lessons', null, { type: 'number' }), F('status', null, { options: ['draft', 'published', 'archived'] })], search: ['title', 'instructor'] },
  enrollments: { table: 'enrollments', label: 'Enrollment', fields: [F('student'), F('course', null, { required: true }), F('progress', 'Progress %', { type: 'number' }), F('status', null, { options: ['active', 'completed', 'dropped'] })], search: ['student', 'course'] },
  patients: { table: 'patients', label: 'Patient', fields: [F('name', null, { required: true }), F('email', null, { type: 'email' }), F('phone'), F('diagnosis'), F('status', null, { options: ['active', 'waiting', 'discharged'] })], search: ['name', 'email', 'diagnosis'] },
  appointments: { table: 'appointments', label: 'Appointment', fields: [F('patient', null, { required: true }), F('at', 'Scheduled at', { type: 'datetime' }), F('doctor'), F('reason', null, { type: 'multiline' }), F('status', null, { options: ['booked', 'completed', 'cancelled', 'no_show'] })], search: ['patient', 'doctor'] },
  transactions: { table: 'transactions', label: 'Transaction', fields: [F('title', null, { required: true }), F('amount', 'Amount (USD)', { type: 'number', money: true }), F('category', null, { options: ['income', 'housing', 'food', 'transport', 'health', 'leisure', 'savings', 'other'] }), F('occurred_at', 'Date', { type: 'date' })], search: ['title', 'category'] },
  budgets: { table: 'budgets', label: 'Budget', fields: [F('category', null, { options: ['housing', 'food', 'transport', 'health', 'leisure', 'savings', 'other'] }), F('limit', 'Limit (USD)', { type: 'number', money: true }), F('spent', 'Spent (USD)', { type: 'number', money: true })], search: ['category'] },
  chatmsgs: { table: 'messages', label: 'Message', fields: [F('user_id', null, { hidden: true }), F('role', null, { options: ['user', 'assistant'] }), F('content', null, { type: 'multiline' })], search: ['content'], client: false },
  employees: { table: 'employees', label: 'Employee', fields: [F('name', null, { required: true }), F('email', null, { type: 'email' }), F('department'), F('position'), F('salary', 'Salary (USD)', { type: 'number', money: true }), F('status', null, { options: ['active', 'on_leave', 'terminated'] })], search: ['name', 'email', 'department'] },
  inventory: { table: 'inventory', label: 'Item', fields: [F('name', null, { required: true }), F('sku'), F('category'), F('stock', null, { type: 'number' }), F('reorder_at', 'Reorder level', { type: 'number' }), F('price', 'Price (USD)', { type: 'number', money: true })], search: ['name', 'sku', 'category'] },
  portfolio_p: { table: 'projects', label: 'Project', fields: [F('name', null, { required: true }), F('description', null, { type: 'multiline' }), F('url'), F('emoji'), F('status', null, { options: ['in_progress', 'completed', 'archived'] })], search: ['name', 'description'] },
  uploads: { table: 'files', label: 'File', fields: [F('name', null, { required: true }), F('size', null, { type: 'number' }), F('user_id', null, { hidden: true }), F('stored_name', null, { private: true, hidden: true })], search: ['name'], client: false },
  events: { table: 'events', label: 'Event', fields: [F('name', null, { required: true }), F('category'), F('value', null, { type: 'number' }), F('occurred_at', 'Date', { type: 'date' })], search: ['name', 'category'] },
  features: { table: 'features', label: 'Feature', fields: [F('title', null, { required: true }), F('description', null, { type: 'multiline' }), F('status', null, { options: ['planned', 'in_progress', 'launched'] })], search: ['title', 'description'] },
  documents: { table: 'documents', label: 'Document', fields: [F('title', null, { required: true }), F('body', null, { type: 'multiline' }), F('status', null, { options: ['draft', 'published'] })], search: ['title', 'body'] },
  metrics: { table: 'metrics', label: 'Metric', fields: [F('name', null, { required: true }), F('value', null, { type: 'number' }), F('unit'), F('period', null, { options: ['daily', 'weekly', 'monthly'] })], search: ['name'] },
  articles: { table: 'articles', label: 'Article', fields: [F('title', null, { required: true }), F('category'), F('excerpt'), F('body', null, { type: 'multiline' }), F('status', null, { options: ['draft', 'published'] })], search: ['title', 'category'] },
  listings: { table: 'listings', label: 'Listing', fields: [F('title', null, { required: true }), F('price', 'Price (USD)', { type: 'number', money: true }), F('seller'), F('category'), F('status', null, { options: ['active', 'sold', 'paused'] })], search: ['title', 'seller', 'category'] },
  plans: { table: 'plans', label: 'Plan', fields: [F('name', null, { required: true }), F('price', 'Price (USD)', { type: 'number', money: true }), F('interval', null, { options: ['month', 'year'] }), F('highlights')], search: ['name'] },
  subscriptions: { table: 'subscriptions', label: 'Subscription', fields: [F('user_id', null, { hidden: true }), F('plan'), F('status', null, { options: ['active', 'trialing', 'past_due', 'canceled'] }), F('renews_at', 'Renews', { type: 'date' })], search: ['plan'] },
  invoices: { table: 'invoices', label: 'Invoice', fields: [F('number'), F('user_id', null, { hidden: true }), F('total', 'Total (USD)', { type: 'number', money: true }), F('status', null, { options: ['draft', 'open', 'paid', 'void'] })], search: ['number'] },
  subscribers: { table: 'subscribers', label: 'Subscriber', fields: [F('email', null, { type: 'email', unique: true })], search: ['email'] },
  bookings: { table: 'bookings', label: 'Booking', fields: [F('name', null, { required: true }), F('email', null, { type: 'email' }), F('service'), F('at', 'Date & time', { type: 'datetime' }), F('notes', null, { type: 'multiline' }), F('status', null, { options: ['requested', 'confirmed', 'cancelled'] })], search: ['name', 'email', 'service'] },
  inquiries: { table: 'inquiries', label: 'Inquiry', fields: [F('name'), F('email', null, { type: 'email' }), F('company'), F('message', null, { type: 'multiline' }), F('status', null, { options: ['new', 'contacted', 'closed'] })], search: ['name', 'email', 'company'] },
  tasks: { table: 'tasks', label: 'Task', fields: [F('title', null, { required: true }), F('assignee'), F('due', null, { type: 'date' }), F('status', null, { options: ['todo', 'in_progress', 'done'] })], search: ['title', 'assignee'] },
  reminders: { table: 'reminders', label: 'Reminder', fields: [F('title', null, { required: true }), F('at', null, { type: 'datetime' }), F('notes', null, { type: 'multiline' }), F('status', null, { options: ['pending', 'done'] })], search: ['title'] },
  students: { table: 'students', label: 'Student', fields: [F('name', null, { required: true }), F('email', null, { type: 'email' }), F('grade'), F('guardian'), F('status', null, { options: ['active', 'inactive'] })], search: ['name', 'email'] },
  videos: { table: 'videos', label: 'Video', fields: [F('title', null, { required: true }), F('channel'), F('length_sec', 'Length (s)', { type: 'number' }), F('views', null, { type: 'number' }), F('status', null, { options: ['published', 'private'] })], search: ['title', 'channel'] },
};

// Word → entity mapping for the analyzer
const SYN = {
  customers: ['customer', 'client', 'account', 'saas', 'b2b', 'subscription base'],
  leads: ['lead', 'deal', 'prospect', 'crm', 'pipeline', 'sales'],
  products: ['product', 'catalog', 'ecommerce', 'store', 'shop', 'inventory item'],
  posts: ['social', 'post', 'timeline', 'feed', 'community'],
  threads: ['forum', 'thread', 'discussion'],
  articles: ['blog', 'article', 'news', 'magazine'],
  courses: ['course', 'training', 'lms', 'academy'],
  students: ['student', 'school', 'college', 'university', 'education'],
  patients: ['patient', 'clinic', 'hospital', 'health'],
  appointments: ['appointment', 'booking', 'schedule'],
  bookings: ['booking service', 'reservation', 'calendar booking'],
  transactions: ['expense', 'finance', 'money', 'transaction', 'ledger', 'budget app', 'spend'],
  employees: ['employee', 'staff', 'hr', 'workforce'],
  inventory: ['warehouse', 'inventory', 'stock management', 'supply'],
  documents: ['document', 'note app', 'wiki', 'knowledge', 'writing'],
  chatmsgs: ['chat', 'conversation', 'messaging', 'assistant history'],
  videos: ['video', 'channel', 'streaming'],
  projects: ['project management', 'kanban', 'todo', 'task app'],
  metrics: ['metric', 'analytics dashboard', 'kpi'],
  events: ['event analytics', 'tracking', 'telemetry'],
  portfolio_p: ['portfolio', 'showcase'],
  listings: ['marketplace', 'listing', 'classified'],
  inquiries: ['contact form', 'inquiry', 'crm inquiry', 'landing lead'],
  subscribers: ['newsletter', 'subscriber', 'mailing'],
  plans: ['pricing', 'plans', 'subscription plans'],
};

export function detectEntity(text) {
  const t = String(text || '').toLowerCase();
  for (const [key, syns] of Object.entries(SYN)) {
    if (syns.some((s) => t.includes(s))) return key;
  }
  return null;
}

const FEATURE_EXTRA_TABLES = {
  payments: () => ['plans', 'subscriptions', 'invoices'],
  ai_chat: () => ['chatmsgs'],
  uploads: () => ['uploads'],
  comments: () => ['comments'],
  email: () => ['inquiries'],
};
const CATEGORY_NAMES = {
  saas: 'SaaS', crm: 'CRM', ecommerce: 'E-commerce', ai_app: 'AI application', dashboard: 'Dashboard', portfolio: 'Portfolio', blog: 'Blog', education: 'Education', healthcare: 'Healthcare', finance: 'Finance', marketplace: 'Marketplace', social: 'Social network', forum: 'Forum/community', devtools: 'Developer tool', analytics: 'Analytics', erp: 'ERP', landing: 'Landing page', news: 'News/blog', chatbot: 'AI chatbot', booking: 'Booking', general: 'Application',
};

/** Compile analyzed requirement into a full generation spec. */
export function compileSpec({
  name, tagline, category = 'general', entityKey = null, features = [], users = 'public', withSeed = true, theme = 'graphite', light = false,
}) {
  const fset = new Set(features);
  const auth = fset.has('auth');
  const tables = [];
  const extras = [];
  const push = (k) => { const def = ENTS[k]; if (def && !extras.includes(k)) extras.push(k); };

  if (auth) push('users');

  // main entity per category unless resolved by entity words
  const ALIAS = { projects: 'tasks', messages: 'chatmsgs', files: 'uploads', portfolio: 'portfolio_p', contacts: 'customers', deals: 'leads', cases: 'patients', tickets: 'features', suppliers: 'inventory', departments: 'employees', clients: 'customers', reviews: 'comments', projects_portfolio: 'portfolio_p' };
  let mainKey = (entityKey && ENTS[entityKey] && entityKey) || (entityKey && ALIAS[entityKey]) || CAT_MAIN[category] || 'customers';
  push(mainKey);
  if (category === 'landing') push('subscribers');

  for (const f of ['payments', 'ai_chat', 'uploads', 'comments', 'email']) if (fset.has(f)) (FEATURE_EXTRA_TABLES[f]().forEach(push) || null);

  if (fset.has('notifications')) tables; // notification rows are app-driven; skip static table when not needed

  // build table defs with client flags
  for (const k of extras) {
    const d = ENTS[k];
    const t = { ...d, fields: d.fields.map((f) => ({ ...f })) };
    t.main = k === mainKey;
    tables.push(t);
  }
  // ensure users first when auth (FK-less anyway), main entity table right after users
  if (auth) {
    tables.sort((a, b) => (a.table === 'users' ? -1 : b.table === 'users' ? 1 : 0));
  }
  const main = tables.find((t) => t.main) || tables[tables.length ? tables.length - 1 : 0];

  // ---- seeds ----
  const seed = {};
  const tableOf = (k) => (ENTS[k] || { table: k }).table;
  if (main) {
    const s = SEEDERS[main.table] && SEEDERS[main.table]();
    if (s) seed[main.table] = s;
  }
  for (const k of extras) {
    const tn = tableOf(k);
    if (tn === 'users') continue;
    if (seed[tn]) continue;
    const s = SEEDERS[tn] && SEEDERS[tn]();
    if (s) seed[tn] = s;
  }
  if (auth && !seed.users) seed.users = seedUsers;

  // ---- nav ----
  const nav = [];
  const icon = CAT_ICON[category] || '🚀';
  nav.push({ path: '/', label: 'Overview', icon: '🏠', route: 'home', auth: false });
  if (CAT_PAGES[category]) for (const pg of CAT_PAGES[category]) {
    if (pg === 'board') nav.push({ path: '/board', label: 'Board', icon: '📋', route: 'kanban' });
    if (pg === 'feed') nav.push({ path: '/feed', label: category === 'blog' || category === 'news' ? 'Articles' : 'Feed', icon: category === 'blog' || category === 'news' ? '📰' : '💬', route: 'feed' });
    if (pg === 'shop') nav.push({ path: '/shop', label: 'Shop', icon: '🛍️', route: 'shop', auth: false });
    if (pg === 'chat') nav.push({ path: '/chat', label: 'Assistant', icon: '🤖', route: 'chat' });
    if (pg === 'cart') nav.push({ path: '/cart', label: 'Cart', icon: '🛒', route: 'cart', auth: false });
    if (pg === 'portfolio') nav.push({ path: '/portfolio', label: 'Work', icon: '✨', route: 'portfolio', auth: false });
    if (pg === 'landing') nav.push({ path: '/', label: 'Home', icon: '🏠', route: 'home', auth: false });
  }
  if (main && main.client !== 'admin' && main.client !== false) {
    const lab = pluralish(main.label);
    if (!nav.some((x) => x.label === lab)) nav.push({ path: '/table/' + main.table, label: lab, icon, route: 'crud' });
  }
  if (auth) nav.push({ path: '/settings', label: 'Settings', icon: '⚙️', route: 'settings' });
  if (auth && main.table !== 'users') nav.push({ path: '/admin', label: 'Admin', icon: '🛡️', role: 'admin', route: 'admin' });

  const routes = ['home'];
  return {
    name: name || 'My App',
    tagline: tagline || (CATEGORY_NAMES[category] + ' app'),
    brand: name || 'My App',
    category: CATEGORY_NAMES[category] || 'Application',
    category_key: category,
    auth,
    seed_enabled: !!withSeed, seed: withSeed ? seed : {},
    users: users,
    landing: category === 'landing',
    features: [...fset].filter((f) => f !== 'auth'),
    pages: CAT_PAGES[category] || ['items'],
    tables: tables.map((t) => ({ table: t.table, label: t.label, fields: t.fields, search: t.search, guarded: !!t.guarded, client: t.client === undefined ? (t.guarded ? 'admin' : t.main ? true : true) : t.client, main: t.main })),
    main: main ? main.table : 'items',
    nav,
    routes,
    default_theme: light ? 'light' : 'dark',
    theme_key: theme,
    _compiled: true,
  };
}

const pluralish = (label) => { const t = plural(label); return t[0].toUpperCase() + t.slice(1); };

const CAT_MAIN = {
  saas: 'customers', crm: 'leads', ecommerce: 'products', marketplace: 'listings', blog: 'articles', news: 'articles',
  ai_app: 'documents', chatbot: 'documents', dashboard: 'metrics', analytics: 'events', education: 'courses',
  healthcare: 'patients', finance: 'transactions', social: 'posts', forum: 'threads', erp: 'inventory',
  devtools: 'features', portfolio: 'portfolio_p', landing: 'inquiries', booking: 'bookings', general: 'customers',
};
const CAT_ICON = {
  saas: '📊', crm: '🤝', ecommerce: '🛍️', ai_app: '🤖', dashboard: '📈', portfolio: '✨', blog: '📝', education: '🎓',
  healthcare: '🩺', finance: '💰', marketplace: '🏪', social: '👥', forum: '🗨️', devtools: '🧰', analytics: '📉',
  erp: '🏭', landing: '🚀', news: '📰', chatbot: '💬', booking: '📅', general: '🚀',
};
const CAT_PAGES = {
  saas: ['dashboard', 'billing'], crm: ['board'], ecommerce: ['shop', 'cart'], marketplace: ['shop', 'cart'], blog: ['feed'], news: ['feed'],
  ai_app: ['chat'], chatbot: ['chat'], dashboard: [], analytics: [], education: [], healthcare: [], finance: [],
  social: ['feed'], forum: ['feed'], devtools: ['board'], erp: ['board'], portfolio: ['portfolio'], landing: ['landing'], booking: ['board'], general: [],
};

// ---------------- seeds ----------------
const now = Date.now();
const d = (daysAgo) => new Date(now - daysAgo * 864e5).toISOString().slice(0, 10);
import crypto from 'node:crypto';
const sha = (s) => crypto.createHash('sha256').update('noir::' + s).digest('hex');
const pbkdf = (pw, salt) => crypto.pbkdf2Sync(pw, salt, 100000, 32, 'sha256').toString('hex');
// demo accounts: password "demo123" (documented in README, dev-only). Salt is deterministic
// so rebuilds produce identical seed files; hashing itself is salted PBKDF2 like the runtime.
const seedUsers = [
  { email: 'ava@noir.app', name: 'Ava Chen', role: 'admin', verified: 'yes', password_hash: 'pbkdf2$' + sha('ava@noir.app').slice(0, 16) + '$' + pbkdf('demo123', sha('ava@noir.app').slice(0, 16)) },
  { email: 'noah@noir.app', name: 'Noah Patel', role: 'user', verified: 'yes', password_hash: 'pbkdf2$' + sha('noah@noir.app').slice(0, 16) + '$' + pbkdf('demo123', sha('noah@noir.app').slice(0, 16)) },
];
const SEEDERS = {
  users: () => seedUsers,
  leads: () => [
    { name: 'Maya Rodriguez', email: 'maya@northwind.co', company: 'Northwind', value: 24000, status: 'qualified' },
    { name: 'Kenji Watanabe', email: 'kenji@tokyotech.jp', company: 'Tokyo Tech', value: 12000, status: 'contacted' },
    { name: 'Priya Sharma', email: 'priya@brightlabs.io', company: 'Bright Labs', value: 48000, status: 'new' },
    { name: 'Liam O Connor', email: 'liam@fernhill.ie', company: 'Fernhill', value: 8500, status: 'won' },
    { name: 'Zoe Martin', email: 'zoe@petal.studio', company: 'Petal Studio', value: 3000, status: 'lost' },
  ],
  customers: () => [
    { name: 'Acme Corp', email: 'billing@acme.com', company: 'Acme', plan: 'Pro', status: 'active', mrr: 149 },
    { name: 'Globex Inc', email: 'ops@globex.io', company: 'Globex', plan: 'Enterprise', status: 'active', mrr: 990 },
    { name: 'Initech', email: 'finance@initech.com', company: 'Initech', plan: 'Starter', status: 'trial', mrr: 0 },
    { name: 'Umbrella Ltd', email: 'hello@umbrella.example', company: 'Umbrella', plan: 'Free', status: 'past_due', mrr: 0 },
    { name: 'Hooli', email: 'sales@hooli.example', company: 'Hooli', plan: 'Pro', status: 'cancelled', mrr: 0 },
  ],
  products: () => [
    { name: 'Aurora Desk Lamp', price: 49, category: 'Home', stock: 42, image_emoji: '🛋️', status: 'active' },
    { name: 'Pulse Headphones', price: 129, category: 'Audio', stock: 18, image_emoji: '🎧', status: 'active' },
    { name: 'Nimbus Sneakers', price: 89, category: 'Apparel', stock: 0, image_emoji: '👟', status: 'draft' },
    { name: 'Echo Keyboard', price: 159, category: 'Tech', stock: 8, image_emoji: '⌨️', status: 'active' },
    { name: 'Lumen Water Bottle', price: 24, category: 'Lifestyle', stock: 120, image_emoji: '🍶', status: 'active' },
  ],
  orders: () => [
    { items: '[{"name":"Pulse Headphones","qty":1,"price":129}]', total: 129, status: 'paid', user_id: '' },
    { items: '[{"name":"Aurora Desk Lamp","qty":2,"price":49}]', total: 98, status: 'pending', user_id: '' },
    { items: '[{"name":"Echo Keyboard","qty":1,"price":159}]', total: 159, status: 'delivered', user_id: '' },
  ],
  posts: () => [
    { author: 'Ava Chen', title: 'Shipping our first release 🎉', body: 'After three months of building, NOIR projects are live. The team did an incredible job — go check the changelog!', category: 'announcement', likes: 24, status: 'published' },
    { author: 'Noah Patel', title: 'How we cut page loads by 60%', body: 'Code splitting, route prefetching and a ruthless audit of render blockers. Numbers below 👇', category: 'engineering', likes: 41, status: 'published' },
    { author: 'Maya R.', title: 'Design tokens at scale', body: 'A short write-up on how we keep 40+ components consistent across two themes.', category: 'design', likes: 17, status: 'published' },
    { author: 'Kenji W.', title: 'Draft: hiring a platform engineer', body: 'Looking for someone to own our preview sandboxes. More soon.', category: 'team', likes: 0, status: 'draft' },
  ],
  comments: () => [
    { post_id: 1, author: 'Priya', body: 'Congrats! The preview sandbox is slick.' },
    { post_id: 2, author: 'Liam', body: 'Would love the full breakdown.' },
  ],
  threads: () => [
    { title: 'Best practices for SQLite in production?', body: 'We are hitting write contention on our file DB. Anyone running WAL with better-sqlite3 at scale?', author: 'Priya', category: 'backend' },
    { title: 'Show HN: tiny UI kit I open sourced', body: 'Felt right to share here first. Feedback welcome!', author: 'Liam', category: 'showcase' },
    { title: 'What does your CI pipeline look like?', body: 'Comparing notes on build vs test ordering.', author: 'Zoe', category: 'devops' },
  ],
  articles: () => [
    { title: 'The quiet return of boring architecture', category: 'engineering', excerpt: 'Sometimes the best stack is the one you already know.', body: 'Long-form content goes here. Every article in this blog is stored in the app database and manageable from the admin area.', status: 'published' },
    { title: 'Designing for dark mode first', category: 'design', excerpt: 'Dark-first interfaces change how you think about elevation.', body: 'In this post we walk through elevation, contrast and accent discipline.', status: 'published' },
    { title: 'Roadmap: what ships next quarter', category: 'product', excerpt: 'A transparent look at the next 90 days.', body: 'Draft content.', status: 'draft' },
  ],
  courses: () => [
    { title: 'Intro to TypeScript', level: 'Beginner', instructor: 'Ava Chen', lessons: 24, status: 'published' },
    { title: 'PostgreSQL performance', level: 'Advanced', instructor: 'Noah Patel', lessons: 16, status: 'published' },
    { title: 'Design systems 101', level: 'Intermediate', instructor: 'Maya R.', lessons: 12, status: 'draft' },
  ],
  enrollments: () => [
    { student: 'Priya', course: 'PostgreSQL performance', progress: 55, status: 'active' },
    { student: 'Liam', course: 'Intro to TypeScript', progress: 100, status: 'completed' },
  ],
  patients: () => [
    { name: 'Eleanor Vance', email: 'e.vance@example.com', phone: '555-0102', diagnosis: 'Hypertension', status: 'active' },
    { name: 'Omar Haddad', email: 'omar@example.com', phone: '555-0119', diagnosis: 'Asthma', status: 'active' },
    { name: 'June Park', email: 'june@example.com', phone: '555-0134', diagnosis: 'Routine checkup', status: 'discharged' },
  ],
  appointments: () => [
    { patient: 'Eleanor Vance', at: new Date(now + 864e5).toISOString(), doctor: 'Dr. Reyes', reason: 'Blood pressure review', status: 'booked' },
    { patient: 'Omar Haddad', at: new Date(now + 2 * 864e5).toISOString(), doctor: 'Dr. Reyes', reason: 'Inhaler check', status: 'booked' },
  ],
  transactions: () => [
    { title: 'Invoice — Client work', amount: 3200, category: 'income', occurred_at: d(2) },
    { title: 'Rent', amount: -1400, category: 'housing', occurred_at: d(3) },
    { title: 'Groceries', amount: -210, category: 'food', occurred_at: d(4) },
    { title: 'Metro card', amount: -45, category: 'transport', occurred_at: d(5) },
    { title: 'Consulting retainer', amount: 1800, category: 'income', occurred_at: d(9) },
    { title: 'Dinner out', amount: -86, category: 'food', occurred_at: d(10) },
  ],
  budgets: () => [
    { category: 'housing', limit: 1500, spent: 1400 },
    { category: 'food', limit: 500, spent: 296 },
    { category: 'transport', limit: 200, spent: 91 },
    { category: 'leisure', limit: 300, spent: 356 },
  ],
  messages: () => [
    { role: 'assistant', content: 'Hi! I am your assistant inside this app. Connect an AI provider key in NOIR → Environment and I will answer with real model output.', user_id: '' },
  ],
  employees: () => [
    { name: 'Ava Chen', email: 'ava@corp.example', department: 'Engineering', position: 'CTO', salary: 210000, status: 'active' },
    { name: 'Noah Patel', email: 'noah@corp.example', department: 'Engineering', position: 'Staff Engineer', salary: 185000, status: 'active' },
    { name: 'Maya R.', email: 'maya@corp.example', department: 'Design', position: 'Design Lead', salary: 160000, status: 'active' },
    { name: 'Kenji W.', email: 'kenji@corp.example', department: 'Operations', position: 'Ops Manager', salary: 120000, status: 'on_leave' },
  ],
  inventory: () => [
    { name: 'Widget A-1', sku: 'WDG-A1', category: 'components', stock: 320, reorder_at: 50, price: 3.5 },
    { name: 'Bracket B-2', sku: 'BRK-B2', category: 'components', stock: 12, reorder_at: 40, price: 8 },
    { name: 'Cable C-3', sku: 'CBL-C3', category: 'cables', stock: 900, reorder_at: 100, price: 1.2 },
  ],
  projects: () => [
    { name: 'Aurora Analytics', description: 'Realtime product analytics for indie SaaS. Built with NOIR.', url: '', emoji: '📈', status: 'completed' },
    { name: 'Fern & Flora', description: 'Plant care companion with watering schedules and photo journals.', emoji: '🌿', status: 'completed' },
    { name: 'Midnight Reader', description: 'Distraction-free reading app with typography at the center.', emoji: '📚', status: 'in_progress' },
  ],
  files: () => [],
  events: () => {
    const rows = [];
    const names = ['Page view', 'Signup', 'Click', 'Purchase', 'Page view', 'Signup', 'Click', 'Purchase'];
    for (let i = 0; i < 30; i++) rows.push({ name: names[i % names.length], category: i % 4 === 3 ? 'revenue' : 'engagement', value: (i * 7) % 61, occurred_at: d(i % 14) });
    return rows;
  },
  features: () => [
    { title: 'Global search', description: 'Search across all records from one box.', status: 'launched' },
    { title: 'Team workspaces', description: 'Invite collaborators and share projects.', status: 'in_progress' },
    { title: 'Offline mode', description: 'Queue writes when the network drops.', status: 'planned' },
  ],
  documents: () => [
    { title: 'Welcome to ' , body: 'This is your assistant app home. Ask it anything; it uses the AI provider you connect in NOIR.', status: 'published' },
    { title: 'How to connect an AI provider', body: 'Open NOIR → Environment and add OPENAI_API_KEY (or another provider key) to this project, then restart the app.', status: 'published' },
  ],
  metrics: () => [
    { name: 'Active users', value: 12840, unit: 'users', period: 'weekly' },
    { name: 'Conversion rate', value: 3.2, unit: '%', period: 'weekly' },
    { name: 'NPS', value: 54, unit: 'score', period: 'monthly' },
  ],
  listings: () => [
    { title: 'Vintage film camera', price: 240, seller: 'Priya', category: 'cameras', status: 'active' },
    { title: 'Oak desk, 140cm', price: 180, seller: 'Liam', category: 'furniture', status: 'active' },
    { title: 'Mechanical keyboard', price: 95, seller: 'Zoe', category: 'electronics', status: 'sold' },
  ],
  plans: () => [
    { name: 'Starter', price: 9, interval: 'month', highlights: '3 projects · community support' },
    { name: 'Pro', price: 29, interval: 'month', highlights: 'Unlimited projects · preview sandboxes · priority support' },
    { name: 'Enterprise', price: 99, interval: 'month', highlights: 'SSO · audit log · dedicated queue' },
  ],
  subscriptions: () => [
    { plan: 'Pro', status: 'active', renews_at: d(-21) },
  ],
  invoices: () => [
    { number: 'INV-2024-001', total: 29, status: 'paid' },
    { number: 'INV-2024-002', total: 29, status: 'open' },
  ],
  subscribers: () => [
    { email: 'reader@example.com' }, { email: 'friend@example.org' },
  ],
  bookings: () => [
    { name: 'Rina Sato', email: 'rina@example.com', service: 'Consultation', at: new Date(now + 3 * 864e5).toISOString(), notes: '', status: 'confirmed' },
    { name: 'Tom Becker', email: 'tom@example.com', service: 'Strategy session', at: new Date(now + 5 * 864e5).toISOString(), notes: '', status: 'requested' },
  ],
  inquiries: () => [
    { name: 'Stella', email: 'stella@acme.example', company: 'Acme', message: 'Tell me more about pricing for a team of 20.', status: 'new' },
    { name: 'Dario', email: 'dario@globex.example', company: 'Globex', message: 'Interested in a demo for our ops team.', status: 'contacted' },
  ],
  tasks: () => [
    { title: 'Write launch post', assignee: 'Ava', due: d(-1), status: 'done' },
    { title: 'Fix preview iframe sizing', assignee: 'Noah', due: d(1), status: 'in_progress' },
    { title: 'Migrate billing to new provider', assignee: 'Maya', due: d(4), status: 'todo' },
  ],
  reminders: () => [
    { title: 'Quarterly review', at: new Date(now + 864e5).toISOString(), status: 'pending' },
  ],
  students: () => [
    { name: 'Arjun Nair', email: 'arjun@school.example', grade: '10-A', guardian: 'Mrs. Nair', status: 'active' },
    { name: 'Diya Raman', email: 'diya@school.example', grade: '11-B', guardian: 'Mr. Raman', status: 'active' },
  ],
  videos: () => [
    { title: 'Building a dashboard in 10 minutes', channel: 'NOIR Tutorials', length_sec: 612, views: 4821, status: 'published' },
    { title: 'Dark mode done right', channel: 'UI Lab', length_sec: 380, views: 1120, status: 'published' },
  ],
};
