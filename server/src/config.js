// NOIR server configuration
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

export const config = {
  root,
  port: Number(process.env.PORT || 7860),
  host: '0.0.0.0',
  isDev: (process.env.NODE_ENV || 'development') !== 'production',
  // Secret for session tokens — override in production.
  secret: process.env.NOIR_SECRET || 'noir-dev-secret-change-me',
  sessionTtlMs: 1000 * 60 * 60 * 24 * 14, // 14 days
  dataDir: process.env.NOIR_DATA_DIR || path.join(root, '..', 'data'),
  // Runtime sandbox for generated projects (client-side Node.js previews)
  sandbox: {
    cwd: process.env.NOIR_SANDBOX_DIR || path.join(root, '..', 'data', 'runtime'),
    memMb: 384, // node --max-old-space-size
    // (c)pu/dir/network limits are applied by the OS container NOIR itself runs in.
  },
  runner: {
    perProjectConcurrent: 1, // one running preview per project
    maxProjects: Number(process.env.NOIR_MAX_RUNNERS || 6),
  },
  limits: {
    envVarsPerProject: 60,
    apiCallsPerMinute: 300,
    auditLogKeep: 2000,
  },
};

export const AI_MODEL_KEYS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GROQ_API_KEY', 'XAI_API_KEY'];

export function dbFile() { return path.join(config.dataDir, 'noir.db'); }
