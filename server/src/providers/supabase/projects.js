// supabase/projects.js — real project provisioning + info + API keys.
export async function listProjects(sb) {
  const ps = await sb.get('/v1/projects');
  return (ps || []).map((p) => ({
    ref: p.ref, name: p.name, organization_id: p.organization_id, region: p.region,
    status: p.status, created_at: p.created_at, database_host: p.database && p.database.host,
    db_port: p.database && p.database.port,
  }));
}
export async function getProject(sb, ref) {
  const p = await sb.get('/v1/projects/' + encodeURIComponent(ref));
  return p && {
    ref: p.ref, name: p.name, organization_id: p.organization_id, region: p.region,
    status: p.status, created_at: p.created_at,
    database: p.database ? { host: p.database.host, port: p.database.port, version: p.database.major_version || p.database.version || null } : null,
  };
}
// Region: user picks a real region code; newer API prefers smart groups. We send the
// documented smartGroup body and fall back to the legacy `region` field on rejection.
export async function createProject(sb, { name, organizationSlug, dbPass, region = 'ap-south-1', size = 'micro' }) {
  const body = { name: String(name).slice(0, 60), organization_slug: organizationSlug, db_pass: dbPass, desired_instance_size: size };
  try {
    return pub(await sb.post('/v1/projects', { ...body, region_selection: { type: 'smartGroup', code: regionToSmart(region) } }));
  } catch (e) {
    if (e.code === 'VALIDATION' || e.status === 400) {
      // fall back to the classic payload — legacy `region` field
      return pub(await sb.post('/v1/projects', body));
    }
    throw e;
  }
}
function regionToSmart(r) {
  if (['americas', 'apac', 'emea'].includes(r)) return r;
  if (/^us|^ca|^sa|^br/.test(r)) return 'americas';
  if (/^ap|^in|^jp|^kr|^au|^sg/.test(r)) return 'apac';
  return 'emea';
}
const pub = (p) => ({ ref: p.ref, name: p.name, organization_id: p.organization_id, region: p.region, status: p.status || 'COMING_UP', created_at: p.created_at });
export async function apiKeys(sb, ref) {
  const keys = await sb.get('/v1/projects/' + encodeURIComponent(ref) + '/api-keys');
  // returns [{name, api_key, ...}] — names may be legacy (anon/service_role) or new (publishable/secret)
  const find = (names) => { const k = (keys || []).find((x) => names.includes(String(x.name || '').toLowerCase())); return k ? k.api_key : null; };
  return {
    anon: find(['anon', 'publishable']),
    serviceRole: find(['service_role', 'secret']),
    raw: (keys || []).map((k) => ({ name: k.name, masked: k.api_key ? k.api_key.slice(0, 6) + '…' : null })),
  };
}
