// Fake GitHub API for local end-to-end verification of NOIR's GitHub integration.
// Implements just enough of api.github.com: GET /user, GET /repos/{o}/{r}, POST /user/repos.
const http = require('http');
const VALID = process.env.FAKE_TOKEN || 'fake-token-ok';
const state = { repos: {} };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  res.setHeader('content-type', 'application/json');
  if (auth !== VALID) { res.statusCode = 401; return res.end(JSON.stringify({ message: 'Bad credentials' })); }
  if (req.method === 'GET' && url.pathname === '/user') {
    res.setHeader('x-oauth-scopes', 'repo,user');
    return res.end(JSON.stringify({ login: 'fakeuser', name: 'Fake User', avatar_url: 'https://example.invalid/avatar.png' }));
  }
  const m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)$/);
  if (req.method === 'GET' && m) {
    const key = m[1] + '/' + m[2];
    if (!state.repos[key]) { res.statusCode = 404; return res.end(JSON.stringify({ message: 'Not Found' })); }
    const r = state.repos[key];
    return res.end(JSON.stringify({ ...r, html_url: 'https://github.com/' + key, private: r.private }));
  }
  if (req.method === 'POST' && url.pathname === '/user/repos') {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const j = JSON.parse(body || '{}');
      const key = 'fakeuser/' + j.name;
      if (state.repos[key]) { res.statusCode = 422; return res.end(JSON.stringify({ message: 'Repository creation failed.', errors: [{ code: 'already_exists' }] })); }
      state.repos[key] = { name: j.name, full_name: key, private: !!j.private, default_branch: 'main' };
      res.statusCode = 201;
      res.end(JSON.stringify(state.repos[key]));
    });
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ message: 'Not Found (' + req.method + ' ' + url.pathname + ')' }));
});
server.listen(3471, '127.0.0.1', () => console.log('fake-github on 3471'));
