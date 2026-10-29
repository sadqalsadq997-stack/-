// ══════════════════════════════════════════════════════════════════
// الصلاحيات — نفس خريطة الموقع (src/lib/permissions.js)
// الدور من رمز PIN (مدير/كاشير/محاسب…) + صلاحيات مخصصة لكل موظف
// السيرفر يطبق الحماية الحقيقية (RLS) — هذا لإخفاء ما لا يخص المستخدم.
// ══════════════════════════════════════════════════════════════════

const _aliases = {'owner': 'admin', 'business_owner': 'admin', 'super_admin': 'admin', 'manager': 'branch_manager', 'staff': 'employee'};
const _known = {'admin', 'branch_manager', 'cashier', 'waiter', 'kitchen', 'employee', 'support_agent', 'accountant', 'inventory_manager'};

String normalizeRole(String? role) {
  final r = (role ?? '').toLowerCase();
  if (_aliases.containsKey(r)) return _aliases[r]!;
  return _known.contains(r) ? r : 'employee';
}

const roleLabels = {
  'admin': 'مدير النظام', 'branch_manager': 'مدير فرع', 'cashier': 'كاشير', 'waiter': 'نادل', 'kitchen': 'مطبخ',
  'employee': 'موظف', 'support_agent': 'موظف دعم', 'accountant': 'محاسب', 'inventory_manager': 'مدير مخزون',
};

const _access = <String, List<String>>{
  'branch_manager': ['/', '/pos', '/orders', '/tables', '/kitchen', '/products', '/categories', '/inventory', '/customers', '/invoices',
    '/suppliers', '/expenses', '/analytics', '/employees', '/settings', '/ai', '/estore', '/loyalty', '/car-orders', '/support', '/pager', '/zatca-admin'],
  'cashier': ['/', '/pos', '/orders', '/invoices', '/customers', '/tables', '/support', '/pager'],
  'waiter': ['/pos', '/orders', '/tables', '/kitchen', '/support', '/pager'],
  'kitchen': ['/kitchen', '/orders', '/support', '/pager'],
  'employee': ['/', '/pos', '/orders', '/support', '/pager'],
  'support_agent': ['/support'],
  'accountant': ['/', '/accounting', '/invoices', '/expenses', '/analytics', '/customers', '/suppliers', '/zatca-admin', '/support'],
  'inventory_manager': ['/', '/inventory', '/products', '/categories', '/suppliers', '/support'],
};

bool canAccess(String? role, Map<String, dynamic> perms, String path) {
  final r = normalizeRole(role);
  if (r == 'admin') return true;
  final p = perms[path];
  if (p == true) return true;
  if (p == false) return false;
  final list = _access[r];
  if (list == null) return false;
  return list.any((x) => path == x || path.startsWith('$x/'));
}
