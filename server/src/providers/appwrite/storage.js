// appwrite/storage.js — real bucket provisioning.
export async function listBuckets(aw) {
  const r = await aw.get('/v1/storage/buckets');
  return { buckets: (r.buckets || []).map((b) => ({ id: b.$id, name: b.name, enabled: !!b.enabled })) };
}
export async function ensureBucket(aw, { bucketId, name, fileSecurity = false, enabled = true, permission = 'bucket' }) {
  const id = bucketId || slug(name);
  const list = await listBuckets(aw);
  if (list.buckets.some((b) => b.id === id)) return { existing: true, bucketId: id };
  const b = await aw.post('/v1/storage/buckets', {
    bucketId: id, name: String(name).slice(0, 100), fileSecurity, enabled,
    maximumFileSize: 10485760, allowedFileExtensions: [], compression: 'none', encryption: true, antivirus: true,
  });
  return { created: true, bucketId: b.$id || id };
}
const slug = (s) => String(s || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'x';
