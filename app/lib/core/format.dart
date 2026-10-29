// تنسيق الأرقام والتواريخ — أرقام لاتينية دائماً (مثل الموقع والفاتورة)
// والوقت بتوقيت السعودية (UTC+3) مهما كان توقيت الجهاز.

const riyal = '⃁'; // رمز الريال السعودي الرسمي (خط SaudiRiyal)

String money(num v, {bool symbol = false}) {
  final neg = v < 0;
  final s = v.abs().toStringAsFixed(2);
  final parts = s.split('.');
  final intPart = parts[0];
  final buf = StringBuffer();
  for (var i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 == 0) buf.write(',');
    buf.write(intPart[i]);
  }
  final out = '${neg ? '-' : ''}$buf.${parts[1]}';
  return symbol ? '$out $riyal' : out;
}

/// كمية بدون أصفار زائدة: 3 أو 2.5
String qty(num v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(3).replaceFirst(RegExp(r'0+$'), '');

DateTime ksa(DateTime t) => t.toUtc().add(const Duration(hours: 3));

String _p(int n) => n.toString().padLeft(2, '0');

String dateTimeKsa(DateTime t) {
  final k = ksa(t);
  return '${k.year}-${_p(k.month)}-${_p(k.day)}  ${_p(k.hour)}:${_p(k.minute)}';
}

String dateKsa(DateTime t) {
  final k = ksa(t);
  return '${k.year}-${_p(k.month)}-${_p(k.day)}';
}

String timeKsa(DateTime t) {
  final k = ksa(t);
  return '${_p(k.hour)}:${_p(k.minute)}';
}

/// تاريخ YYYY-MM-DD لاستعلامات القاعدة
String isoDate(DateTime d) => '${d.year}-${_p(d.month)}-${_p(d.day)}';

DateTime? parseTime(Object? v) => v == null ? null : DateTime.tryParse('$v');

/// "قبل 5 دقائق"
String ago(DateTime t) {
  final d = DateTime.now().difference(t);
  if (d.inSeconds < 60) return 'الآن';
  if (d.inMinutes < 60) return 'قبل ${d.inMinutes} د';
  if (d.inHours < 24) return 'قبل ${d.inHours} س';
  return 'قبل ${d.inDays} يوم';
}

const payLabels = {
  'cash': 'نقدي', 'card': 'بطاقة', 'mada': 'مدى', 'applepay': 'Apple Pay', 'stcpay': 'STC Pay',
  'transfer': 'تحويل', 'mixed': 'مختلط', 'online': 'أونلاين', 'credit': 'آجل',
};
const orderTypeLabels = {'dine_in': 'محلي', 'takeaway': 'سفري', 'delivery': 'توصيل', 'car_wash': 'غسيل سيارة', 'online': 'أونلاين'};

const vatCategoryShort = {'S': '15%', 'Z': 'صفري', 'E': 'معفى', 'O': 'خارج النطاق'};
const vatCategoryLabels = {'S': 'خاضع للضريبة 15%', 'Z': 'نسبة صفرية 0%', 'E': 'معفى من الضريبة', 'O': 'خارج نطاق الضريبة'};
const vatExemptions = <String, List<List<String>>>{
  'E': [
    ['VATEX-SA-29', 'الخدمات المالية المعفاة (المادة 29)'],
    ['VATEX-SA-29-7', 'عقود التأمين على الحياة (المادة 29)'],
    ['VATEX-SA-30', 'توريد العقارات السكنية المعفاة (المادة 30)'],
  ],
  'Z': [
    ['VATEX-SA-35', 'الأدوية والمعدات الطبية (المادة 35)'],
    ['VATEX-SA-32', 'تصدير السلع (المادة 32)'],
    ['VATEX-SA-33', 'تصدير الخدمات (المادة 33)'],
    ['VATEX-SA-34-1', 'النقل الدولي للسلع (المادة 34)'],
    ['VATEX-SA-34-2', 'النقل الدولي للركاب (المادة 34)'],
    ['VATEX-SA-34-3', 'خدمات مرتبطة بالنقل الدولي للركاب (المادة 34)'],
    ['VATEX-SA-34-4', 'توريد وسائل النقل المؤهلة (المادة 34)'],
    ['VATEX-SA-34-5', 'خدمات مرتبطة بنقل السلع أو الركاب (المادة 34)'],
    ['VATEX-SA-36', 'المعادن المؤهلة (المادة 36)'],
    ['VATEX-SA-MLTRY', 'السلع العسكرية المؤهلة'],
  ],
  'O': [
    ['VATEX-SA-OOS', 'خارج نطاق ضريبة القيمة المضافة'],
  ],
};

const zatcaStatusLabels = {
  'pending': 'بانتظار التوقيع', 'signed': 'موقّعة — بانتظار الإرسال', 'reported': 'مُبلّغة للهيئة', 'reported_warnings': 'مُبلّغة (ملاحظات)',
  'cleared': 'معتمدة', 'cleared_warnings': 'معتمدة (ملاحظات)', 'rejected': 'مرفوضة', 'error': 'تعذر الإرسال — يعاد تلقائياً',
  'queued': 'محفوظة بالجهاز — ترتفع عند الاتصال', 'failed': 'فشل الرفع — راجعها',
};
