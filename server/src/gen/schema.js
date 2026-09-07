// schema.js — field/table model helpers for generated apps
export function fieldDefs(entity) {
  const base = [{ key: 'id', label: 'ID', type: 'id', noAuto: true, hidden: true }];
  const f = entity.fields || entity;
  return [
    ...base,
    ...(Array.isArray(f) ? f : []).map((x) => ({
      key: x.key,
      label: x.label || titleCase(x.key),
      type: x.type || 'text',
      required: !!x.required,
      unique: !!x.unique,
      private: !!x.private,
      hidden: !!x.hidden,
      noAuto: !!x.noAuto,
      money: !!x.money,
      options: x.options || null,
      search: !!x.search,
    })),
  ];
}
export const titleCase = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const F = (key, label, opts = {}) => ({ key, label: label || titleCase(key), ...opts });
