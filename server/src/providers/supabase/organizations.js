// supabase/organizations.js — list/create orgs via the Management API.
export async function listOrganizations(sb) {
  const orgs = await sb.get('/v1/organizations');
  return (orgs || []).map((o) => ({
    id: o.id, slug: o.slug, name: o.name,
    billing_email: o.billing_email || null,
    plan: (o.billing_email && o.name) ? null : null, // plan is not part of list payload — never invent it
    permissions: { projects_read: true, projects_write: !!(o.slug) },
  }));
}
export async function getOrganization(sb, slug) {
  const o = await sb.get('/v1/organizations/' + encodeURIComponent(slug));
  return o || null;
}
export async function createOrganization(sb, name) {
  return sb.post('/v1/organizations', { name: String(name).slice(0, 60) });
}
