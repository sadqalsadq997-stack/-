// ══════════════════════════════════════════════════════
// نظام الصلاحيات — role-based access control
// ══════════════════════════════════════════════════════

export const ROLES = {
  admin:          'admin',
  branch_manager: 'branch_manager',
  cashier:        'cashier',
  waiter:         'waiter',
  kitchen:        'kitchen',
  employee:       'employee',
  support_agent:  'support_agent', // ✅ جديد — موظف دعم فني فقط
  accountant:     'accountant',
  inventory_manager: 'inventory_manager',
};

// ══════════════════════════════════════════════════════
// المصدر الوحيد لأسماء الأدوار. أسماء قديمة/من جداول أخرى تُحوَّل هنا:
//   tenant_users.role = 'owner' ، rbac القديم = 'business_owner' / 'super_admin'
// ══════════════════════════════════════════════════════
const ROLE_ALIASES = {
  owner: 'admin',
  business_owner: 'admin',
  super_admin: 'admin',
  manager: 'branch_manager',
  staff: 'employee',
};

export function normalizeRole(role) {
  const r = String(role || '').toLowerCase();
  if (ROLE_ALIASES[r]) return ROLE_ALIASES[r];
  return ROLES[r] ? r : 'employee';
}

// الأدوار اللي يقدر المدير يعطيها للموظفين
export const ASSIGNABLE_ROLES = [
  'branch_manager', 'cashier', 'waiter', 'kitchen', 'accountant', 'inventory_manager', 'employee', 'support_agent',
];

export const ROLE_LABELS = {
  admin:          'مدير النظام',
  branch_manager: 'مدير فرع',
  cashier:        'كاشير',
  waiter:         'نادل',
  kitchen:        'مطبخ',
  employee:       'موظف',
  support_agent:  'موظف دعم فني', // ✅ جديد
  accountant:     'محاسب',
  inventory_manager: 'مدير مخزون',
};

// الصفحات المسموح بها لكل دور
const ROLE_ACCESS = {
  admin: '*',

  branch_manager: [
    '/', '/pos', '/orders', '/tables', '/kitchen',
    '/products', '/categories', '/inventory',
    '/customers', '/invoices', '/suppliers',
    '/expenses', '/analytics', '/employees',
    '/settings', '/ai', '/estore', '/loyalty',
    '/car-orders', '/support', '/pager', '/zatca-admin',
  ],

  cashier: [
    '/', '/pos', '/orders', '/invoices',
    '/customers', '/tables', '/support', '/pager',
  ],

  waiter: [
    '/pos', '/orders', '/tables', '/kitchen', '/support', '/pager',
  ],

  kitchen: [
    '/kitchen', '/orders', '/support', '/pager',
  ],

  employee: [
    '/', '/pos', '/orders', '/support', '/pager',
  ],

  // ✅ موظف الدعم الفني — فقط صفحة الدعم وصفحة رد المدير
  support_agent: [
    '/support',
  ],

  accountant: [
    '/', '/accounting', '/invoices', '/expenses', '/analytics',
    '/customers', '/suppliers', '/zatca-admin', '/support',
  ],

  inventory_manager: [
    '/', '/inventory', '/products', '/categories', '/suppliers', '/support',
  ],
};

export function canAccess(role, perms = {}, path) {
  const access = ROLE_ACCESS[normalizeRole(role)];
  if (!access) return false;
  if (access === '*') return true;
  if (perms[path] === true) return true;
  if (perms[path] === false) return false;
  return access.some(p => path === p || path.startsWith(p + '/'));
}

export function defaultPage(role) {
  switch (normalizeRole(role)) {
    case 'kitchen':       return '/kitchen';
    case 'waiter':        return '/pos';
    case 'cashier':       return '/pos';
    case 'support_agent': return '/support'; // ✅
    default:              return '/';
  }
}
