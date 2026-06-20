/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ZATCA Service — طبقة الخدمات لـ ZATCA Phase 2
 *
 * جميع العمليات الحساسة تُنفَّذ عبر Supabase Edge Functions
 * لا يُخزَّن أي مفتاح خاص أو شهادة في الـ Frontend
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  ZATCAConfig,
  ZATCAConfigForm,
  ZATCAInvoiceRequest,
  ZATCAInvoiceResponse,
  ZATCADashboardItem,
  ZATCALog,
  ZATCAOnboardingStepResult,
  ZATCAInvoice,
  ZATCAStatusSummary,
} from "@/types/zatca";

// ══════════════════════════════════════════════════════════════════════════
// استدعاء Edge Functions بأمان
// ══════════════════════════════════════════════════════════════════════════

async function callEdgeFunction(
  functionName: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  if (error) {
    throw new Error(`Edge function error (${functionName}): ${error.message}`);
  }

  return data;
}

// ══════════════════════════════════════════════════════════════════════════
// إعدادات ZATCA (CRUD)
// ══════════════════════════════════════════════════════════════════════════

/**
 * حفظ أو تحديث إعدادات ZATCA للفرع
 * OWASP: التحقق من صحة المدخلات قبل الحفظ
 */
export async function saveZATCAConfig(
  branchId: string,
  form: ZATCAConfigForm
): Promise<{ success: boolean; error?: string }> {
  // التحقق من صحة رقم الضريبة (15 رقم يبدأ بـ 3)
  if (!/^3[0-9]{14}$/.test(form.vat_number)) {
    return { success: false, error: "رقم الضريبة يجب أن يكون 15 رقماً ويبدأ بـ 3" };
  }

  // التحقق من رقم السجل التجاري (10 أرقام)
  if (form.cr_number && !/^[0-9]{10}$/.test(form.cr_number)) {
    return { success: false, error: "رقم السجل التجاري يجب أن يكون 10 أرقام" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("zatca_config")
    .upsert({
      branch_id:        branchId,
      business_name:    form.business_name.trim(),
      business_name_ar: form.business_name_ar?.trim(),
      vat_number:       form.vat_number.trim(),
      cr_number:        form.cr_number?.trim(),
      branch_name:      form.branch_name?.trim(),
      address_street:   form.address_street?.trim(),
      address_building: form.address_building?.trim(),
      address_city:     form.address_city?.trim() || "الرياض",
      address_postal:   form.address_postal?.trim(),
      address_country:  form.address_country?.trim() || "SA",
      address_district: form.address_district?.trim(),
      environment:      form.environment,
    }, {
      onConflict: "branch_id",
    });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * جلب إعدادات ZATCA للفرع (بدون بيانات حساسة)
 */
export async function getZATCAConfig(branchId: string): Promise<ZATCAConfig | null> {
  const { data, error } = await supabase
    .from("zatca_config")
    .select(`
      id, branch_id, business_name, business_name_ar,
      vat_number, cr_number, branch_name, branch_name_ar,
      address_street, address_building, address_city,
      address_postal, address_country, address_district,
      environment, onboarding_status, onboarding_error,
      onboarding_step, csid_expires_at, pcsid_expires_at,
      csid_issued_at, pcsid_issued_at, cert_serial,
      invoice_counter, created_at, updated_at
    `)
    .eq("branch_id", branchId)
    .single();

  if (error) return null;
  return data as ZATCAConfig;
}

// ══════════════════════════════════════════════════════════════════════════
// خطوات Onboarding (تُنفَّذ في Edge Functions)
// ══════════════════════════════════════════════════════════════════════════

/**
 * الخطوة 1: طلب OTP من ZATCA
 */
export async function requestOTP(branchId: string): Promise<ZATCAOnboardingStepResult> {
  try {
    const result = await callEdgeFunction("zatca-onboarding", {
      action: "request_otp",
      branchId,
    });
    return result as unknown as ZATCAOnboardingStepResult;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "خطأ غير معروف" };
  }
}

/**
 * الخطوة 2: التحقق من OTP
 */
export async function verifyOTP(
  branchId: string,
  otp: string
): Promise<ZATCAOnboardingStepResult> {
  if (!otp || otp.trim().length === 0) {
    return { success: false, error: "يرجى إدخال OTP" };
  }

  try {
    const result = await callEdgeFunction("zatca-onboarding", {
      action: "verify_otp",
      branchId,
      otp: otp.trim(),
    });
    return result as unknown as ZATCAOnboardingStepResult;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "خطأ في التحقق" };
  }
}

/**
 * الخطوة 3: إنشاء CSR
 * المفتاح الخاص يُنشأ ويُخزَّن في الـ Backend فقط
 */
export async function generateCSR(branchId: string): Promise<ZATCAOnboardingStepResult> {
  try {
    const result = await callEdgeFunction("zatca-onboarding", {
      action: "generate_csr",
      branchId,
    });
    return result as unknown as ZATCAOnboardingStepResult;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "خطأ في إنشاء CSR" };
  }
}

/**
 * الخطوة 4: الحصول على Compliance CSID
 */
export async function getComplianceCsid(branchId: string): Promise<ZATCAOnboardingStepResult> {
  try {
    const result = await callEdgeFunction("zatca-onboarding", {
      action: "compliance_csid",
      branchId,
    });
    return result as unknown as ZATCAOnboardingStepResult;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "خطأ في إصدار CSID" };
  }
}

/**
 * الخطوة 5: الحصول على Production CSID
 * هذا يُفعّل الفرع بالكامل مع ZATCA
 */
export async function getProductionCsid(branchId: string): Promise<ZATCAOnboardingStepResult> {
  try {
    const result = await callEdgeFunction("zatca-onboarding", {
      action: "production_csid",
      branchId,
    });
    return result as unknown as ZATCAOnboardingStepResult;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "خطأ في إصدار PCSID" };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// إدارة الفواتير
// ══════════════════════════════════════════════════════════════════════════

/**
 * إنشاء وإرسال فاتورة لـ ZATCA
 * يتضمن: بناء XML + التوقيع + QR + الإرسال
 */
export async function submitInvoice(
  request: ZATCAInvoiceRequest
): Promise<ZATCAInvoiceResponse> {
  try {
    // التحقق من صحة البيانات
    const errors = validateInvoiceRequest(request);
    if (errors.length > 0) {
      return { success: false, error: errors.join(", ") };
    }

    const result = await callEdgeFunction("zatca-invoice", {
      action: "report_invoice",
      ...request,
    });

    return result as unknown as ZATCAInvoiceResponse;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "خطأ في إنشاء الفاتورة",
    };
  }
}

/**
 * جلب فواتير ZATCA للفرع
 */
export async function getZATCAInvoices(
  branchId: string,
  options?: {
    status?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ data: ZATCAInvoice[]; count: number }> {
  let query = supabase
    .from("zatca_invoices")
    .select("*", { count: "exact" })
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (options?.status)   query = query.eq("zatca_status", options.status);
  if (options?.fromDate) query = query.gte("issue_date", options.fromDate);
  if (options?.toDate)   query = query.lte("issue_date", options.toDate);
  if (options?.limit)    query = query.limit(options.limit);
  if (options?.offset)   query = query.range(options.offset, (options.offset + (options.limit || 10)) - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  return { data: (data || []) as unknown as ZATCAInvoice[], count: count || 0 };
}

/**
 * جلب فاتورة ZATCA واحدة
 */
export async function getZATCAInvoice(invoiceId: string): Promise<ZATCAInvoice | null> {
  const { data, error } = await supabase
    .from("zatca_invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (error) return null;
  return data as unknown as ZATCAInvoice;
}

// ══════════════════════════════════════════════════════════════════════════
// لوحة المراقبة (Admin Dashboard)
// ══════════════════════════════════════════════════════════════════════════

/**
 * جلب بيانات لوحة مراقبة ZATCA لجميع الفروع
 */
export async function getZATCADashboard(): Promise<ZATCADashboardItem[]> {
  const { data, error } = await supabase
    .from("v_zatca_dashboard")
    .select("*")
    .order("branch_name");

  if (error) throw error;
  return (data || []) as ZATCADashboardItem[];
}

/**
 * جلب سجلات ZATCA
 */
export async function getZATCALogs(
  branchId?: string,
  limit = 100
): Promise<ZATCALog[]> {
  let query = supabase
    .from("zatca_logs")
    .select("id, branch_id, log_type, direction, endpoint, status_code, error_message, duration_ms, invoice_uuid, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (branchId) query = query.eq("branch_id", branchId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ZATCALog[];
}

// ══════════════════════════════════════════════════════════════════════════
// دوال مساعدة
// ══════════════════════════════════════════════════════════════════════════

/**
 * ملخص حالة ZATCA للفرع
 */
export function getZATCAStatusSummary(config: ZATCAConfig | null): ZATCAStatusSummary {
  if (!config) {
    return {
      isActive: false,
      environment: "sandbox",
      onboardingStatus: "not_started",
      certHealth: "not_issued",
      invoiceCount: 0,
    };
  }

  let certHealth: ZATCAStatusSummary["certHealth"] = "not_issued";
  let daysUntilExpiry: number | undefined;

  if (config.pcsid_expires_at) {
    const expiryDate = new Date(config.pcsid_expires_at);
    const now = new Date();
    const diff = expiryDate.getTime() - now.getTime();
    daysUntilExpiry = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0)       certHealth = "expired";
    else if (daysUntilExpiry <= 30) certHealth = "expiring_soon";
    else                            certHealth = "valid";
  }

  return {
    isActive:         config.onboarding_status === "active",
    environment:      config.environment,
    onboardingStatus: config.onboarding_status,
    certHealth,
    daysUntilExpiry,
    invoiceCount:     config.invoice_counter,
    lastActivity:     config.updated_at,
  };
}

/**
 * الحصول على خطوات Onboarding مع حالتها
 */
export function getOnboardingSteps(status: string, step: number) {
  const steps = [
    { id: 1, label: "إدخال رقم الضريبة والبيانات",      status: "pending" },
    { id: 2, label: "طلب OTP من ZATCA",                   status: "pending" },
    { id: 3, label: "التحقق من OTP",                      status: "pending" },
    { id: 4, label: "إنشاء CSR والمفاتيح",                status: "pending" },
    { id: 5, label: "الحصول على Compliance CSID",          status: "pending" },
    { id: 6, label: "الحصول على Production CSID",          status: "pending" },
    { id: 7, label: "التفعيل ✅",                          status: "pending" },
  ];

  const statusMap: Record<string, number> = {
    not_started:             0,
    otp_requested:           2,
    otp_verified:            3,
    csr_generated:           4,
    compliance_csid_issued:  5,
    production_csid_issued:  6,
    active:                  7,
  };

  const completedStep = statusMap[status] || step;

  return steps.map((s, i) => ({
    ...s,
    status: status === "failed" && i === completedStep
      ? "failed"
      : i < completedStep
        ? "completed"
        : i === completedStep
          ? "active"
          : "pending",
  }));
}

/**
 * التحقق من صحة طلب الفاتورة
 */
function validateInvoiceRequest(request: ZATCAInvoiceRequest): string[] {
  const errors: string[] = [];

  if (!request.branchId)
    errors.push("معرّف الفرع مطلوب");

  if (!request.invoiceData.items || request.invoiceData.items.length === 0)
    errors.push("يجب إضافة بنود للفاتورة");

  if (request.invoiceData.total < 0)
    errors.push("إجمالي الفاتورة لا يمكن أن يكون سالباً");

  if (request.invoiceData.vatAmount < 0)
    errors.push("مبلغ الضريبة لا يمكن أن يكون سالباً");

  // للفواتير المعيارية (B2B) يجب وجود رقم ضريبة المشتري
  if (request.invoiceData.invoiceType === "standard") {
    if (!request.invoiceData.buyer?.vatNumber) {
      errors.push("رقم الضريبة للمشتري مطلوب للفواتير المعيارية");
    }
  }

  return errors;
}

/**
 * حساب مبلغ الضريبة بدقة
 */
export function calculateVAT(
  amount: number,
  rate = 15,
  includesVAT = false
): { subtotal: number; vat: number; total: number } {
  if (includesVAT) {
    // الإجمالي يشمل الضريبة
    const subtotal = Math.round((amount / (1 + rate / 100)) * 100) / 100;
    const vat      = Math.round((amount - subtotal) * 100) / 100;
    return { subtotal, vat, total: amount };
  } else {
    // الإجمالي لا يشمل الضريبة
    const vat   = Math.round(amount * (rate / 100) * 100) / 100;
    const total = Math.round((amount + vat) * 100) / 100;
    return { subtotal: amount, vat, total };
  }
}

/**
 * الحصول على وصف حالة الفاتورة بالعربية
 */
export function getInvoiceStatusLabel(status: string): {
  label: string;
  color: string;
  description: string;
} {
  const map: Record<string, { label: string; color: string; description: string }> = {
    pending:   { label: "قيد الإرسال",   color: "yellow",  description: "لم يتم الإرسال لـ ZATCA بعد" },
    reported:  { label: "تم الإبلاغ",    color: "green",   description: "تم قبول الفاتورة المبسّطة من ZATCA" },
    cleared:   { label: "تم التخليص",    color: "green",   description: "تم تخليص الفاتورة المعيارية مع ZATCA" },
    rejected:  { label: "مرفوضة",        color: "red",     description: "رُفضت الفاتورة من ZATCA" },
    cancelled: { label: "ملغاة",          color: "gray",    description: "تم إلغاء الفاتورة" },
    error:     { label: "خطأ",            color: "red",     description: "حدث خطأ أثناء الإرسال" },
  };
  return map[status] || { label: status, color: "gray", description: "" };
}

/**
 * التحقق من صحة رقم الضريبة السعودي
 */
export function validateVATNumber(vat: string): boolean {
  return /^3[0-9]{14}$/.test(vat);
}

/**
 * الحصول على البادئة الصحيحة لنوع الفاتورة
 */
export function getInvoiceSubtype(type: string): string {
  return type === "simplified" ? "0100000" : "0200000";
}

// ══════════════════════════════════════════════════════════════════════════
// Compliance & Validation (عبر Edge Function)
// ══════════════════════════════════════════════════════════════════════════

/**
 * التحقق من صحة بيانات الفاتورة قبل الإرسال
 */
export async function validateInvoice(
  invoiceData: ZATCAInvoiceRequest["invoiceData"],
  invoiceType: string
): Promise<{ valid: boolean; errors: string[]; warnings: string[]; summary: string }> {
  try {
    const result = await callEdgeFunction("zatca-compliance", {
      action: "validate_invoice",
      invoiceData,
      invoiceType,
    });
    return result as unknown as { valid: boolean; errors: string[]; warnings: string[]; summary: string };
  } catch {
    // fallback: basic client-side validation
    const errors = validateInvoiceRequest({ branchId: "local", invoiceData });
    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? "✅ صحيح" : `❌ ${errors.length} خطأ`,
    };
  }
}

/**
 * اختبار الاتصال بـ ZATCA API
 */
export async function testZATCAConnection(
  environment: string
): Promise<{ connected: boolean; latency?: number; message: string }> {
  try {
    const result = await callEdgeFunction("zatca-compliance", {
      action: "test_connection",
      environment,
    });
    return result as unknown as { connected: boolean; latency?: number; message: string };
  } catch (err) {
    return {
      connected: false,
      message: err instanceof Error ? err.message : "فشل الاختبار",
    };
  }
}

/**
 * تشغيل اختبارات الامتثال الكاملة
 */
export async function runComplianceTests(branchId: string): Promise<{
  passed: number;
  failed: number;
  warnings: number;
  tests: Array<{ name: string; status: "pass" | "fail" | "warn"; message: string }>;
}> {
  const result = await callEdgeFunction("zatca-compliance", {
    action: "run_compliance_tests",
    branchId,
  });
  return result as unknown as {
    passed: number;
    failed: number;
    warnings: number;
    tests: Array<{ name: string; status: "pass" | "fail" | "warn"; message: string }>;
  };
}

// ══════════════════════════════════════════════════════════════════════════
// One-Click Onboarding — الجديد (secp256k1 + Vault + كل الخطوات دفعة واحدة)
// ══════════════════════════════════════════════════════════════════════════

/**
 * ربط فرع بـ ZATCA بضغطة زر واحدة
 * يُطلق: توليد مفاتيح secp256k1 → Vault → CSR → CSID → PCSID → تفعيل
 */
export async function connectZATCA(
  branchId: string,
  input: {
    vatNumber:    string;
    crNumber:     string;
    businessName: string;
    branchName?:  string;
    city?:        string;
    environment?: "sandbox" | "simulation" | "production";
  }
): Promise<{ success: boolean; message?: string; error?: string; step?: string }> {
  try {
    const result = await callEdgeFunction("zatca-onboarding", {
      action:       "onboard",
      branchId,
      ...input,
    });
    return result as { success: boolean; message?: string; error?: string; step?: string };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "خطأ غير معروف" };
  }
}

/**
 * إلغاء ربط فرع وحذف مفاتيحه من Vault
 */
export async function revokeZATCA(
  branchId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await callEdgeFunction("zatca-onboarding", {
      action: "revoke",
      branchId,
    });
    return result as { success: boolean; error?: string };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "خطأ في إلغاء الربط" };
  }
}
