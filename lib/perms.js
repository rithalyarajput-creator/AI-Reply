// Role groups and the staff permission matrix (from the Super Admin MVP design).

export const STAFF_ROLES = ['staff_support', 'staff_sales', 'staff_billing', 'staff_developer'];
export const PLATFORM_ROLES = ['super_admin', ...STAFF_ROLES];
export const CLIENT_ROLES = ['client_admin', 'agent_head', 'agent'];

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  staff_support: 'Support',
  staff_sales: 'Sales',
  staff_billing: 'Billing / Accounts',
  staff_developer: 'Developer',
  agency_admin: 'Agency Admin',
  client_admin: 'Client Admin',
  agent_head: 'Agent Head',
  agent: 'Agent',
};

// permission -> roles allowed (super_admin is always allowed)
export const PERMISSIONS = {
  'clients.view': ['staff_support', 'staff_sales', 'staff_billing', 'staff_developer'],
  'clients.edit': ['staff_sales'],
  'clients.login_as': ['staff_support'],
  'channels.view': ['staff_support', 'staff_developer'],
  'plans.view': ['staff_sales', 'staff_billing'],
  'plans.edit': [],
  'wallet.view': ['staff_support', 'staff_billing'],
  'wallet.edit': ['staff_billing'],
  'staff.manage': [],
  'audit.view': ['staff_developer'],
  'website_leads.manage': ['staff_sales'],
};

export const MATRIX_MODULES = [
  ['Clients view', 'clients.view'],
  ['Client add / edit', 'clients.edit'],
  ['Login as client', 'clients.login_as'],
  ['Channels', 'channels.view'],
  ['Plans and pricing (view)', 'plans.view'],
  ['Plans and pricing (edit)', 'plans.edit'],
  ['Wallet and billing (view)', 'wallet.view'],
  ['Wallet and billing (edit)', 'wallet.edit'],
  ['Staff and roles', 'staff.manage'],
  ['Audit logs', 'audit.view'],
  ['Website leads', 'website_leads.manage'],
];

export function can(role, perm) {
  if (role === 'super_admin') return true;
  return (PERMISSIONS[perm] || []).includes(role);
}

export const isPlatform = (role) => PLATFORM_ROLES.includes(role);
