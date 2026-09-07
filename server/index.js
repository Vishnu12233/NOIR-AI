// NOIR platform server bootstrap.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.js';
import { openDb, sessions } from './src/db.js';
import { watchdog } from './src/engine/runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
openDb();
sessions.cleanup();

const { app, previewProxy } = await import('./src/api.js');

// static client (built SPA) — server/static/dist
const staticDir = path.join(__dirname, 'static');
app.use(express.static(staticDir));
app.get(/^\/(?!api\/|preview\/|uploads?\/).*/, (req, res, next) => {
  const index = path.join(staticDir, 'index.html');
  if (req.path.startsWith('/api') || req.path.startsWith('/preview')) return next();
  if (fs.existsSync(index)) return res.sendFile(index);
  next();
});

const server = http.createServer(app);
previewProxy(server);

// watchdog: clear dead project processes every 45s
setInterval(watchdog, 45000).unref();

server.listen(config.port, config.host, () => {
  console.log('── NOIR ──────────────────────────────────────────────');
  console.log(`  NOIR platform listening on http://${config.host}:${config.port}`);
  console.log('  Think. Build. Ship. Improve.');
  console.log('──────────────────────────────────────────────────────');
});
