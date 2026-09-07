// appwrite/databases.js — real database/collection provisioning.
export async function listDatabases(aw) {
  const r = await aw.get('/v1/databases');
  return { databases: (r.databases || []).map((d) => ({ id: d.$id, name: d.name, status: d.status })) };
}
export async function ensureDatabase(aw, { databaseId, name }) {
  const dbId = databaseId || slug(name);
  const list = await listDatabases(aw);
  if (list.databases.some((d) => d.id === dbId)) return { existing: true, databaseId: dbId };
  const d = await aw.post('/v1/databases', { databaseId: dbId, name: String(name).slice(0, 100) });
  return { created: true, databaseId: d.$id || dbId };
}
export async function ensureCollection(aw, databaseId, { collectionId, name, permissions = ['read("any")', 'write("any")'] }) {
  const cid = collectionId || slug(name);
  try {
    const r = await aw.get('/v1/databases/' + encodeURIComponent(databaseId) + '/collections/' + encodeURIComponent(cid));
    return { existing: true, collectionId: r.$id || cid };
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const c = await aw.post('/v1/databases/' + encodeURIComponent(databaseId) + '/collections', { collectionId: cid, name: String(name).slice(0, 100), permissions });
  return { created: true, collectionId: c.$id || cid };
}
export async function ensureAttribute(aw, databaseId, collectionId, { key, type = 'string', required = true, size = 255 }) {
  const ep = '/v1/databases/' + encodeURIComponent(databaseId) + '/collections/' + encodeURIComponent(collectionId) + '/attributes/' + type;
  const body = { key, required, size: type === 'string' ? (size || 255) : undefined, x: undefined };
  delete body.x;
  try { await aw.post(ep, body); return { created: true, key }; }
  catch (e) {
    if (/already exists|duplicate/i.test(String(e.message))) return { existing: true, key };
    if (e.status === 404 || /attribute.*not found|not supported/i.test(String(e.message))) {
      // boolean/integer paths on some builds use /attributes/boolean|integer — covered by `type` in URL
      throw e;
    }
    throw e;
  }
}
const slug = (s) => String(s || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'x';
