export const META = {
 "name": "Acme CRM",
 "tagline": "Pipeline tracking, contact records and sales activity.",
 "brand": "Acme CRM",
 "stack": "",
 "default_theme": "dark",
 "landing": false,
 "main": "leads",
 "auth": true,
 "detail": false,
 "nav": [
  {
   "path": "/",
   "label": "Overview",
   "icon": "🏠",
   "route": "home",
   "auth": false
  },
  {
   "path": "/board",
   "label": "Board",
   "icon": "📋",
   "route": "kanban"
  },
  {
   "path": "/table/leads",
   "label": "Leads",
   "icon": "🤝",
   "route": "crud"
  },
  {
   "path": "/settings",
   "label": "Settings",
   "icon": "⚙️",
   "route": "settings"
  },
  {
   "path": "/admin",
   "label": "Admin",
   "icon": "🛡️",
   "role": "admin",
   "route": "admin"
  }
 ],
 "tables": [
  {
   "table": "users",
   "label": "User",
   "client": "admin",
   "hidden": false,
   "fields": [
    {
     "key": "id",
     "label": "ID",
     "type": "id",
     "noAuto": true,
     "hidden": true
    },
    {
     "key": "email",
     "label": "Email",
     "type": "email",
     "required": false,
     "unique": true,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": false,
     "options": null,
     "search": false
    },
    {
     "key": "name",
     "label": "Name",
     "type": "text",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": false,
     "options": null,
     "search": false
    },
    {
     "key": "role",
     "label": "Role",
     "type": "text",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": false,
     "options": [
      "user",
      "admin"
     ],
     "search": false
    },
    {
     "key": "verified",
     "label": "Verified",
     "type": "text",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": true,
     "noAuto": false,
     "money": false,
     "options": null,
     "search": false
    }
   ],
   "search": [
    "name",
    "email"
   ]
  },
  {
   "table": "leads",
   "label": "Lead",
   "client": true,
   "hidden": false,
   "fields": [
    {
     "key": "id",
     "label": "ID",
     "type": "id",
     "noAuto": true,
     "hidden": true
    },
    {
     "key": "name",
     "label": "Name",
     "type": "text",
     "required": true,
     "unique": false,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": false,
     "options": null,
     "search": false
    },
    {
     "key": "email",
     "label": "Email",
     "type": "email",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": false,
     "options": null,
     "search": false
    },
    {
     "key": "company",
     "label": "Company",
     "type": "text",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": false,
     "options": null,
     "search": false
    },
    {
     "key": "value",
     "label": "Value (USD)",
     "type": "number",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": true,
     "options": null,
     "search": false
    },
    {
     "key": "status",
     "label": "Status",
     "type": "text",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": false,
     "options": [
      "new",
      "contacted",
      "qualified",
      "won",
      "lost"
     ],
     "search": false
    }
   ],
   "search": [
    "name",
    "email",
    "company"
   ]
  }
 ],
 "features": [
  "search"
 ],
 "routes": [
  "home"
 ],
 "sample_data": true,
 "db": "file-or-postgres"
};
