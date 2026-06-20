/**
 * ══════════════════════════════════════════════════════════════════
 * Felsy RBAC — Enterprise Role-Based Access Control
 * نظام صلاحيات احترافي متوافق مع متطلبات SaaS Multi-Tenant
 *
 * المبدأ: كل عملية = (resource + action)
 * الحماية: تعمل على 3 طبقات:
 *   1. UI Layer   — إخفاء/تعطيل العناصر
 *   2. Route Layer — حجب المسار وإعادة توجيه 403
 *   3. API Layer  — التحقق قبل تنفيذ أي عملية
 * ══════════════════════════════════════════════════════════════════
 */

// ── الأقسام (Resources) ──────────────────────────────────────────
export const RESOURCES = {
  DASHBOARD:     'dashboard',
  POS:           'pos',
  ORDERS:        'orders',
  TABLES:        'tables',
  KITCHEN:       'kitchen',
  PRODUCTS:      'products',
  CATEGORIES:    'categories',
  INVENTORY:     'inventory',
  SUPPLIERS:     'suppliers',
  CUSTOMERS:     'customers',
  EMPLOYEES:     'employees',
  EXPENSES:      'expenses',
  REPORTS:       'reports',
  AI:            'ai',
  LOYALTY:       'loyalty',
  DOMAINS:       'domains',
  SUBSCRIPTIONS: 'subscriptions',
  SUPPORT:       'support',
  ZATCA:         'zatca',
  ACCOUNTING:    'accounting',
  SETTINGS:      'settings',
  SUPER_ADMIN:   'super_admin',
} as const;

// ── الإجراءات (Actions) ──────────────────────────────────────────
export const ACTIONS = {
  VIEW:    'view',
  CREATE:  'create',
  EDIT:    'edit',
  DELETE:  'delete',
  EXPORT:  'export',
  APPROVE: 'approve',
} as const;

export type Resource = typeof RESOURCES[keyof typeof RESOURCES];
export type Action   = typeof ACTIONS[keyof typeof ACTIONS];
export type Permission = `${Resource}:${Action}`;

// ── الأدوار ───────────────────────────────────────────────────────
export const ROLES = {
  SUPER_ADMIN:       'super_admin',
  BUSINESS_OWNER:    'business_owner',
  ACCOUNTANT:        'accountant',
  INVENTORY_MANAGER: 'inventory_manager',
  BRANCH_MANAGER:    'branch_manager',
  CASHIER:           'cashier',
  WAITER:            'waiter',
  KITCHEN:           'kitchen',
  SUPPORT_AGENT:     'support_agent',
  EMPLOYEE:          'employee',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin:       'مالك النظام',
  business_owner:    'صاحب المنشأة',
  accountant:        'محاسب',
  inventory_manager: 'مدير مخزون',
  branch_manager:    'مدير فرع',
  cashier:           'كاشير',
  waiter:            'نادل',
  kitchen:           'مطبخ',
  support_agent:     'موظف دعم فني',
  employee:          'موظف',
};

// ── صلاحيات كل دور (افتراضية — قابلة للتخصيص per-employee) ──────
export const ROLE_PERMISSIONS: Record<Role, Permission[] | '*'> = {

  super_admin: '*',

  business_owner: [
    // كامل على منشأته
    'dashboard:view',
    'pos:view','pos:create','pos:edit',
    'orders:view','orders:create','orders:edit','orders:delete','orders:export','orders:approve',
    'tables:view','tables:create','tables:edit','tables:delete',
    'kitchen:view',
    'products:view','products:create','products:edit','products:delete','products:export',
    'categories:view','categories:create','categories:edit','categories:delete',
    'inventory:view','inventory:create','inventory:edit','inventory:delete','inventory:export',
    'suppliers:view','suppliers:create','suppliers:edit','suppliers:delete','suppliers:export',
    'customers:view','customers:create','customers:edit','customers:delete','customers:export',
    'employees:view','employees:create','employees:edit','employees:delete',
    'expenses:view','expenses:create','expenses:edit','expenses:delete','expenses:export',
    'reports:view','reports:export',
    'ai:view',
    'loyalty:view','loyalty:create','loyalty:edit',
    'domains:view','domains:create','domains:edit',
    'subscriptions:view','subscriptions:edit',   // عرض + ترقية/تخفيض فقط
    'support:view','support:create',
    'zatca:view','zatca:create','zatca:edit','zatca:approve',
    'accounting:view','accounting:create','accounting:edit','accounting:export',
    'settings:view','settings:edit',
  ],

  accountant: [
    'dashboard:view',
    'reports:view','reports:export',
    'expenses:view','expenses:create','expenses:edit','expenses:export',
    'accounting:view','accounting:create','accounting:edit','accounting:approve','accounting:export',
    'invoices:view','invoices:export',
    'customers:view',
    'suppliers:view',
    'zatca:view','zatca:export',
  ] as Permission[],

  inventory_manager: [
    'dashboard:view',
    'inventory:view','inventory:create','inventory:edit','inventory:delete','inventory:export',
    'suppliers:view','suppliers:create','suppliers:edit','suppliers:delete',
    'products:view','products:edit',
    'reports:view',
  ] as Permission[],

  branch_manager: [
    'dashboard:view',
    'pos:view','pos:create','pos:edit',
    'orders:view','orders:create','orders:edit','orders:delete','orders:approve',
    'tables:view','tables:create','tables:edit','tables:delete',
    'kitchen:view',
    'products:view','products:create','products:edit',
    'categories:view',
    'inventory:view','inventory:edit',
    'customers:view','customers:create','customers:edit',
    'employees:view',
    'expenses:view','expenses:create',
    'reports:view',
    'support:view','support:create',
  ] as Permission[],

  cashier: [
    'dashboard:view',
    'pos:view','pos:create',
    'orders:view','orders:create',
    'customers:view','customers:create',
    'support:view','support:create',
  ] as Permission[],

  waiter: [
    'tables:view','tables:edit',
    'orders:view','orders:create','orders:edit',
    'kitchen:view',
  ] as Permission[],

  kitchen: [
    'kitchen:view',
    'orders:view',
  ] as Permission[],

  support_agent: [
    'support:view','support:create','support:edit',
  ] as Permission[],

  employee: [
    'dashboard:view',
    'pos:view','pos:create',
    'orders:view',
    'support:view','support:create',
  ] as Permission[],
};

// ── Route → Resource mapping ─────────────────────────────────────
export const ROUTE_RESOURCE: Record<string, Resource> = {
  '/':               RESOURCES.DASHBOARD,
  '/pos':            RESOURCES.POS,
  '/orders':         RESOURCES.ORDERS,
  '/tables':         RESOURCES.TABLES,
  '/kitchen':        RESOURCES.KITCHEN,
  '/products':       RESOURCES.PRODUCTS,
  '/categories':     RESOURCES.CATEGORIES,
  '/inventory':      RESOURCES.INVENTORY,
  '/suppliers':      RESOURCES.SUPPLIERS,
  '/customers':      RESOURCES.CUSTOMERS,
  '/employees':      RESOURCES.EMPLOYEES,
  '/expenses':       RESOURCES.EXPENSES,
  '/analytics':      RESOURCES.REPORTS,
  '/ai':             RESOURCES.AI,
  '/loyalty':        RESOURCES.LOYALTY,
  '/loyalty-settings': RESOURCES.LOYALTY,
  '/domains':        RESOURCES.DOMAINS,
  '/subscriptions':  RESOURCES.SUBSCRIPTIONS,
  '/support':        RESOURCES.SUPPORT,
  '/admin-support':  RESOURCES.SUPPORT,
  '/zatca-settings': RESOURCES.ZATCA,
  '/zatca-admin':    RESOURCES.ZATCA,
  '/accounting':     RESOURCES.ACCOUNTING,
  '/settings':       RESOURCES.SETTINGS,
  '/owner':          RESOURCES.SUPER_ADMIN,
  '/super-admin':    RESOURCES.SUPER_ADMIN,
};

// ── Core Permission Check ────────────────────────────────────────
export function hasPermission(
  role: Role,
  resource: Resource,
  action: Action,
  customPerms?: Record<string, boolean>
): boolean {
  const perm: Permission = `${resource}:${action}`;

  // صلاحيات مخصصة تتجاوز الدور (override)
  if (customPerms) {
    if (customPerms[perm] === true)  return true;
    if (customPerms[perm] === false) return false;
  }

  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;
  if (rolePerms === '*') return true;
  return rolePerms.includes(perm);
}

// ── Route Access Check ───────────────────────────────────────────
export function canAccessRoute(
  role: Role,
  path: string,
  customPerms?: Record<string, boolean>
): boolean {
  // إيجاد أقرب resource للمسار
  const normalPath = path.split('?')[0].split('#')[0];
  const resource =
    ROUTE_RESOURCE[normalPath] ||
    Object.entries(ROUTE_RESOURCE).find(([r]) => normalPath.startsWith(r + '/') && r !== '/')?.[1];

  if (!resource) return true; // صفحات عامة بدون resource
  return hasPermission(role, resource, ACTIONS.VIEW, customPerms);
}

// ── Default page per role ────────────────────────────────────────
export function defaultPage(role: Role): string {
  switch (role) {
    case ROLES.SUPER_ADMIN:       return '/owner';
    case ROLES.KITCHEN:           return '/kitchen';
    case ROLES.WAITER:            return '/tables';
    case ROLES.CASHIER:           return '/pos';
    case ROLES.SUPPORT_AGENT:     return '/support';
    case ROLES.ACCOUNTANT:        return '/accounting';
    case ROLES.INVENTORY_MANAGER: return '/inventory';
    default:                      return '/';
  }
}

// backward compat (for old imports)
export const canAccess = (role: string, perms: Record<string, boolean> = {}, path: string) =>
  canAccessRoute(role as Role, path, perms);
