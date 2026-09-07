// appwrite/index.js — Appwrite provider facade.
import { connGet, connSecrets } from '../core.js';
import * as auth from './auth.js';
import * as organization from './organization.js';
import * as projects from './projects.js';
import * as databases from './databases.js';
import * as storage from './storage.js';
import * as functions from './functions.js';
import * as sites from './sites.js';
import { awClient } from './client.js';

export const CAPABILITIES = ['organizations', 'projects', 'sites', 'deployments', 'databases', 'storage', 'functions', 'variables', 'logs'];

export function clientFor(userId) {
  const row = connGet(userId, 'appwrite');
  if (!row || row.status !== 'connected') return null;
  const { key, console_key } = connSecrets(row);
  const cfg = safeCfg(row);
  return {
    aw: awClient({ endpoint: cfg.endpoint, project: cfg.project, key }),
    endpoint: cfg.endpoint, project: cfg.project,
    consoleKey: console_key || null,
    login: cfg.project_name || cfg.project,
  };
}
export function isConnected(userId) {
  const row = connGet(userId, 'appwrite');
  return !!(row && row.status === 'connected');
}
function safeCfg(row) { try { const c = JSON.parse(row.config || '{}'); const m = {}; for (const k of Object.keys(c)) if (!k.startsWith('enc_')) m[k] = c[k]; return m; } catch { return {}; } }

export const AppwriteProvider = {
  id: 'appwrite',
  label: 'Appwrite',
  capabilities: CAPABILITIES,
  auth, organization, projects, databases, storage, functions, sites, clientFor, isConnected,
};
export default AppwriteProvider;
