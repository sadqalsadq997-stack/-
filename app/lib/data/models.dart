// نماذج البيانات المحفوظة في الجهاز (من مزامنة app_sync)

import '../core/api.dart';
import '../core/pricing.dart';

class Product {
  Product(this.raw)
      : id = '${raw['id']}',
        name = (toS(raw['name_ar'])?.trim().isNotEmpty ?? false) ? toS(raw['name_ar'])! : (toS(raw['name']) ?? 'صنف'),
        nameEn = toS(raw['name']),
        basePrice = toD(raw['base_price']),
        taxInclusive = raw['tax_inclusive'] == true,
        vatCategory = vatCategoryOf(toS(raw['vat_category']), raw['tax_rate'] is num ? raw['tax_rate'] as num : null),
        exemptionCode = toS(raw['vat_exemption_code']),
        categoryId = toS(raw['category_id']),
        barcode = toS(raw['barcode']),
        sku = toS(raw['sku']),
        imageUrl = toS(raw['image_url']),
        active = raw['is_active'] != false,
        trackInventory = raw['track_inventory'] == true,
        stock = toD(raw['stock_quantity']),
        minStock = raw['min_stock_alert'] == null ? 5 : toD(raw['min_stock_alert']),
        cost = toD(raw['cost_price']),
        sortOrder = toI(raw['sort_order']);

  final Map<String, dynamic> raw;
  final String id;
  final String name;
  final String? nameEn;
  final double basePrice;
  final bool taxInclusive;
  final String vatCategory;
  final String? exemptionCode;
  final String? categoryId;
  final String? barcode;
  final String? sku;
  final String? imageUrl;
  final bool active;
  final bool trackInventory;
  final double stock;
  final double minStock;
  final double cost;
  final int sortOrder;

  UnitPrice get unit => unitPrice(basePrice: basePrice, taxInclusive: taxInclusive, vatCategory: vatCategory, exemptionCode: exemptionCode);
  bool get lowStock => trackInventory && stock <= minStock;
  bool get outOfStock => trackInventory && stock <= 0;
}

class ProductCategory {
  ProductCategory(Map<String, dynamic> r)
      : id = '${r['id']}',
        name = (toS(r['name_ar'])?.isNotEmpty ?? false) ? toS(r['name_ar'])! : (toS(r['name']) ?? ''),
        active = r['is_active'] != false,
        sortOrder = toI(r['sort_order']);
  final String id;
  final String name;
  final bool active;
  final int sortOrder;
}

class Customer {
  Customer(this.raw)
      : id = '${raw['id']}',
        name = toS(raw['name']) ?? '',
        legalName = toS(raw['legal_name']),
        phone = toS(raw['phone']),
        type = toS(raw['customer_type']) ?? 'individual',
        vatNumber = toS(raw['vat_number']),
        crNumber = toS(raw['cr_number']),
        stamps = toI(raw['stamps']);

  final Map<String, dynamic> raw;
  final String id;
  final String name;
  final String? legalName;
  final String? phone;
  final String type;
  final String? vatNumber;
  final String? crNumber;
  final int stamps;

  String get displayName => (legalName?.isNotEmpty ?? false) ? legalName! : name;
  bool get isCompany => type == 'corporate' || vatNumber != null || crNumber != null;

  /// نواقص الفاتورة الضريبية (نفس شروط السيرفر felsy_buyer_snapshot)
  List<String> get b2bMissing {
    final m = <String>[];
    String s(String k) => toS(raw[k])?.trim() ?? '';
    if (vatNumber == null && crNumber == null) m.add('الرقم الضريبي أو السجل التجاري');
    if (s('addr_street').isEmpty) m.add('الشارع');
    if (!RegExp(r'^\d{4}$').hasMatch(s('addr_building'))) m.add('رقم المبنى');
    if (s('addr_district').isEmpty) m.add('الحي');
    if (s('addr_city').isEmpty) m.add('المدينة');
    if (!RegExp(r'^\d{5}$').hasMatch(s('addr_postal'))) m.add('الرمز البريدي');
    return m;
  }
}

class Seller {
  const Seller({this.name = '', this.vatNumber = '', this.crNumber, this.address, this.phone, this.logoUrl});
  factory Seller.from(Map<String, dynamic> r) => Seller(
        name: toS(r['name']) ?? '', vatNumber: toS(r['vat_number']) ?? '', crNumber: toS(r['cr_number']),
        address: toS(r['address']), phone: toS(r['phone']), logoUrl: toS(r['logo_url']),
      );
  final String name;
  final String vatNumber;
  final String? crNumber;
  final String? address;
  final String? phone;
  final String? logoUrl;
}

class Branch {
  const Branch(this.id, this.name);
  final String id;
  final String name;
}
