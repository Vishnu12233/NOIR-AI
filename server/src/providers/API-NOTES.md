# Provider API notes (verified against docs, 2026-09-06)
Contract source of truth for the real provider integrations. Docs links + exact endpoints.
Anything not here was NOT shipped as code.

## Vercel — base https://api.vercel.com  (Bearer <token>)
- Auth/whoami: GET /v2/user
- Teams: GET /v2/teams (personal account when no team selected)
- Projects: GET /v9/projects (list, ?teamId=), GET /v9/projects/{idOrName}, POST /v11/projects
  (create; body: name, framework, buildCommand, outputDirectory, installCommand, devCommand,
  environmentVariables[{key,value,target:["production"],type:"plain"}]), PATCH /v9/projects/{idOrName}
- Env vars: GET /v9/projects/{idOrName}/env, POST /v9/projects/{idOrName}/env
  ({key,value,target:["production","preview","development"],type:"encrypted"}),
  DELETE /v9/projects/{idOrName}/env/{envId}, PATCH /v9/projects/{idOrName}/env/{envId}
- Deployments: POST /v13/deployments
  (body: {name, files:[{file, data? | sha?}], target:"production"|"preview", project,
  projectSettings:{framework,buildCommand,outputDirectory,installCommand}} — inline base64
  `data` allowed for small uploads; upload-then-sha path: POST /v2/files),
  GET /v13/deployments/{idOrUrl} (readyState: QUEUED|INITIALIZING|ANALYZING|BUILDING|READY|ERROR|CANCELED;
  fields: url, alias, target, readyState, created),
  POST /v13/deployments/{idOrUrl}/cancel, DELETE /v13/deployments/{idOrUrl},
  GET /v13/deployments (list; ?projectId=&state=&target=)
- Build logs (real, what the CLI streams): GET /v3/deployments/{idOrUrl}/events
  (?follow=1&limit=…&direction=backward) → events [{type:"command",created,payload:{text,…}}]
- Runtime logs: GET /v1/projects/{projectId}/deployments/{deploymentId}/runtime-logs
- Domains: GET /v9/domains, POST /v9/projects/{id}/domains
- URL is whatever the API returns (deployment.url e.g. `<name>-<hash>.vercel.app`); never fabricate.
- Rollback/promote production to a previous deployment: POST /v1/projects/{id}/promote/stable? —
  implement via redeploy/duplicate semantics only when docs confirm; current code: retry + cancel.

## Supabase Management API — base https://api.supabase.com (Bearer <access token>)
- Auth check: GET /v1/projects (also serves as token validation)
- Organizations: GET /v1/organizations → [{id,slug,name,…}], GET /v1/organizations/{slug}
- Projects: GET /v1/projects, POST /v1/projects
  ({name, organization_slug, db_pass, region_selection:{type:"smartGroup",code:"americas"} | legacy
  "region":"us-east-1", desired_instance_size:"micro"}),
  GET /v1/projects/{ref} (status: ACTIVE|COMING_UP|INACTIVE…, database:{host,…}, region)
- API keys: GET /v1/projects/{ref}/api-keys → [{name,api_key}] (anon/service_role legacy and
  publishable/secret new). Client-safe: SUPABASE_URL https://{ref}.supabase.co + anon/publishable.
- Run SQL: POST /v1/projects/{ref}/database/query {query}  ← universal executor (migration engine uses it)
- Migrations (gated partner/beta): POST /v1/projects/{ref}/database/migrations {query,name} —
  do NOT depend on it; track migration history ourselves in a schema_migrations table.
- Auth config: GET/PUT /v1/projects/{ref}/config/auth (configure providers etc. via PUT fields)
- OAuth: platform-level SUPABASE_OAUTH_CLIENT_ID/SECRET enable partner OAuth (authorize URL +
  callback); otherwise connect with a personal access token (encrypted at rest).
- Storage bootstrap: with keys from api-keys endpoint call the project storage API
  https://{ref}.supabase.co/storage/v1/bucket (real API, service key server-side only).

## Appwrite Cloud — endpoint https://cloud.appwrite.io/v1
- Auth model: API key is project-scoped (X-Appwrite-Key + X-Appwrite-Project). Org-level console
  APIs require console/org credentials (partner OAuth or console session) — capability-gated.
- Validate key: GET /v1/projects/{projectId} with X-Appwrite-Project+X-Appwrite-Key (200/401).
- Project APIs (key-scoped, stable): databases POST /v1/databases, collections POST
  /v1/databases/{db}/collections, attributes POST /v1/databases/{db}/collections/{col}/attributes/…,
  documents; storage /v1/storage/buckets; functions POST /v1/functions, variables
  POST /v1/functions/{id}/variables; platforms (console): POST /project/platforms/web +
  POST /project/platforms (console session/org key) — availability depends on credential kind.
- Sites (real, per docs + CLI ref): create site POST /sites
  ({siteId,name,framework,buildRuntime,adapter:"static"|"ssr",enabled,logging,installCommand,
  buildCommand,startCommand,outputDirectory,timeout}); deploy POST /sites/{siteId}/deployments
  (multipart/form-data field `code` with the site archive; optional activate:true),
  get deployment GET /sites/{siteId}/deployments/{deploymentId},
  list GET /sites/{siteId}/deployments, logs GET /sites/{siteId}/logs,
  activate: update active deployment endpoint, cancel: update-deployment-status (cancel builds),
  delete deployment DELETE /sites/{siteId}/deployments/{deploymentId}
- Statuses per API: processing|waiting|building|ready|active|failed (+canceled) — map verbatim.
- Default org id hint (config, non-secret): 6a8dbe51001b87d2ed41 — validated, never assumed.

## Environment (server-side only, NOIR config)
VERCEL_TOKEN, SUPABASE_ACCESS_TOKEN, SUPABASE_OAUTH_CLIENT_ID, SUPABASE_OAUTH_CLIENT_SECRET,
APPWRITE_ENDPOINT, APPWRITE_KEY/PROJECT (per-connection stored encrypted), APPWRITE_OAUTH_CLIENT_ID/
SECRET (platform partner OAuth), NOIR_ENCRYPTION_KEY (platform secret), NOIR_PUBLIC_URL (callbacks).
Never expose to the client; store encrypted (AES-256-GCM via engine/github.js encryptSecret).
