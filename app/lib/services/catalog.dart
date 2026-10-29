// ══════════════════════════════════════════════════════════════════
// الكتالوج المحفوظ في الجهاز (المنتجات، التصنيفات، العملاء، بيانات البائع)
// مزامنة خفيفة: أول مرة كامل، بعدها المتغير فقط منذ آخر مزامنة (app_sync)
// ⇒ نقطة البيع تشتغل بدون إنترنت بآخر نسخة محفوظة.
// ══════════════════════════════════════════════════════════════════

import 'package:flutter/foundation.dart';

import '../core/api.dart';
import '../core/store.dart';
import '../data/models.dart';

class CatalogService extends ChangeNotifier {
  CatalogService(this.api, this.store);
  final Api api;
  final LocalStore store;

  String? _tenant;
  final Map<String, Map<String, dynamic>> _products = {};
  final Map<String, Map<String, dynamic>> _customers = {};
  List<ProductCategory> categories = const [];
  List<Branch> branches = const [];
  Seller seller = const Seller();
  Map<String, dynamic> zatca = const {};
  int loyaltyRequired = 10;
  DateTime? serverTime;
  DateTime? lastSync;
  bool syncing = false;
  String? lastError;

  List<Product> _productList = const [];
  List<Customer> _customerList = const [];
  List<Product> get products => _productList;
  List<Customer> get customers => _customerList;

  bool get zatcaActive => zatca['status'] == 'active';
  bool get supportsB2B => zatca['supports_b2b'] != false;

  String get _file => 'catalog_$_tenant';

  Product? productById(String id) => _products[id] == null ? null : Product(_products[id]!);
  Customer? customerById(String id) => _customers[id] == null ? null : Customer(_customers[id]!);

  Product? byBarcode(String code) {
    final c = code.trim().toUpperCase();
    if (c.isEmpty) return null;
    for (final p in _productList) {
      if ((p.barcode ?? '').trim().toUpperCase() == c) return p;
    }
    for (final p in _productList) {
      if ((p.sku ?? '').trim().toUpperCase() == c) return p;
    }
    return null;
  }

  Customer? byPhone(String phone) {
    final n = normPhone(phone);
    if (n.length < 9) return null;
    for (final c in _customerList) {
      if (normPhone(c.phone ?? '') == n) return c;
    }
    return null;
  }

  Future<void> load(String tenant) async {
    _tenant = tenant;
    _products.clear();
    _customers.clear();
    final m = await store.readMap(_file);
    if (m != null) {
      for (final p in asList(m['products'])) {
        _products['${p['id']}'] = p;
      }
      for (final c in asList(m['customers'])) {
        _customers['${c['id']}'] = c;
      }
      _applyMeta(m);
      serverTime = DateTime.tryParse('${m['server_time'] ?? ''}');
      lastSync = DateTime.tryParse('${m['last_sync'] ?? ''}');
    }
    _rebuild();
  }

  void _applyMeta(Map<String, dynamic> m) {
    if (m['categories'] is List) {
      categories = asList(m['categories']).map(ProductCategory.new).where((c) => c.active).toList()
        ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    }
    if (m['branches'] is List) {
      branches = asList(m['branches']).map((b) => Branch('${b['id']}', toS(b['name']) ?? 'فرع')).toList();
    }
    if (m['seller'] is Map) seller = Seller.from(asMap(m['seller']));
    if (m['zatca'] is Map) zatca = asMap(m['zatca']);
    if (m['loyalty_required'] != null) loyaltyRequired = toI(m['loyalty_required']).clamp(1, 100);
  }

  void _rebuild() {
    _productList = _products.values.map(Product.new).where((p) => p.active).toList()
      ..sort((a, b) {
        final s = a.sortOrder.compareTo(b.sortOrder);
        return s != 0 ? s : a.name.compareTo(b.name);
      });
    _customerList = _customers.values.map(Customer.new).toList()..sort((a, b) => a.name.compareTo(b.name));
    notifyListeners();
  }

  /// مزامنة من السيرفر. full=true يعيد التحميل كامل.
  Future<bool> sync({String? branch, bool full = false}) async {
    if (_tenant == null || syncing) return false;
    syncing = true;
    notifyListeners();
    try {
      final since = full || serverTime == null ? null : serverTime!.toIso8601String();
      final r = asMap(await api.rpc('app_sync', {'p_since': since, 'p_branch': branch}, const Duration(seconds: 40)));
      if (r['full'] == true) {
        _products.clear();
        _customers.clear();
      }
      for (final p in asList(r['products'])) {
        _products['${p['id']}'] = p;
      }
      if (r['product_ids'] is List) {
        final keep = (r['product_ids'] as List).map((e) => '$e').toSet();
        _products.removeWhere((k, _) => !keep.contains(k));
      }
      for (final c in asList(r['customers'])) {
        _customers['${c['id']}'] = c;
      }
      _applyMeta(r);
      serverTime = DateTime.tryParse('${r['server_time'] ?? ''}') ?? DateTime.now().toUtc();
      lastSync = DateTime.now();
      lastError = null;
      await _persist();
      _rebuild();
      return true;
    } catch (e) {
      lastError = friendlyError(e);
      return false;
    } finally {
      syncing = false;
      notifyListeners();
    }
  }

  Future<void> _persist() => store.write(_file, {
        'products': _products.values.toList(),
        'customers': _customers.values.toList(),
        'categories': categories.map((c) => {'id': c.id, 'name_ar': c.name, 'is_active': c.active, 'sort_order': c.sortOrder}).toList(),
        'branches': branches.map((b) => {'id': b.id, 'name': b.name}).toList(),
        'seller': {'name': seller.name, 'vat_number': seller.vatNumber, 'cr_number': seller.crNumber, 'address': seller.address, 'phone': seller.phone, 'logo_url': seller.logoUrl},
        'zatca': zatca,
        'loyalty_required': loyaltyRequired,
        'server_time': serverTime?.toIso8601String(),
        'last_sync': lastSync?.toIso8601String(),
      });

  /// تحديث محلي فوري بعد تعديل (قبل المزامنة التالية)
  Future<void> upsertProduct(Map<String, dynamic> p) async {
    _products['${p['id']}'] = {...?_products['${p['id']}'], ...p};
    _rebuild();
    await _persist();
  }

  Future<void> upsertCustomer(Map<String, dynamic> c) async {
    _customers['${c['id']}'] = {...?_customers['${c['id']}'], ...c};
    _rebuild();
    await _persist();
  }

  /// خصم المخزون محلياً بعد البيع (للعرض حتى تصل المزامنة)
  void applyLocalSale(Iterable<({String productId, int qty})> lines) {
    var changed = false;
    for (final l in lines) {
      final p = _products[l.productId];
      if (p == null || p['track_inventory'] != true) continue;
      p['stock_quantity'] = toD(p['stock_quantity']) - l.qty;
      changed = true;
    }
    if (changed) {
      _rebuild();
      _persist();
    }
  }
}

String normPhone(String v) {
  var d = v.replaceAll(RegExp(r'[^\d]'), '');
  if (d.startsWith('00966')) d = d.substring(5);
  if (d.startsWith('966')) d = d.substring(3);
  if (d.length == 9 && d.startsWith('5')) d = '0$d';
  return d;
}
