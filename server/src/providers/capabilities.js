// providers/capabilities.js — capability registry. The UI enables/disables
// features strictly from this map — nothing is offered that the provider module
// does not actually implement with real API calls.
export const CAPABILITY_REGISTRY = {
  vercel: {
    deployment: true, preview: true, production: true, environment_variables: true,
    domains: true, logs: true, status: true, cancel: true, rollback: false,
    label: 'Deploy frontends & adapters to Vercel',
    blurb: 'Real upload + build; URL, states and logs come from api.vercel.com.',
  },
  supabase: {
    organizations: true, projects: true, database: true, migrations: true,
    authentication: 'config-read', storage: true, functions: false, configuration: true,
    label: 'Provision real Postgres projects & run migrations',
    blurb: 'Management API: create projects, run SQL, verify schema, fetch API keys.',
  },
  appwrite: {
    organizations: 'console-required', projects: 'console-required', sites: true,
    deployments: true, databases: true, storage: true, functions: true,
    variables: true, logs: true,
    label: 'Provision backend resources + Appwrite Sites deploys',
    blurb: 'Project-scoped APIs for databases/storage/functions; sites deploy real archives.',
  },
  github: { repositories: true, push: true, label: 'Push to real GitHub repositories' },
  local: { deployment: true, logs: true, status: true, cancel: true, label: 'NOIR local runtime (this sandbox)' },
};
