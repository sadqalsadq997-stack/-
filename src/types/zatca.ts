/**
 * ═══════════════════════════════════════════════════════════════════════════
 * أنواع بيانات ZATCA Phase 2 — TypeScript Types
 * تُستخدم في جميع أجزاء النظام المرتبطة بـ ZATCA
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── بيئة التشغيل ──────────────────────────────────────────────────────────
export type ZATCAEnvironment = "sandbox" | "simulation" | "production";

// ── حالة التسجيل (Onboarding Status) ─────────────────────────────────────
export type ZATCAOnboardingStatus =
  | "not_started"
  | "otp_requested"
  | "otp_verified"
  | "csr_generated"
  | "compliance_csid_issued"
  | "production_csid_issued"
  | "active"
  | "failed";

// ── حالة الفاتورة ─────────────────────────────────────────────────────────
export type ZATCAInvoiceStatus =
  | "pending"
  | "reported"
  | "cleared"
  | "rejected"
  | "cancelled"
  | "error";

// ── نوع الفاتورة ──────────────────────────────────────────────────────────
export type ZATCAInvoiceType = "simplified" | "standard" | "credit_note" | "debit_note";

// ── نوع سجل ZATCA ─────────────────────────────────────────────────────────
export type ZATCALogType =
  | "otp_request"
  | "otp_verify"
  | "csr_generate"
  | "csid_issue"
  | "pcsid_issue"
  | "invoice_report"
  | "invoice_clearance"
  | "invoice_cancel"
  | "certificate_renew"
  | "api_error"
  | "validation_error";

// ══════════════════════════════════════════════════════════════════════════
// إعدادات ZATCA (بدون بيانات حساسة — للـ Frontend)
// ══════════════════════════════════════════════════════════════════════════
export interface ZATCAConfig {
  id:                    string;
  branch_id:             string;

  // بيانات المنشأة
  business_name:         string;
  business_name_ar?:     string;
  vat_number:            string;
  cr_number?:            string;
  branch_name?:          string;
  branch_name_ar?:       string;
  address_street?:       string;
  address_building?:     string;
  address_city?:         string;
  address_postal?:       string;
  address_country?:      string;
  address_district?:     string;

  // بيئة التشغيل
  environment:           ZATCAEnvironment;

  // حالة التسجيل
  onboarding_status:     ZATCAOnboardingStatus;
  onboarding_error?:     string;
  onboarding_step:       number;

  // بيانات الشهادة (آمنة - بدون secrets)
  csid_expires_at?:      string;
  pcsid_expires_at?:     string;
  csid_issued_at?:       string;
  pcsid_issued_at?:      string;
  cert_serial?:          string;

  // عداد الفواتير
  invoice_counter:       number;

  // طوابع زمنية
  created_at:            string;
  updated_at:            string;
}

// ── نموذج إعداد ZATCA (للحفظ) ────────────────────────────────────────────
export interface ZATCAConfigForm {
  business_name:    string;
  business_name_ar: string;
  vat_number:       string;
  cr_number:        string;
  branch_name:      string;
  address_street:   string;
  address_building: string;
  address_city:     string;
  address_postal:   string;
  address_country:  string;
  address_district: string;
  environment:      ZATCAEnvironment;
}

// ══════════════════════════════════════════════════════════════════════════
// فاتورة ZATCA (للعرض في الـ Frontend)
// ══════════════════════════════════════════════════════════════════════════
export interface ZATCAInvoice {
  id:                     string;
  branch_id:              string;
  order_id?:              string;

  // بيانات الفاتورة
  invoice_uuid:           string;
  invoice_number:         string;
  invoice_type:           ZATCAInvoiceType;
  invoice_subtype?:       string;
  issue_date:             string;
  issue_time:             string;

  // البائع
  seller_name:            string;
  seller_vat:             string;
  seller_cr?:             string;
  seller_city?:           string;

  // المشتري
  buyer_name?:            string;
  buyer_vat?:             string;

  // المبالغ
  subtotal:               number;
  discount_amount:        number;
  vat_amount:             number;
  total:                  number;
  vat_rate:               number;

  // البنود
  line_items?:            ZATCALineItem[];

  // Hash والتوقيع (للعرض فقط)
  invoice_hash?:          string;
  qr_code?:               string;

  // حالة ZATCA
  zatca_status:           ZATCAInvoiceStatus;
  zatca_submission_id?:   string;
  zatca_warnings?:        ZATCAMessage[];
  zatca_errors?:          ZATCAMessage[];
  zatca_submitted_at?:    string;
  zatca_cleared_at?:      string;

  // الإلغاء
  is_cancelled:           boolean;
  cancel_reason?:         string;

  // طوابع زمنية
  created_at:             string;
  updated_at:             string;
}

// ── بند الفاتورة ──────────────────────────────────────────────────────────
export interface ZATCALineItem {
  id:           number;
  name:         string;
  quantity:     number;
  unitCode:     string;
  unitPrice:    number;
  lineTotal:    number;
  vatRate:      number;
  vatAmount:    number;
  vatCategory:  string;
  discount?:    number;
}

// ── رسالة ZATCA (تحذير أو خطأ) ───────────────────────────────────────────
export interface ZATCAMessage {
  type?:    string;
  code?:    string;
  message:  string;
  detail?:  string;
}

// ══════════════════════════════════════════════════════════════════════════
// طلب إنشاء فاتورة ZATCA
// ══════════════════════════════════════════════════════════════════════════
export interface ZATCAInvoiceRequest {
  branchId:     string;
  orderId?:     string;
  invoiceData: {
    invoiceType:    ZATCAInvoiceType;
    buyer?: {
      name?:       string;
      vatNumber?:  string;
      address?:    string;
    };
    items:          ZATCALineItem[];
    subtotal:       number;
    discountTotal:  number;
    vatAmount:      number;
    total:          number;
    paymentMethod:  "cash" | "card" | "bank_transfer" | "other";
  };
}

// ── استجابة إنشاء الفاتورة ────────────────────────────────────────────────
export interface ZATCAInvoiceResponse {
  success:          boolean;
  invoiceId?:       string;
  invoiceUuid?:     string;
  invoiceNumber?:   string;
  invoiceHash?:     string;
  qrCode?:          string;
  zatcaStatus?:     ZATCAInvoiceStatus;
  submissionId?:    string;
  clearanceStamp?:  string;
  warnings?:        ZATCAMessage[];
  errors?:          ZATCAMessage[];
  message?:         string;
  error?:           string;
}

// ══════════════════════════════════════════════════════════════════════════
// لوحة مراقبة ZATCA (Admin Dashboard)
// ══════════════════════════════════════════════════════════════════════════
export interface ZATCADashboardItem {
  branch_id:        string;
  branch_name:      string;
  vat_number?:      string;
  environment:      ZATCAEnvironment;
  onboarding_status: ZATCAOnboardingStatus;
  onboarding_error?: string;
  onboarding_step:  number;
  csid_expires_at?: string;
  pcsid_expires_at?: string;
  invoice_counter:  number;
  last_updated:     string;

  // إحصائيات
  total_invoices:   number;
  reported_count:   number;
  cleared_count:    number;
  rejected_count:   number;
  pending_count:    number;
  error_count:      number;

  // صحة الشهادة
  cert_health: "valid" | "expiring_soon" | "expired" | "not_issued";
}

// ══════════════════════════════════════════════════════════════════════════
// سجل ZATCA (للعرض)
// ══════════════════════════════════════════════════════════════════════════
export interface ZATCALog {
  id:             string;
  branch_id?:     string;
  log_type:       ZATCALogType;
  direction:      "request" | "response" | "internal";
  endpoint?:      string;
  status_code?:   number;
  error_message?: string;
  duration_ms?:   number;
  invoice_uuid?:  string;
  created_at:     string;
}

// ══════════════════════════════════════════════════════════════════════════
// نتائج خطوات Onboarding
// ══════════════════════════════════════════════════════════════════════════
export interface ZATCAOnboardingStepResult {
  success:   boolean;
  message?:  string;
  error?:    string;
  data?:     Record<string, unknown>;
}

// ── خطوات Onboarding ─────────────────────────────────────────────────────
export interface ZATCAOnboardingStep {
  id:          number;
  label:       string;
  status:      "pending" | "active" | "completed" | "failed";
  description?: string;
}

// ── حالة صحة الشهادة ─────────────────────────────────────────────────────
export type CertHealth = "valid" | "expiring_soon" | "expired" | "not_issued";

// ── ملخص حالة ZATCA ───────────────────────────────────────────────────────
export interface ZATCAStatusSummary {
  isActive:          boolean;
  environment:       ZATCAEnvironment;
  onboardingStatus:  ZATCAOnboardingStatus;
  certHealth:        CertHealth;
  daysUntilExpiry?:  number;
  invoiceCount:      number;
  lastActivity?:     string;
}

// ── الاستجابة العامة من Edge Functions ───────────────────────────────────
export interface ZATCAApiResponse<T = unknown> {
  success?: boolean;
  error?:   string;
  data?:    T;
  message?: string;
}
