// appwrite/organization.js — org access (console credentials; project keys cannot
// read orgs and the API will say so — we surface that honestly).
import { awClient } from './client.js';
export const DEFAULT_ORG = () => process.env.APPWRITE_DEFAULT_ORGANIZATION_ID || '6a8dbe51001b87d2ed41'; // hint only — validated, never assumed

export async function listOrganizations({ endpoint, consoleKey }) {
  if (!consoleKey) return { requires_console: true, hint: 'Listing organizations needs an organization-level (console) credential — connect one, or use project-scoped credentials for project APIs.' };
  const aw = awClient({ endpoint, key: consoleKey }); // console key: no project header
  const r = await aw.get('/v1/organizations'); // real request; errors surface verbatim
  return { organizations: (r.organizations || []).map((o) => ({ id: o.$id || o.id, name: o.name, slug: o.slug || null })) };
}
