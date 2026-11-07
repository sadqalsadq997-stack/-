// ══════════════════════════════════════════════════════════════════
// استيراد المنتجات من الإكسل — أدوات القراءة والتنظيف والتخطيط
// القواعد الأساسية:
//   • الباركود ورمز المنتج يُقرآن كنص دائماً (لا يضيع الصفر ولا يتحول لصيغة علمية)
//   • الخلية الفارغة لا تمسح بيانات موجودة — تُتجاهل في التحديث
//   • المطابقة مع المنتجات الموجودة بالباركود أولاً ثم رمز المنتج
// ══════════════════════════════════════════════════════════════════

// أسماء الأعمدة المقبولة (عربي/إنجليزي) لكل حقل
const FIELD_ALIASES = {
  name_ar: ['الاسم عربي', 'الاسم بالعربي', 'الاسم العربي', 'اسم المنتج', 'اسم الصنف', 'الاسم', 'name_ar', 'name ar', 'arabic name'],
  name: ['الاسم انجليزي', 'الاسم إنجليزي', 'الاسم بالانجليزي', 'الاسم بالإنجليزي', 'الاسم الانجليزي', 'الاسم الإنجليزي', 'name', 'name_en', 'name en', 'english name'],
  sku: ['رمز المنتج', 'رقم المنتج', 'كود المنتج', 'رمز الصنف', 'رقم الصنف', 'الكود', 'الرمز', 'sku', 'code', 'product code'],
  barcode: ['الباركود', 'باركود', 'رقم الباركود', 'barcode'],
  base_price: ['السعر قبل الضريبة', 'السعر قبل', 'سعر البيع', 'السعر', 'price', 'base_price', 'price before tax', 'selling price'],
  cost_price: ['سعر التكلفة', 'التكلفة', 'سعر الشراء', 'cost', 'cost_price', 'cost price'],
  category: ['التصنيف', 'القسم', 'الفئة', 'category'],
  image_url: ['رابط الصورة', 'الصورة', 'صورة', 'image', 'image_url', 'image url'],
};

export const FIELD_LABELS = {
  name_ar: 'الاسم عربي', name: 'الاسم إنجليزي', sku: 'رمز المنتج', barcode: 'الباركود',
  base_price: 'السعر قبل الضريبة', cost_price: 'سعر التكلفة', category: 'التصنيف', image_url: 'رابط الصورة',
};

// توحيد الكتابة: أرقام لاتينية، إزالة المسافات والرموز، توحيد الألف والياء والتاء المربوطة
export function toLatinDigits(s) {
  return String(s).replace(/[٠-٩۰-۹]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

function normKey(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\s_\-ـ.()*:/\\]/g, '')
    .replace(/[\u064B-\u0652]/g, '');
}

const ALIAS_MAP = (() => {
  const m = new Map();
  for (const [field, list] of Object.entries(FIELD_ALIASES)) for (const a of list) m.set(normKey(a), field);
  return m;
})();

// خلية نصية: الأرقام تتحول لنص كامل بدون صيغة علمية
function textCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return toLatinDigits(String(v)).replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
}

const SCI_RE = /^\d+(\.\d+)?e[+-]?\d+$/i;

function numberCell(v) {
  if (v == null || v === '') return { value: null };
  if (typeof v === 'number') return Number.isFinite(v) ? { value: v } : { error: true };
  const t = toLatinDigits(String(v))
    .replace(/[٫]/g, '.')
    .replace(/[٬,\s]/g, '')
    .replace(/[^\d.\-]/g, '');
  if (t === '') return { value: null };
  const n = Number(t);
  return Number.isFinite(n) ? { value: n } : { error: true };
}

// قراءة الملف (xlsx / xls / csv) وإرجاع الصفوف المنظّفة
export async function parseProductFile(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  // raw:true: ملفات CSV تُقرأ كنص فلا تضيع الأصفار من الباركود
  const wb = XLSX.read(buf, { type: 'array', raw: true });
  const sheetName = wb.SheetNames.find((n) => normKey(n) === normKey('المنتجات')) || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error('الملف فارغ');
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: false });

  // أول صف فيه عمود معروف = صف العناوين
  let headerIdx = grid.findIndex((r) => r.some((c) => ALIAS_MAP.has(normKey(c))));
  if (headerIdx < 0) throw new Error('ما لقيت صف العناوين. استخدم القالب الجاهز أو تأكد من اسم عمود الاسم.');

  const colField = {};
  const unknownHeaders = [];
  grid[headerIdx].forEach((c, i) => {
    const f = ALIAS_MAP.get(normKey(c));
    if (f && !Object.values(colField).includes(f)) colField[i] = f;
    else if (String(c).trim()) unknownHeaders.push(String(c).trim());
  });
  const fields = Object.values(colField);
  if (!fields.includes('name_ar') && !fields.includes('name')) throw new Error('لازم يكون فيه عمود للاسم (عربي أو إنجليزي)');

  const rows = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const raw = grid[r];
    if (!raw || raw.every((c) => String(c ?? '').trim() === '')) continue;
    const row = { line: r + 1, errors: [], warnings: [], name_ar: '', name: '', sku: '', barcode: '', category: '', image_url: '', base_price: null, cost_price: null };
    for (const [i, f] of Object.entries(colField)) {
      const cell = raw[i];
      if (f === 'base_price' || f === 'cost_price') {
        const n = numberCell(cell);
        if (n.error) row.errors.push(`${FIELD_LABELS[f]}: قيمة غير صالحة`);
        else if (n.value != null && n.value < 0) row.errors.push(`${FIELD_LABELS[f]}: لا يمكن أن يكون سالباً`);
        else row[f] = n.value;
      } else {
        row[f] = textCell(cell);
      }
    }
    for (const f of ['barcode', 'sku']) {
      if (SCI_RE.test(row[f])) row.errors.push(`${FIELD_LABELS[f]} بصيغة علمية (${row[f]}) — حوّل العمود إلى "نص" في الإكسل وأعد كتابة القيم`);
    }
    if (row.image_url && !/^https?:\/\//i.test(row.image_url)) {
      row.warnings.push('رابط الصورة غير صالح — تم تجاهله');
      row.image_url = '';
    }
    if (!row.name_ar && !row.name) row.errors.push('الاسم مطلوب');
    rows.push(row);
  }
  return { rows, unknownHeaders, fields, sheetName };
}

// تخطيط العملية: لكل صف (إضافة / تحديث / تخطي / خطأ) مع الحمولة الجاهزة للإرسال
export function buildPlan(rows, existing, categories, { updateExisting = true } = {}) {
  const byBarcode = new Map();
  const bySku = new Map();
  for (const p of existing) {
    if (p.barcode) byBarcode.set(String(p.barcode).trim(), p);
    if (p.sku) bySku.set(String(p.sku).trim(), p);
  }
  const catByName = new Map();
  for (const c of categories) {
    if (c.name_ar) catByName.set(normKey(c.name_ar), c.id);
    if (c.name) catByName.set(normKey(c.name), c.id);
  }

  const seenBarcode = new Set();
  const seenSku = new Set();

  return rows.map((row) => {
    const errors = [...row.errors];
    const warnings = [...row.warnings];

    // تكرار داخل الملف نفسه
    if (row.barcode) { if (seenBarcode.has(row.barcode)) errors.push('الباركود مكرر في الملف'); seenBarcode.add(row.barcode); }
    if (row.sku) { if (seenSku.has(row.sku)) errors.push('رمز المنتج مكرر في الملف'); seenSku.add(row.sku); }

    let category_id = null;
    if (row.category) {
      category_id = catByName.get(normKey(row.category)) || null;
      if (!category_id) warnings.push(`التصنيف "${row.category}" غير موجود — يُترك بدون تصنيف (أضفه من صفحة التصنيفات)`);
    }

    // مطابقة المنتج الموجود
    const a = row.barcode ? byBarcode.get(row.barcode) : null;
    const b = row.sku ? bySku.get(row.sku) : null;
    if (a && b && a.id !== b.id) errors.push('الباركود ورمز المنتج يخصّان منتجين مختلفين في النظام');
    const match = a || b || null;

    if (errors.length) return { row, action: 'error', errors, warnings };

    if (match) {
      if (!updateExisting) return { row, action: 'skip', errors, warnings, note: 'موجود مسبقاً', match };
      // تحديث: الحقول المعبّأة فقط — الفارغ لا يمسح شيئاً
      const payload = {};
      if (row.name_ar) payload.name_ar = row.name_ar;
      if (row.name) payload.name = row.name;
      if (row.sku) payload.sku = row.sku;
      if (row.barcode) payload.barcode = row.barcode;
      if (row.base_price != null) payload.base_price = row.base_price;
      if (row.cost_price != null) payload.cost_price = row.cost_price;
      if (category_id) payload.category_id = category_id;
      if (row.image_url) payload.image_url = row.image_url;
      if (!Object.keys(payload).length) return { row, action: 'skip', errors, warnings, note: 'لا تغييرات', match };
      return { row, action: 'update', errors, warnings, match, payload };
    }

    // إضافة منتج جديد (نفس افتراضات نموذج إضافة المنتج)
    const payload = {
      name: row.name || row.name_ar,
      name_ar: row.name_ar || null,
      sku: row.sku || null,
      barcode: row.barcode || null,
      base_price: row.base_price,
      cost_price: row.cost_price,
      category_id,
      image_url: row.image_url || null,
      unit_type: 'piece',
      is_active: true,
      show_in_menu: true,
      show_in_store: false,
      track_inventory: false,
      min_stock_alert: 5,
      tax_rate: 15,
      tax_inclusive: false,
      vat_category: 'S',
    };
    return { row, action: 'insert', errors, warnings, payload };
  });
}

// جلب كل الصفوف (يتجاوز حد 1000 صف في الطلب الواحد)
export async function fetchAllRows(supabase, table, columns) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(from, from + size - 1);
    if (error) throw error;
    out.push(...(data || []));
    if ((data || []).length < size) break;
  }
  return out;
}

// قالب إكسل جاهز: أعمدة الباركود والرمز بصيغة "نص" مسبقاً
export async function downloadTemplate() {
  const XLSX = await import('xlsx');
  const headers = ['الاسم عربي', 'الاسم انجليزي', 'رمز المنتج', 'الباركود', 'السعر قبل الضريبة', 'سعر التكلفة', 'التصنيف', 'رابط الصورة'];
  const example = ['قهوة عربية', 'Arabic Coffee', 'COF-001', '6281000000001', 12.5, 6, 'مشروبات', ''];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  const LAST_ROW = 1000;
  // C = رمز المنتج ، D = الباركود: خلايا نصية حتى لا يحوّلها الإكسل لأرقام
  for (let r = 2; r <= LAST_ROW; r++) {
    for (const col of ['C', 'D']) {
      const addr = `${col}${r}`;
      ws[addr] = { t: 's', v: r === 2 ? example[col === 'C' ? 2 : 3] : '', z: '@' };
    }
  }
  ws['!ref'] = `A1:H${LAST_ROW}`;
  ws['!cols'] = [{ wch: 26 }, { wch: 26 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 34 }];

  const notes = XLSX.utils.aoa_to_sheet([
    ['تعليمات'],
    ['الاسم عربي أو الاسم إنجليزي: واحد منهما على الأقل مطلوب'],
    ['الباركود ورمز المنتج: يُكتبان كنص (العمودان مهيّآن مسبقاً) — لا تغيّر تنسيقهما'],
    ['السعر قبل الضريبة: أرقام فقط (ضريبة 15% تُضاف تلقائياً للمنتجات الجديدة)'],
    ['التصنيف: لازم يطابق اسم تصنيف موجود في النظام، وإلا يُترك المنتج بدون تصنيف'],
    ['رابط الصورة: اختياري، يبدأ بـ https://'],
    ['إذا كان الباركود أو الرمز موجوداً في النظام يتم تحديث المنتج — الخلايا الفارغة لا تمسح البيانات الموجودة'],
  ]);
  notes['!cols'] = [{ wch: 100 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'المنتجات');
  XLSX.utils.book_append_sheet(wb, notes, 'تعليمات');
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(wb, 'felsy-products-template.xlsx');
}
