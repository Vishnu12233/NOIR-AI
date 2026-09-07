export const META = {
 "name": "Design Desk",
 "tagline": "A full-stack application with a database and API.",
 "brand": "Design Desk",
 "stack": "",
 "default_theme": "dark",
 "landing": false,
 "main": "customers",
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
   "path": "/table/customers",
   "label": "Customers",
   "icon": "🚀",
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
   "table": "customers",
   "label": "Customer",
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
     "key": "plan",
     "label": "Plan",
     "type": "text",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": false,
     "options": [
      "Free",
      "Starter",
      "Pro",
      "Enterprise"
     ],
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
      "active",
      "trial",
      "past_due",
      "cancelled"
     ],
     "search": false
    },
    {
     "key": "mrr",
     "label": "MRR (USD)",
     "type": "number",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": true,
     "options": null,
     "search": false
    }
   ],
   "search": [
    "name",
    "email",
    "company"
   ]
  },
  {
   "table": "plans",
   "label": "Plan",
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
     "key": "price",
     "label": "Price (USD)",
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
     "key": "interval",
     "label": "Interval",
     "type": "text",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": false,
     "options": [
      "month",
      "year"
     ],
     "search": false
    },
    {
     "key": "highlights",
     "label": "Highlights",
     "type": "text",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": false,
     "options": null,
     "search": false
    }
   ],
   "search": [
    "name"
   ]
  },
  {
   "table": "subscriptions",
   "label": "Subscription",
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
     "key": "user_id",
     "label": "User Id",
     "type": "text",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": true,
     "noAuto": false,
     "money": false,
     "options": null,
     "search": false
    },
    {
     "key": "plan",
     "label": "Plan",
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
      "active",
      "trialing",
      "past_due",
      "canceled"
     ],
     "search": false
    },
    {
     "key": "renews_at",
     "label": "Renews",
     "type": "date",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": false,
     "options": null,
     "search": false
    }
   ],
   "search": [
    "plan"
   ]
  },
  {
   "table": "invoices",
   "label": "Invoice",
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
     "key": "number",
     "label": "Number",
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
     "key": "user_id",
     "label": "User Id",
     "type": "text",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": true,
     "noAuto": false,
     "money": false,
     "options": null,
     "search": false
    },
    {
     "key": "total",
     "label": "Total (USD)",
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
      "draft",
      "open",
      "paid",
      "void"
     ],
     "search": false
    }
   ],
   "search": [
    "number"
   ]
  },
  {
   "table": "comments",
   "label": "Comment",
   "client": false,
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
     "key": "post_id",
     "label": "Post Id",
     "type": "text",
     "required": false,
     "unique": false,
     "private": false,
     "hidden": true,
     "noAuto": false,
     "money": false,
     "options": null,
     "search": false
    },
    {
     "key": "author",
     "label": "Author",
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
     "key": "body",
     "label": "Body",
     "type": "multiline",
     "required": true,
     "unique": false,
     "private": false,
     "hidden": false,
     "noAuto": false,
     "money": false,
     "options": null,
     "search": false
    }
   ],
   "search": [
    "author",
    "body"
   ]
  }
 ],
 "features": [
  "comments",
  "search",
  "payments"
 ],
 "routes": [
  "home"
 ],
 "sample_data": true,
 "db": "file-or-postgres"
};
