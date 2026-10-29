// ══════════════════════════════════════════════════════════════════
// محرك الفوترة الإلكترونية — المرحلة الثانية (الربط مع منصة فاتورة)
// ──────────────────────────────────────────────────────────────────
// • كل الوصول للبيانات عبر دوال SQL (Db.rpc) ⇒ نفس الكود يشتغل في
//   Edge Function وفي اختبارات Deno مقابل Postgres محلي.
// • التوقيع والـ XML والـ QR من zatca-sdk (مُتحقق منه بالمدقق الرسمي للهيئة).
// • السلسلة (ICV/PIH) تُثبَّت بمقارنة وتبديل (zatca_commit) ⇒ لا تكرار للعداد
//   حتى لو أكثر من كاشير يبيعون بنفس اللحظة.
// • الإرسال: المبسطة ⇒ reporting (خلال 24 ساعة)، الضريبية ⇒ clearance.
// ══════════════════════════════════════════════════════════════════

import {
  signInvoice, generateKeyPair, generateCSR, ZATCAAPIClient,
  issueComplianceCSID, checkInvoiceCompliance, issueProductionCSID,
  reportInvoice, clearInvoice, parseCertificate,
} from './zatca/index.ts';
import { Buffer } from 'node:buffer';

export type Env = 'sandbox' | 'simulation' | 'production';
export interface Db { rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> }
export interface EngineOptions { baseUrl?: string; solutionName?: string }

export const GENESIS_PIH = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';
const SOLUTION = 'Felsy';

export class EngineError extends Error {
  constructor(message: string, public code = 'engine_error', public retryable = false) { super(message); }
}

// ── أدوات ──────────────────────────────────────────────────────────
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Number(v ?? 0);

/** وقت السعودية (UTC+3، بدون توقيت صيفي) */
export function ksaDateTime(iso: string | Date) {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`,
  };
}

const PAYMENT_CODE: Record<string, string> = {
  cash: '10', card: '48', mada: '48', visa: '48', mastercard: '48', applepay: '48', stcpay: '48',
  transfer: '42', bank: '42', credit: '30', online: '48',
};

// ── البائع من ملف الفرع ───────────────────────────────────────────
// deno-lint-ignore no-explicit-any
export function sellerFrom(egs: any) {
  return {
    registrationName: String(egs.business_name),
    vatNumber: String(egs.vat_number),
    ...(egs.cr_number ? { identification: { schemeId: 'CRN' as const, value: String(egs.cr_number) } } : {}),
    address: {
      street: String(egs.address_street), buildingNumber: String(egs.address_building),
      citySubdivision: String(egs.address_district), city: String(egs.address_city),
      postalCode: String(egs.address_postal), country: 'SA',
    },
  };
}

// ── المشتري (فاتورة الشركات B2B) من لقطة الإصدار ──────────────────
// deno-lint-ignore no-explicit-any
export function buyerFrom(b: any) {
  if (!b?.name) throw new EngineError('فاتورة الشركات بدون بيانات المشتري', 'buyer_missing');
  return {
    registrationName: String(b.name).slice(0, 1000),
    ...(b.vat_number ? { vatNumber: String(b.vat_number) } : {}),
    ...(!b.vat_number && b.cr_number ? { identification: { schemeId: 'CRN' as const, value: String(b.cr_number) } } : {}),
    address: {
      street: String(b.street), ...(b.additional ? { additionalStreet: String(b.additional) } : {}),
      buildingNumber: String(b.building), citySubdivision: String(b.district), city: String(b.city),
      postalCode: String(b.postal), country: 'SA',
    },
  };
}

// اسم الصنف: الهيئة تطلب 3 أحرف على الأقل (BR-KSA-F-06-C19)
const itemName = (n: unknown) => {
  const s = String(n || '').trim() || 'صنف';
  return (s.length < 3 ? `${s} - صنف` : s).slice(0, 1000);
};

// ── تحويل مستند فلسي (طلب أو إشعار دائن) لفاتورة UBL ───────────────
// الأسطر والفئات والخصم محسوبة في القاعدة بطريقة الهيئة (felsy_price_doc):
//   صافي السطر = صافي الوحدة × الكمية، ضريبة السطر = round(صافي × النسبة)
//   الخصم يتوزع على فئات الضريبة (AllowanceCharge لكل فئة)
// تم التحقق من كل الأشكال بالمدقق الرسمي: مبسطة/ضريبية، خصم، صفرية/معفاة/خارج النطاق.
// deno-lint-ignore no-explicit-any
export function buildInvoice(doc: any, egs: any, icv: number, pih: string, uuid: string) {
  // deno-lint-ignore no-explicit-any
  const items: any[] = Array.isArray(doc.items) ? doc.items : [];
  if (!items.length) throw new EngineError('المستند بدون أصناف', 'empty_doc');
  const lines = items.map((it, i) => {
    const cat = String(it.vat_category || (num(it.tax_rate ?? 15) === 0 ? 'O' : 'S')).toUpperCase() as 'S' | 'Z' | 'E' | 'O';
    if (!['S', 'Z', 'E', 'O'].includes(cat)) throw new EngineError('فئة ضريبية غير معروفة: ' + cat, 'bad_category');
    const rate = cat === 'S' ? 15 : 0;
    const qty = num(it.quantity ?? it.qty ?? 1);
    const unitNet = it.unit_net != null ? num(it.unit_net) : r2(num(it.price) / (1 + rate / 100));
    const lineNet = it.line_net != null ? num(it.line_net) : r2(unitNet * qty);
    const lineVat = it.line_vat != null ? num(it.line_vat) : r2(lineNet * rate / 100);
    return {
      id: String(i + 1), name: itemName(it.name || it.name_ar), quantity: qty, unitCode: 'PCE',
      unitPrice: unitNet, lineTotal: lineNet, vatCategory: cat, vatPercent: rate, vatAmount: lineVat,
      _code: cat === 'S' ? undefined : String(it.vat_exemption_code || (cat === 'O' ? 'VATEX-SA-OOS' : '')),
    };
  });
  const linesNet = r2(lines.reduce((s, l) => s + l.lineTotal, 0));

  // فئات الضريبة: من القاعدة (مع الخصم) أو تُجمع من الأسطر (مستندات قديمة)
  // deno-lint-ignore no-explicit-any
  let groups: any[] = Array.isArray(doc.breakdown) && doc.breakdown.length ? doc.breakdown : [];
  if (!groups.length) {
    const m = new Map<string, { category: string; rate: number; code?: string; reason?: string; taxable: number; tax: number; allowance: number }>();
    for (const l of lines) {
      const k = `${l.vatCategory}|${l._code ?? ''}`;
      const g = m.get(k) ?? { category: l.vatCategory, rate: l.vatPercent, code: l._code, taxable: 0, tax: 0, allowance: 0 };
      g.taxable = r2(g.taxable + l.lineTotal); g.tax = r2(g.tax + l.vatAmount); m.set(k, g);
    }
    groups = [...m.values()];
  }
  for (const g of groups) {
    if (g.category !== 'S' && !g.code) throw new EngineError('صنف معفى/صفري بدون رمز إعفاء', 'missing_exemption');
  }
  const allowances = groups.filter((g) => num(g.allowance) > 0)
    .map((g) => ({ amount: r2(num(g.allowance)), reason: 'خصم', vatCategory: g.category, vatPercent: num(g.rate) }));
  const allowanceTotal = r2(allowances.reduce((s, a) => s + a.amount, 0));
  const excl = r2(linesNet - allowanceTotal);
  const vat = r2(groups.reduce((s, g) => s + num(g.tax), 0));
  const inclusive = r2(excl + vat);
  const payable = r2(num(doc.total));
  const rounding = r2(payable - inclusive);
  if (doc.lines_net != null && Math.abs(num(doc.lines_net) - linesNet) > 0.001) {
    throw new EngineError('مجموع الأسطر لا يطابق المستند', 'totals_mismatch');
  }
  // الحد الأقصى المنطقي لفرق التقريب: نصف هللة لكل وحدة (+ هللة لكل سطر وكل فئة)
  const maxRounding = 0.006 * lines.reduce((s, l) => s + l.quantity, 0) + 0.01 * (lines.length + groups.length) + 0.01;
  if (Math.abs(rounding) > maxRounding) {
    throw new EngineError(`مجموع المستند لا يطابق الأسطر (فرق ${rounding})`, 'totals_mismatch');
  }
  const when = ksaDateTime(doc.issued_at);
  const isCredit = doc.kind === 'credit';
  const standard = Boolean(doc.is_b2b);
  return {
    id: String(doc.number), uuid, issueDate: when.date, issueTime: when.time,
    invoiceTypeCode: isCredit ? '381' : '388', invoiceSubType: standard ? '0100000' : '0200000',
    documentCurrency: 'SAR', taxCurrency: 'SAR', invoiceCounterValue: icv, previousInvoiceHash: pih,
    seller: sellerFrom(egs),
    ...(standard ? { buyer: buyerFrom(doc.buyer), actualDeliveryDate: when.date } : {}),
    paymentMeansCode: PAYMENT_CODE[String(doc.payment_method || '').toLowerCase()] ?? '10',
    ...(isCredit ? { billingReference: { invoiceId: String(doc.original_number) }, creditDebitReason: String(doc.reason || 'مرتجع').slice(0, 1000) } : {}),
    ...(allowances.length ? { allowances, allowanceTotalAmount: allowanceTotal } : {}),
    lineExtensionAmount: linesNet, taxExclusiveAmount: excl, taxInclusiveAmount: inclusive,
    ...(rounding !== 0 ? { payableRoundingAmount: rounding } : {}),
    payableAmount: payable, taxTotal: vat,
    taxSubtotals: groups.map((g) => ({
      taxableAmount: r2(num(g.taxable)), taxAmount: r2(num(g.tax)), taxCategory: g.category, taxPercent: num(g.rate),
      ...(g.category !== 'S' ? { exemptionReasonCode: String(g.code), exemptionReason: String(g.reason || EXEMPTION_TEXT[String(g.code)] || 'معفى') } : {}),
    })),
    lines: lines.map(({ _code, ...l }) => l),
  };
}

const EXEMPTION_TEXT: Record<string, string> = {
  'VATEX-SA-29': 'الخدمات المالية المعفاة (المادة 29)', 'VATEX-SA-29-7': 'عقود التأمين على الحياة (المادة 29)',
  'VATEX-SA-30': 'توريد العقارات السكنية المعفاة (المادة 30)', 'VATEX-SA-32': 'تصدير السلع (المادة 32)',
  'VATEX-SA-33': 'تصدير الخدمات (المادة 33)', 'VATEX-SA-34-1': 'النقل الدولي للسلع (المادة 34)',
  'VATEX-SA-34-2': 'النقل الدولي للركاب (المادة 34)', 'VATEX-SA-34-3': 'خدمات مرتبطة بالنقل الدولي للركاب (المادة 34)',
  'VATEX-SA-34-4': 'توريد وسائل النقل المؤهلة (المادة 34)', 'VATEX-SA-34-5': 'خدمات مرتبطة بنقل السلع أو الركاب (المادة 34)',
  'VATEX-SA-35': 'الأدوية والمعدات الطبية (المادة 35)', 'VATEX-SA-36': 'المعادن المؤهلة (المادة 36)',
  'VATEX-SA-MLTRY': 'السلع العسكرية المؤهلة', 'VATEX-SA-OOS': 'خارج نطاق ضريبة القيمة المضافة',
};

/** QR الفاتورة المعتمدة من الهيئة (فواتير الشركات) — من الـ XML المعتمد */
export function qrFromXml(xml: string): string | null {
  const m = xml.match(/<cbc:ID>QR<\/cbc:ID>\s*<cac:Attachment>\s*<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)<\/cbc:EmbeddedDocumentBinaryObject>/);
  return m ? m[1].trim() : null;
}

function credentialsOf(egs: Record<string, string>, env: Env) {
  if (!egs.private_key || !egs.pcsid || !egs.production_secret) {
    throw new EngineError('الفرع غير مربوط بالهيئة بعد — أكمل الربط من الإعدادات', 'not_onboarded');
  }
  return { certificate: egs.pcsid, privateKey: egs.private_key, secret: egs.production_secret, env };
}

// ── التوقيع وتثبيت المستند في السلسلة ───────────────────────────────
// deno-lint-ignore no-explicit-any
export async function signDoc(db: Db, kind: 'invoice' | 'credit', id: string): Promise<{ zdoc: string; signed: any; reused: boolean }> {
  for (let attempt = 0; attempt < 40; attempt++) {
    // تعارض مع كاشير آخر ⇒ انتظار عشوائي قصير يتزايد (يمنع التصادم المتكرر)
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.min(400, 15 * attempt) + Math.random() * 40 * attempt));
    // deno-lint-ignore no-explicit-any
    const doc: any = await db.rpc('zatca_load_doc', { p_kind: kind, p_id: id });
    if (!doc) throw new EngineError('المستند غير موجود أو ما صدر', 'doc_missing');
    if (doc.zatca_invoice_id) {
      // deno-lint-ignore no-explicit-any
      const s: any = await db.rpc('zatca_load_signed', { p_doc: doc.zatca_invoice_id });
      return { zdoc: doc.zatca_invoice_id, signed: s, reused: true };
    }
    // deno-lint-ignore no-explicit-any
    const egs: any = await db.rpc('zatca_load_egs', { p_branch: doc.branch_id });
    if (!egs || egs.onboarding_status !== 'active') throw new EngineError('الفرع غير مربوط بالهيئة', 'not_onboarded');
    const env = egs.environment as Env;
    const cred = credentialsOf(egs, env);
    const icv = Number(egs.invoice_counter || 0) + 1;
    const pih = egs.last_invoice_hash || GENESIS_PIH;
    const uuid = crypto.randomUUID();
    const inv = buildInvoice(doc, egs, icv, pih, uuid);
    // deno-lint-ignore no-explicit-any
    const s: any = await signInvoice(inv as any, {
      credentials: { certificate: cred.certificate, privateKey: cred.privateKey },
      skipQrImage: true, allowCertificateKeyMismatch: env === 'sandbox',
    });
    if (!s.success) throw new EngineError('فشل التوقيع: ' + s.error.message, 'sign_failed');
    try {
      const zdoc = await db.rpc<string>('zatca_commit', {
        p_branch: doc.branch_id, p_icv: icv, p_hash: s.data.invoiceHash, p_kind: kind, p_id: id,
        d: {
          uuid, number: inv.id, type_code: inv.invoiceTypeCode, subtype: inv.invoiceSubType,
          issue_date: inv.issueDate, issue_time: inv.issueTime, subtotal: inv.taxExclusiveAmount,
          tax_amount: inv.taxTotal, total: inv.payableAmount, pih, qr: s.data.qrTlvBase64, xml: s.data.signedXml,
          lines: inv.lines,
        },
      });
      return {
        zdoc, reused: false,
        signed: { id: zdoc, uuid, hash: s.data.invoiceHash, xml: s.data.signedXml, subtype: inv.invoiceSubType, qr: s.data.qrTlvBase64, number: inv.id, counter: icv, branch_id: doc.branch_id },
      };
    } catch (e) {
      const m = String((e as Error)?.message || e);
      if (m.includes('chain_conflict')) continue;          // كاشير ثاني سبقنا — نعيد بالرأس الجديد
      if (m.includes('already_signed')) continue;          // توقّع بالتوازي — نرجع المحفوظ
      throw e;
    }
  }
  throw new EngineError('تعذر حجز رقم في السلسلة — حاول مرة ثانية', 'chain_busy', true);
}

// ── الإرسال للهيئة ────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
export async function submitSigned(db: Db, signed: any, opts: EngineOptions = {}) {
  // deno-lint-ignore no-explicit-any
  const egs: any = await db.rpc('zatca_load_egs', { p_branch: signed.branch_id });
  const cred = credentialsOf(egs, egs.environment);
  const api = new ZATCAAPIClient({ env: cred.env, certificate: cred.certificate, secret: cred.secret, baseUrl: opts.baseUrl, language: 'ar' });
  const req = { invoiceHash: signed.hash, uuid: signed.uuid, invoice: Buffer.from(signed.xml, 'utf8').toString('base64') };
  const standard = String(signed.subtype || '').startsWith('01');
  const res = standard ? await clearInvoice(api, req) : await reportInvoice(api, req);

  // deno-lint-ignore no-explicit-any
  let status: string; let warnings: any = null; let errors: any = null; let clearedXml: string | null = null; let clearedQr: string | null = null;
  if (res.success) {
    // deno-lint-ignore no-explicit-any
    const v: any = res.data.validationResults;
    warnings = v?.warningMessages?.length ? v.warningMessages : null;
    // deno-lint-ignore no-explicit-any
    const ok = standard ? (res.data as any).clearanceStatus === 'CLEARED' : (res.data as any).reportingStatus === 'REPORTED';
    status = ok ? (standard ? 'cleared' : 'reported') + (warnings ? '_warnings' : '') : 'rejected';
    if (!ok) errors = v?.errorMessages ?? null;
    // deno-lint-ignore no-explicit-any
    const ci = (res.data as any).clearedInvoice;
    if (standard && ci) {
      clearedXml = Buffer.from(ci, 'base64').toString('utf8');
      clearedQr = qrFromXml(clearedXml);   // QR الهيئة هو اللي ينطبع على فاتورة الشركات
    }
  } else {
    // deno-lint-ignore no-explicit-any
    const err: any = res.error;
    const code = Number(err?.statusCode ?? 0);
    // 400 = رفض تحقق (لا يُعاد تلقائياً) — 0/401/429/5xx = مؤقت ⇒ إعادة محاولة
    const vr = err?.response?.validationResults;
    errors = vr?.errorMessages ?? err?.zatcaErrors ?? [{ message: err?.message }];
    warnings = vr?.warningMessages ?? null;
    // الهيئة ترجع 409 إذا المستند مرسل من قبل ⇒ نعتبره مُبلّغ
    if (code === 409) status = standard ? 'cleared' : 'reported';
    else status = code === 400 ? 'rejected' : 'error';
  }
  await db.rpc('zatca_mark', { p_doc: signed.id, p_status: status, p_warnings: warnings, p_errors: errors, p_cleared_xml: clearedXml, p_qr: clearedQr });
  return { status, warnings, errors, qr: clearedQr };
}

/** إصدار كامل: توقيع + إرسال. يرجع QR المرحلة الثانية للطباعة
 *  (فاتورة الشركات: QR الهيئة بعد الاعتماد — وقبل الاعتماد ما تنطبع) */
export async function issue(db: Db, kind: 'invoice' | 'credit', id: string, opts: EngineOptions = {}) {
  const { signed, reused } = await signDoc(db, kind, id);
  let result = { status: signed.status ?? 'signed', warnings: null as unknown, errors: null as unknown, qr: null as string | null };
  if (!reused || ['signed', 'error'].includes(signed.status)) {
    result = await submitSigned(db, signed, opts);
  }
  const standard = String(signed.subtype || '').startsWith('01');
  const cleared = String(result.status).startsWith('cleared');
  return {
    number: signed.number, counter: signed.counter, standard, ...result,
    qr: standard ? (cleared ? (result.qr || signed.qr) : null) : signed.qr,
  };
}

/** دورة الإعادة (كل بضع دقائق): يوقّع الصادر غير الموقّع ويرسل المعلّق */
export async function processPending(db: Db, opts: EngineOptions = {}, limit = 50) {
  // deno-lint-ignore no-explicit-any
  const rows: any[] = (await db.rpc('zatca_pending', { p_limit: limit })) || [];
  const out = { processed: 0, ok: 0, failed: 0, errors: [] as string[] };
  for (const r of rows) {
    out.processed++;
    try {
      if (r.zatca_doc) {
        const s = await db.rpc('zatca_load_signed', { p_doc: r.zatca_doc });
        const res = await submitSigned(db, s, opts);
        if (res.status === 'error' || res.status === 'rejected') out.failed++; else out.ok++;
      } else {
        const res = await issue(db, r.kind, r.id, opts);
        if (res.status === 'error' || res.status === 'rejected') out.failed++; else out.ok++;
      }
    } catch (e) {
      out.failed++; out.errors.push(`${r.kind}:${r.id}: ${(e as Error).message}`);
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════
// الربط (Onboarding): مفاتيح + CSR ⇒ شهادة امتثال ⇒ فحوصات الامتثال
// (فاتورة + إشعار دائن + إشعار مدين لكل نوع معلن) ⇒ الشهادة الإنتاجية
// ══════════════════════════════════════════════════════════════════
// deno-lint-ignore no-explicit-any
function sampleDocs(egs: any, types: string) {
  const base = (kind: '388' | '381' | '383', sub: string, n: number) => {
    const lines = [{ id: '1', name: 'صنف تجريبي', quantity: 2, unitCode: 'PCE', unitPrice: 10, lineTotal: 20, vatCategory: 'S' as const, vatPercent: 15, vatAmount: 3 }];
    const t = ksaDateTime(new Date());
    return {
      id: `COMPLIANCE-${n}`, uuid: crypto.randomUUID(), issueDate: t.date, issueTime: t.time,
      invoiceTypeCode: kind, invoiceSubType: sub, documentCurrency: 'SAR', taxCurrency: 'SAR',
      invoiceCounterValue: n, previousInvoiceHash: GENESIS_PIH, seller: sellerFrom(egs), paymentMeansCode: '10',
      ...(kind !== '388' ? { billingReference: { invoiceId: 'COMPLIANCE-1' }, creditDebitReason: 'تصحيح' } : {}),
      ...(sub.startsWith('01') ? {
        buyer: { registrationName: 'عميل تجريبي', vatNumber: '399999999800003',
          address: { street: 'شارع تجريبي', buildingNumber: '1111', citySubdivision: 'حي', city: 'الرياض', postalCode: '12222', country: 'SA' } },
        actualDeliveryDate: t.date,
      } : {}),
      lineExtensionAmount: 20, taxExclusiveAmount: 20, taxInclusiveAmount: 23, payableAmount: 23, taxTotal: 3,
      taxSubtotals: [{ taxableAmount: 20, taxAmount: 3, taxCategory: 'S' as const, taxPercent: 15 }], lines,
    };
  };
  const docs = [];
  let n = 1;
  if (types[1] === '1') for (const k of ['388', '381', '383'] as const) docs.push(base(k, '0200000', n++));
  if (types[0] === '1') for (const k of ['388', '381', '383'] as const) docs.push(base(k, '0100000', n++));
  return docs;
}

export interface OnboardStep { step: string; ok: boolean; detail?: string }

// deno-lint-ignore no-explicit-any
export async function onboardEgs(egs: any, otp: string, env: Env, opts: EngineOptions = {}) {
  const steps: OnboardStep[] = [];
  const egsUuid = egs.egs_uuid || crypto.randomUUID();
  const types = egs.invoice_types || '0100';
  const keys = generateKeyPair();
  if (!keys.success) throw new EngineError('تعذر توليد المفاتيح');
  const cn = env === 'sandbox' ? `TST-886431145-${egs.vat_number}` : `${SOLUTION}-${String(egsUuid).slice(0, 8)}-${egs.vat_number}`;
  const csr = generateCSR({
    commonName: cn, organizationName: String(egs.business_name).slice(0, 64),
    organizationUnit: String(egs.branch_name || 'Main').slice(0, 64), countryCode: 'SA',
    egsSerialNumber: `1-${opts.solutionName || SOLUTION}|2-POS|3-${egsUuid}`, vatNumber: egs.vat_number,
    invoiceType: types, location: egs.short_address || `${egs.address_building} ${egs.address_street}`.slice(0, 64),
    industry: egs.industry || 'Food',
  }, keys.data.privateKey, env);
  if (!csr.success) throw new EngineError('CSR: ' + csr.error.message);
  steps.push({ step: 'csr', ok: true });

  const anon = new ZATCAAPIClient({ env, baseUrl: opts.baseUrl, language: 'ar' });
  const cc = await issueComplianceCSID(anon, csr.data.base64, otp);
  if (!cc.success) {
    // deno-lint-ignore no-explicit-any
    const e: any = cc.error;
    steps.push({ step: 'compliance_csid', ok: false, detail: `${e.statusCode ?? ''} ${e.message}` });
    return { ok: false, steps };
  }
  steps.push({ step: 'compliance_csid', ok: true });

  const compClient = new ZATCAAPIClient({ env, baseUrl: opts.baseUrl, certificate: cc.data.binarySecurityToken, secret: cc.data.secret, language: 'ar' });
  let pih = GENESIS_PIH;
  for (const d of sampleDocs(egs, types)) {
    // deno-lint-ignore no-explicit-any
    const s: any = await signInvoice({ ...d, previousInvoiceHash: pih } as any, {
      credentials: { certificate: cc.data.binarySecurityToken, privateKey: keys.data.privateKey },
      skipQrImage: true, allowCertificateKeyMismatch: env === 'sandbox',
    });
    if (!s.success) { steps.push({ step: `check_${d.invoiceTypeCode}_${d.invoiceSubType}`, ok: false, detail: s.error.message }); return { ok: false, steps }; }
    const r = await checkInvoiceCompliance(compClient, { invoiceHash: s.data.invoiceHash, uuid: s.data.uuid, invoice: Buffer.from(s.data.signedXml).toString('base64') });
    // deno-lint-ignore no-explicit-any
    const v: any = r.success ? r.data.validationResults : (r.error as any)?.response?.validationResults;
    const ok = r.success && v?.status !== 'ERROR';
    steps.push({ step: `check_${d.invoiceTypeCode}_${d.invoiceSubType}`, ok, detail: ok ? v?.status : JSON.stringify(v?.errorMessages ?? (r as any).error?.message).slice(0, 500) });
    if (!ok) return { ok: false, steps };
    pih = s.data.invoiceHash;
  }

  const pc = await issueProductionCSID(compClient, cc.data.requestId);
  if (!pc.success) {
    // deno-lint-ignore no-explicit-any
    const e: any = pc.error;
    steps.push({ step: 'production_csid', ok: false, detail: `${e.statusCode ?? ''} ${e.message}` });
    return { ok: false, steps };
  }
  steps.push({ step: 'production_csid', ok: true });
  let expires: string | undefined;
  try {
    // deno-lint-ignore no-explicit-any
    const cert: any = parseCertificate(pc.data.binarySecurityToken);
    expires = cert?.success ? cert.data?.notAfter ?? cert.data?.validTo : undefined;
  } catch { /* اختياري */ }
  return {
    ok: true, steps,
    store: {
      environment: env, onboarding_status: 'active', onboarding_error: null, egs_uuid: egsUuid,
      private_key: keys.data.privateKey, csr: csr.data.base64,
      compliance_certificate: cc.data.binarySecurityToken, compliance_secret: cc.data.secret, compliance_request_id: String(cc.data.requestId),
      production_certificate: pc.data.binarySecurityToken, production_secret: pc.data.secret,
      ...(expires ? { production_expires_at: new Date(expires).toISOString() } : {}),
      reset_chain: true,
    },
  };
}

// ══════════════════════════════════════════════════════════════════
// اختبار ذاتي على بيئة المطورين الحقيقية لهيئة الزكاة (developer-portal)
// بهوية اختبارية — لا يكتب شيء في القاعدة ولا يرسل فواتير حقيقية.
// يثبت: الاتصال من سيرفرك + قبول الهيئة لشكل فواتير فلسي وتوقيعها.
// ══════════════════════════════════════════════════════════════════
export async function sandboxSelfTest(opts: EngineOptions = {}) {
  const test = {
    business_name: 'Felsy Self-Test', vat_number: '399999999900003', cr_number: '1010010000', branch_name: 'Main',
    address_street: 'King Fahd Road', address_building: '2322', address_district: 'Al Olaya', address_city: 'Riyadh',
    address_postal: '12211', short_address: 'RRRD2929', industry: 'Food', invoice_types: '0100',
  };
  const ob = await onboardEgs(test, '123345', 'sandbox', opts);
  if (!ob.ok || !ob.store) return { ok: false, steps: ob.steps };
  const st = ob.store;
  // فاتورة مبسطة بنفس طريقة فلسي (سعر شامل 12 × 3 + 11.50)
  const doc = {
    kind: 'invoice', number: 'SELFTEST-1', issued_at: new Date().toISOString(), payment_method: 'cash', total: 47.5,
    items: [{ name: 'شاي', quantity: 3, price: 12, unit_net: 10.43, line_net: 31.29, line_vat: 4.69, tax_rate: 15 },
            { name: 'لاتيه', quantity: 1, price: 11.5, unit_net: 10, line_net: 10, line_vat: 1.5, tax_rate: 15 }],
  };
  const inv = buildInvoice(doc, test, 1, GENESIS_PIH, crypto.randomUUID());
  // deno-lint-ignore no-explicit-any
  const s: any = await signInvoice(inv as any, {
    credentials: { certificate: st.production_certificate, privateKey: st.private_key }, skipQrImage: true, allowCertificateKeyMismatch: true,
  });
  if (!s.success) return { ok: false, steps: [...ob.steps, { step: 'sign', ok: false, detail: s.error.message }] };
  const api = new ZATCAAPIClient({ env: 'sandbox', certificate: st.production_certificate, secret: st.production_secret, baseUrl: opts.baseUrl, language: 'ar' });
  const r = await reportInvoice(api, { invoiceHash: s.data.invoiceHash, uuid: s.data.uuid, invoice: Buffer.from(s.data.signedXml).toString('base64') });
  // deno-lint-ignore no-explicit-any
  const rd: any = r.success ? r.data : (r.error as any)?.response;
  const ok = r.success && rd?.reportingStatus === 'REPORTED';
  return {
    ok,
    steps: [...ob.steps, { step: 'report_simplified', ok, detail: `${rd?.reportingStatus ?? ''} ${rd?.validationResults?.status ?? ''} ${JSON.stringify(rd?.validationResults?.warningMessages ?? rd?.validationResults?.errorMessages ?? (r as any).error?.message ?? '').slice(0, 600)}` }],
  };
}
