// supabase/index.js — Supabase provider facade.
import { connGet, connSecrets } from '../core.js';
import * as auth from './auth.js';
import * as oauth from './oauth.js';
import * as organizations from './organizations.js';
import * as projects from './projects.js';
import * as database from './database.js';
import { sbClient } from './client.js';

export const CAPABILITIES = ['organizations', 'projects', 'database', 'migrations', 'authentication', 'storage', 'functions', 'configuration'];

export function clientFor(userId) {
  const row = connGet(userId, 'supabase');
  if (!row || row.status !== 'connected') return null;
  const { token } = connSecrets(row);
  return { sb: sbClient(token), isOauth: !!(JSON.parse(row.config || '{}').oauth) };
}
export function isConnected(userId) {
  const row = connGet(userId, 'supabase');
  return !!(row && row.status === 'connected');
}
export const SupabaseProvider = {
  id: 'supabase',
  label: 'Supabase',
  capabilities: CAPABILITIES,
  auth, oauth, organizations, projects, database, clientFor, isConnected,
};
export default SupabaseProvider;
