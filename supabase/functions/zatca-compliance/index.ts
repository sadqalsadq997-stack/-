/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Supabase Edge Function: zatca-compliance
 * اختبارات الامتثال والتحقق من صحة الفواتير وفق متطلبات ZATCA
 *
 * الإجراءات:
 *  - validate_invoice   : التحقق من صحة بيانات الفاتورة قبل الإرسال
 *  - test_connection    : اختبار الاتصال بـ ZATCA API
 *  - check_certificate  : التحقق من صلاحية الشهادة
 *  - run_compliance_tests: تشغيل اختبارات الامتثال الكاملة
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── التحقق من صحة رقم الضريبة ────────────────────────────────────────────
function validateVAT(vat: string): { valid: boolean; error?: string } {
  if (!vat)              return { valid: false, error: "رقم الضريبة مطلوب" };
  if (!/^3[0-9]{14}$/.test(vat))
    return { valid: false, error: "رقم الضريبة يجب أن يكون 15 رقماً ويبدأ بـ 3" };
  return { valid: true };
}

// ── التحقق من صحة بنود الفاتورة ──────────────────────────────────────────
function validateLineItems(items: unknown[]): string[] {
  const errors: string[] = [];
  if (!items || items.length === 0) {
    errors.push("يجب أن تحتوي الفاتورة على بند واحد على الأقل");
    return errors;
  }

  items.forEach((item: Record<string, unknown>, idx: number) => {
    const i = idx + 1;
    if (!item.name)                   errors.push(`البند ${i}: الاسم مطلوب`);
    if (typeof item.quantity !== "number" || item.quantity <= 0)
      errors.push(`البند ${i}: الكمية يجب أن تكون أكبر من صفر`);
    if (typeof item.unitPrice !== "number" || item.unitPrice < 0)
      errors.push(`البند ${i}: سعر الوحدة غير صحيح`);
    if (typeof item.vatRate !== "number")
      errors.push(`البند ${i}: معدل الضريبة مطلوب`);
  });

  return errors;
}

// ── التحقق من دقة حسابات الضريبة ─────────────────────────────────────────
function validateVATCalculation(
  subtotal: number,
  vatAmount: number,
  total: number,
  rate = 15
): string[] {
  const errors: string[] = [];
  const expectedVat   = Math.round(subtotal * (rate / 100) * 100) / 100;
  const expectedTotal = Math.round((subtotal + expectedVat) * 100) / 100;

  if (Math.abs(vatAmount - expectedVat) > 0.02) {
    errors.push(`مبلغ الضريبة غير دقيق (المتوقع: ${expectedVat.toFixed(2)} ر.س، المُدخَل: ${vatAmount.toFixed(2)} ر.س)`);
  }
  if (Math.abs(total - expectedTotal) > 0.02) {
    errors.push(`الإجمالي غير دقيق (المتوقع: ${expectedTotal.toFixed(2)} ر.س، المُدخَل: ${total.toFixed(2)} ر.س)`);
  }
  return errors;
}

// ── التحقق من متطلبات الفاتورة المعيارية (B2B) ───────────────────────────
function validateStandardInvoice(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const buyer = data.buyer as Record<string, unknown> | undefined;

  if (!buyer?.vatNumber)
    errors.push("رقم الضريبة للمشتري مطلوب في الفواتير المعيارية");
  if (!buyer?.name)
    errors.push("اسم المشتري مطلوب في الفواتير المعيارية");

  if (buyer?.vatNumber) {
    const vatCheck = validateVAT(buyer.vatNumber as string);
    if (!vatCheck.valid) errors.push(`رقم ضريبة المشتري: ${vatCheck.error}`);
  }

  return errors;
}

// ── اختبار الاتصال بـ ZATCA ───────────────────────────────────────────────
async function testZATCAConnection(
  environment: string
): Promise<{ connected: boolean; latency?: number; error?: string }> {
  const baseUrl = environment === "production"
    ? "https://gw-fatoora.zatca.gov.sa/e-invoicing/core"
    : environment === "simulation"
      ? "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation"
      : "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal";

  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/compliance`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - start;
    return { connected: true, latency };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

// ── التحقق من صلاحية الشهادة ─────────────────────────────────────────────
function checkCertificateExpiry(config: Record<string, unknown>): {
  csid: { valid: boolean; daysLeft?: number };
  pcsid: { valid: boolean; daysLeft?: number };
  overall: "valid" | "expiring_soon" | "expired" | "not_issued";
} {
  function checkDate(dateStr: string | null | undefined) {
    if (!dateStr) return { valid: false, daysLeft: undefined };
    const expiry = new Date(dateStr);
    const now = new Date();
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { valid: daysLeft > 0, daysLeft };
  }

  const csid  = checkDate(config.csid_expires_at as string);
  const pcsid = checkDate(config.pcsid_expires_at as string);

  let overall: "valid" | "expiring_soon" | "expired" | "not_issued" = "not_issued";
  if (pcsid.daysLeft !== undefined) {
    if (pcsid.daysLeft <= 0)  overall = "expired";
    else if (pcsid.daysLeft <= 30) overall = "expiring_soon";
    else overall = "valid";
  }

  return { csid, pcsid, overall };
}

// ── تشغيل اختبارات الامتثال الكاملة ──────────────────────────────────────
async function runComplianceTests(
  supabase: ReturnType<typeof createClient>,
  branchId: string
): Promise<{
  passed: number;
  failed: number;
  warnings: number;
  tests: Array<{ name: string; status: "pass" | "fail" | "warn"; message: string }>;
}> {
  const tests: Array<{ name: string; status: "pass" | "fail" | "warn"; message: string }> = [];

  // جلب الإعدادات
  const { data: config } = await supabase
    .from("zatca_config")
    .select("*")
    .eq("branch_id", branchId)
    .single();

  // ── اختبار 1: وجود إعدادات ZATCA ──
  if (!config) {
    tests.push({ name: "إعدادات ZATCA", status: "fail", message: "لم يتم إعداد ZATCA لهذا الفرع" });
    return { passed: 0, failed: 1, warnings: 0, tests };
  }
  tests.push({ name: "إعدادات ZATCA", status: "pass", message: "الإعدادات موجودة" });

  // ── اختبار 2: رقم الضريبة ──
  const vatCheck = validateVAT(config.vat_number);
  tests.push({
    name: "رقم الضريبة",
    status: vatCheck.valid ? "pass" : "fail",
    message: vatCheck.valid ? `✅ ${config.vat_number}` : vatCheck.error || "غير صحيح",
  });

  // ── اختبار 3: اسم المنشأة ──
  tests.push({
    name: "اسم المنشأة",
    status: config.business_name ? "pass" : "fail",
    message: config.business_name || "⚠️ اسم المنشأة غير مُعيَّن",
  });

  // ── اختبار 4: حالة التسجيل ──
  tests.push({
    name: "حالة التسجيل",
    status: config.onboarding_status === "active" ? "pass"
          : config.onboarding_status === "failed"  ? "fail" : "warn",
    message: {
      active:                 "✅ مُفعَّل ويعمل",
      compliance_csid_issued: "⚠️ CSID صادر — ينتظر PCSID",
      csr_generated:          "⚠️ CSR جاهز — ينتظر CSID",
      otp_verified:           "⚠️ OTP مُتحقَّق — ينتظر CSR",
      otp_requested:          "⚠️ OTP مُرسَل — ينتظر التحقق",
      not_started:            "⚠️ لم يبدأ التسجيل",
      failed:                 "❌ فشل التسجيل",
    }[config.onboarding_status] || config.onboarding_status,
  });

  // ── اختبار 5: صلاحية الشهادة ──
  const certCheck = checkCertificateExpiry(config);
  if (certCheck.overall === "not_issued") {
    tests.push({ name: "الشهادة (PCSID)", status: "warn", message: "لم تُصدر شهادة الإنتاج بعد" });
  } else if (certCheck.overall === "expired") {
    tests.push({ name: "الشهادة (PCSID)", status: "fail", message: "❌ انتهت صلاحية الشهادة" });
  } else if (certCheck.overall === "expiring_soon") {
    tests.push({ name: "الشهادة (PCSID)", status: "warn",
      message: `⚠️ تنتهي خلال ${certCheck.pcsid.daysLeft} يوم — يُنصح بالتجديد` });
  } else {
    tests.push({ name: "الشهادة (PCSID)", status: "pass",
      message: `✅ صالحة لمدة ${certCheck.pcsid.daysLeft} يوم` });
  }

  // ── اختبار 6: البيئة ──
  tests.push({
    name: "بيئة التشغيل",
    status: config.environment === "production" ? "pass"
          : config.environment === "simulation"  ? "warn" : "warn",
    message: config.environment === "production" ? "✅ بيئة الإنتاج"
           : config.environment === "simulation"  ? "⚠️ بيئة المحاكاة (ليست إنتاج)"
           : "⚠️ بيئة الـ Sandbox (للاختبار فقط)",
  });

  // ── اختبار 7: عداد الفواتير ──
  tests.push({
    name: "سلسلة الفواتير",
    status: "pass",
    message: `عداد الفواتير: ${config.invoice_counter} — ${config.last_invoice_hash ? "✅ سلسلة Hash موجودة" : "⚠️ لا توجد فواتير سابقة"}`,
  });

  // ── اختبار 8: الاتصال بـ ZATCA API ──
  const connTest = await testZATCAConnection(config.environment);
  tests.push({
    name: "الاتصال بـ ZATCA API",
    status: connTest.connected ? "pass" : "warn",
    message: connTest.connected
      ? `✅ متصل (${connTest.latency}ms)`
      : `⚠️ لا يمكن الاتصال: ${connTest.error} (قد يكون طبيعياً في بعض البيئات)`,
  });

  // ── اختبار 9: العنوان ──
  const hasFullAddress = config.address_city && config.address_street && config.address_building;
  tests.push({
    name: "بيانات العنوان",
    status: hasFullAddress ? "pass" : "warn",
    message: hasFullAddress
      ? `✅ ${config.address_street}، ${config.address_city}`
      : "⚠️ العنوان غير مكتمل — قد يؤدي إلى رفض الفاتورة",
  });

  // إحصاء النتائج
  const passed   = tests.filter(t => t.status === "pass").length;
  const failed   = tests.filter(t => t.status === "fail").length;
  const warnings = tests.filter(t => t.status === "warn").length;

  return { passed, failed, warnings, tests };
}

// ══════════════════════════════════════════════════════════════════════════
// Main Handler
// ══════════════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action } = body;

    let result: unknown;

    switch (action) {

      case "validate_invoice": {
        const { invoiceData, invoiceType } = body;
        const errors: string[] = [];
        const warnings: string[] = [];

        // التحقق من البنود
        errors.push(...validateLineItems(invoiceData?.items || []));

        // التحقق من الحسابات
        if (invoiceData?.subtotal !== undefined) {
          errors.push(...validateVATCalculation(
            invoiceData.subtotal,
            invoiceData.vatAmount || 0,
            invoiceData.total || 0
          ));
        }

        // تحقق إضافي للفواتير المعيارية
        if (invoiceType === "standard") {
          errors.push(...validateStandardInvoice(invoiceData || {}));
        }

        // تحذيرات
        if (!invoiceData?.buyer?.name && invoiceType !== "simplified") {
          warnings.push("اسم المشتري غير مُعيَّن");
        }

        result = {
          valid: errors.length === 0,
          errors,
          warnings,
          summary: errors.length === 0
            ? "✅ الفاتورة صحيحة وجاهزة للإرسال"
            : `❌ ${errors.length} خطأ يجب إصلاحه`,
        };
        break;
      }

      case "test_connection": {
        const { environment = "sandbox" } = body;
        const connResult = await testZATCAConnection(environment);
        result = {
          ...connResult,
          environment,
          message: connResult.connected
            ? `✅ الاتصال بـ ZATCA ${environment} ناجح (${connResult.latency}ms)`
            : `⚠️ لا يمكن الاتصال بـ ZATCA ${environment}: ${connResult.error}`,
        };
        break;
      }

      case "check_certificate": {
        const { branchId } = body;
        const { data: config } = await supabase
          .from("zatca_config")
          .select("csid_expires_at, pcsid_expires_at, onboarding_status, environment")
          .eq("branch_id", branchId)
          .single();

        if (!config) {
          result = { error: "الإعدادات غير موجودة" };
          break;
        }

        const certInfo = checkCertificateExpiry(config);
        result = {
          ...certInfo,
          status: config.onboarding_status,
          environment: config.environment,
          message: certInfo.overall === "valid"         ? "✅ الشهادة صالحة"
                 : certInfo.overall === "expiring_soon" ? `⚠️ تنتهي خلال ${certInfo.pcsid.daysLeft} يوم`
                 : certInfo.overall === "expired"       ? "❌ انتهت صلاحية الشهادة"
                 : "— لم تُصدر شهادة بعد",
        };
        break;
      }

      case "run_compliance_tests": {
        const { branchId } = body;
        if (!branchId) {
          result = { error: "branchId مطلوب" };
          break;
        }
        result = await runComplianceTests(supabase, branchId);
        break;
      }

      default:
        result = { error: `Unknown action: ${action}` };
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
