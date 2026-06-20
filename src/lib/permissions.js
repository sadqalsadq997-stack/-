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
};

export const ROLE_LABELS = {
  admin:          'مدير النظام',
  branch_manager: 'مدير فرع',
  cashier:        'كاشير',
  waiter:         'نادل',
  kitchen:        'مطبخ',
  employee:       'موظف',
  support_agent:  'موظف دعم فني', // ✅ جديد
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
    '/car-orders', '/support',
  ],

  cashier: [
    '/', '/pos', '/orders', '/invoices',
    '/customers', '/tables', '/support',
  ],

  waiter: [
    '/pos', '/orders', '/tables', '/kitchen', '/support',
  ],

  kitchen: [
    '/kitchen', '/orders', '/support',
  ],

  employee: [
    '/', '/pos', '/orders', '/support',
  ],

  // ✅ موظف الدعم الفني — فقط صفحة الدعم وصفحة رد المدير
  support_agent: [
    '/support', '/admin-support',
  ],
};

export function canAccess(role, perms = {}, path) {
  const access = ROLE_ACCESS[role];
  if (!access) return false;
  if (access === '*') return true;
  if (perms[path] === true) return true;
  if (perms[path] === false) return false;
  return access.some(p => path === p || path.startsWith(p + '/'));
}

export function defaultPage(role) {
  switch (role) {
    case 'kitchen':       return '/kitchen';
    case 'waiter':        return '/pos';
    case 'cashier':       return '/pos';
    case 'support_agent': return '/support'; // ✅
    default:              return '/';
  }
}
