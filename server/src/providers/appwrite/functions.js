// appwrite/functions.js — real function + variable provisioning.
export async function listFunctions(aw) {
  const r = await aw.get('/v1/functions');
  return { functions: (r.functions || []).map((f) => ({ id: f.$id, name: f.name, runtime: f.runtime, status: f.status })) };
}
export async function ensureFunction(aw, { functionId, name, runtime = 'node-18.0', execute = [] }) {
  const id = functionId || slug(name);
  const list = await listFunctions(aw);
  const existing = list.functions.find((f) => f.id === id);
  if (existing) return { existing: true, functionId: id };
  const f = await aw.post('/v1/functions', { functionId: id, name: String(name).slice(0, 100), runtime, execute });
  return { created: true, functionId: f.$id || id };
}
export async function listFunctionVariables(aw, functionId) {
  const r = await aw.get('/v1/functions/' + encodeURIComponent(functionId) + '/variables');
  return { variables: (r.variables || []).map((v) => ({ id: v.$id, key: v.key })) }; // never echo values
}
export async function setFunctionVariable(aw, functionId, key, value) {
  const list = await listFunctionVariables(aw);
  const existing = list.variables.find((v) => v.key === key);
  if (existing) {
    await aw.put('/v1/functions/' + encodeURIComponent(functionId) + '/variables/' + existing.id, { key, value });
    return { updated: key };
  }
  const v = await aw.post('/v1/functions/' + encodeURIComponent(functionId) + '/variables', { key, value });
  return { created: key, id: v.$id };
}
const slug = (s) => String(s || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'x';
