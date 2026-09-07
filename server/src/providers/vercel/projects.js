// vercel/projects.js — real project list/find/create/get against the Vercel API.
export async function listProjects(vc, { teamId } = {}) {
  const r = await vc.get('/v9/projects');
  return { projects: (r.projects || []).map((p) => pub(p)), pagination: r.pagination || null };
}
export async function getProject(vc, idOrName) {
  const p = await vc.get('/v9/projects/' + encodeURIComponent(idOrName));
  return pub(p);
}
export async function findProject(vc, name) {
  const { projects } = await listProjects(vc);
  const p = (projects || []).find((x) => x.name === name || x.id === name);
  return p || null;
}
export async function createProject(vc, { name, framework = null, buildCommand = null, outputDirectory = null, installCommand = null, env = [] }) {
  const body = { name: String(name).slice(0, 100) };
  const ps = {};
  if (framework) ps.framework = framework;
  if (buildCommand) ps.buildCommand = buildCommand;
  if (outputDirectory) ps.outputDirectory = outputDirectory;
  if (installCommand) ps.installCommand = installCommand;
  if (env.length) body.environmentVariables = env.map((e) => ({ key: e.key, value: e.value, target: Array.isArray(e.target) ? e.target : [e.target || 'production'], type: e.type || 'encrypted' }));
  if (Object.keys(ps).length) body.projectSettings = ps;
  // current documented create-project endpoint: v11 (v9 legacy accepted too)
  const p = await vc.post('/v11/projects', body).catch(async (e) => {
    if (e.status === 404 || e.status === 400 && /version/i.test(String(e.message))) return vc.post('/v9/projects', body);
    throw e;
  });
  return pub(p);
}
const pub = (p) => ({
  id: p.id, name: p.name, accountId: p.accountId, framework: p.framework || null,
  buildCommand: p.buildCommand || p.projectSettings?.buildCommand || null,
  outputDirectory: p.outputDirectory || p.projectSettings?.outputDirectory || null,
  installCommand: p.installCommand || null, updatedAt: p.updatedAt || p.updated_at || null, link: p.link || null,
  createdAt: p.createdAt, source: p.source || null,
});
