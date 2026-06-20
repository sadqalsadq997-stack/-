/**
 * ═══════════════════════════════════════════════════════════════════════════
 * صفحة إعدادات ZATCA Phase 2
 * Self-Service Onboarding كامل للعميل دون تدخل إداري
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield, CheckCircle, XCircle, Clock, AlertCircle,
  ChevronRight, Loader2, RefreshCw, Eye, EyeOff,
  Building2, FileText, Key, Award, Rocket, Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  saveZATCAConfig,
  getZATCAConfig,
  requestOTP,
  verifyOTP,
  generateCSR,
  getComplianceCsid,
  getProductionCsid,
  getOnboardingSteps,
  getZATCAStatusSummary,
  validateVATNumber,
} from "@/services/zatcaService";
import type { ZATCAConfig, ZATCAConfigForm, ZATCAEnvironment } from "@/types/zatca";
import { useZATCAOnboarding, ZATCAConnectButton } from "@/hooks/useZATCAOnboarding";

// ── ألوان الخطوات ─────────────────────────────────────────────────────────
const STEP_ICONS = [Building2, FileText, Key, Key, Award, Rocket, CheckCircle];

const ENV_LABELS: Record<ZATCAEnvironment, { label: string; color: string; desc: string }> = {
  sandbox:    { label: "Sandbox",    color: "text-blue-500",   desc: "بيئة تطوير واختبار — بيانات تجريبية" },
  simulation: { label: "Simulation", color: "text-yellow-500", desc: "بيئة محاكاة — قريبة من الإنتاج" },
  production: { label: "Production", color: "text-green-500",  desc: "بيئة الإنتاج — فواتير حقيقية" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  not_started:            { label: "لم يبدأ",               color: "text-gray-500",   bg: "bg-gray-50" },
  otp_requested:          { label: "OTP مُرسَل",             color: "text-blue-600",   bg: "bg-blue-50" },
  otp_verified:           { label: "OTP مُتحقَّق",            color: "text-teal-600",   bg: "bg-teal-50" },
  csr_generated:          { label: "CSR جاهز",               color: "text-purple-600", bg: "bg-purple-50" },
  compliance_csid_issued: { label: "Compliance CSID صادر",   color: "text-orange-600", bg: "bg-orange-50" },
  production_csid_issued: { label: "Production CSID صادر",   color: "text-emerald-600",bg: "bg-emerald-50" },
  active:                 { label: "✅ مُفعَّل",              color: "text-green-600",  bg: "bg-green-50" },
  failed:                 { label: "⚠️ فشل",                 color: "text-red-600",    bg: "bg-red-50" },
};

// ══════════════════════════════════════════════════════════════════════════
// المكوّن الرئيسي
// ══════════════════════════════════════════════════════════════════════════
export default function ZATCASettings() {
  const [config, setConfig]       = useState<ZATCAConfig | null>(null);
  const [branchId, setBranchId]   = useState<string>("");
  const [useOneClick, setUseOneClick] = useState(false);

  // One-Click Onboarding Hook (secp256k1 + Vault — الطريقة المبسّطة)
  const oneClick = useZATCAOnboarding(branchId || undefined);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [working, setWorking]     = useState(false);
  const [otp, setOtp]             = useState("");
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const [form, setForm] = useState<ZATCAConfigForm>({
    business_name:    "",
    business_name_ar: "",
    vat_number:       "",
    cr_number:        "",
    branch_name:      "",
    address_street:   "",
    address_building: "",
    address_city:     "الرياض",
    address_postal:   "",
    address_country:  "SA",
    address_district: "",
    environment:      "sandbox",
  });

  // ── جلب الفرع النشط ──
  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // جلب الفرع النشط
      const { data: branches } = await (supabase as any)
        .from("branches")
        .select("id, name, vat_number, cr_number, address")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!branches) {
        setLoading(false);
        return;
      }

      setBranchId(branches.id);

      // جلب إعدادات ZATCA
      const zatcaConfig = await getZATCAConfig(branches.id);

      if (zatcaConfig) {
        setConfig(zatcaConfig);
        setForm({
          business_name:    zatcaConfig.business_name || "",
          business_name_ar: zatcaConfig.business_name_ar || "",
          vat_number:       zatcaConfig.vat_number || "",
          cr_number:        zatcaConfig.cr_number || "",
          branch_name:      zatcaConfig.branch_name || "",
          address_street:   zatcaConfig.address_street || "",
          address_building: zatcaConfig.address_building || "",
          address_city:     zatcaConfig.address_city || "الرياض",
          address_postal:   zatcaConfig.address_postal || "",
          address_country:  zatcaConfig.address_country || "SA",
          address_district: zatcaConfig.address_district || "",
          environment:      zatcaConfig.environment || "sandbox",
        });
      } else {
        // ملء من بيانات الفرع
        setForm(prev => ({
          ...prev,
          business_name: branches.name || "",
          vat_number:    branches.vat_number || "",
          cr_number:     branches.cr_number || "",
          address_city:  branches.address || "",
        }));
      }

      setLoading(false);
    }
    loadData();
  }, []);

  const reloadConfig = useCallback(async () => {
    if (!branchId) return;
    const cfg = await getZATCAConfig(branchId);
    setConfig(cfg);
  }, [branchId]);

  // ── حفظ الإعدادات ──
  async function handleSave() {
    if (!branchId) return toast.error("الفرع غير موجود");

    if (!form.business_name.trim()) return toast.error("اسم المنشأة مطلوب");
    if (!validateVATNumber(form.vat_number)) {
      return toast.error("رقم الضريبة يجب أن يكون 15 رقماً ويبدأ بـ 3");
    }

    setSaving(true);
    const result = await saveZATCAConfig(branchId, form);
    setSaving(false);

    if (result.success) {
      toast.success("✅ تم حفظ إعدادات ZATCA");
      await reloadConfig();
    } else {
      toast.error(result.error || "خطأ في الحفظ");
    }
  }

  // ── طلب OTP ──
  async function handleRequestOTP() {
    if (!branchId) return;
    setWorking(true);
    setError(null);
    const result = await requestOTP(branchId);
    setWorking(false);

    if (result.success) {
      toast.success("✅ تم إرسال OTP");
      setShowOtpInput(true);
      await reloadConfig();
    } else {
      setError(result.error || "فشل طلب OTP");
      toast.error(result.error || "فشل طلب OTP");
    }
  }

  // ── التحقق من OTP ──
  async function handleVerifyOTP() {
    if (!otp.trim()) return toast.error("يرجى إدخال OTP");
    setWorking(true);
    setError(null);
    const result = await verifyOTP(branchId, otp);
    setWorking(false);

    if (result.success) {
      toast.success("✅ تم التحقق من OTP");
      setShowOtpInput(false);
      setOtp("");
      await reloadConfig();
    } else {
      setError(result.error || "OTP غير صحيح");
      toast.error(result.error || "OTP غير صحيح");
    }
  }

  // ── إنشاء CSR ──
  async function handleGenerateCSR() {
    setWorking(true);
    setError(null);
    const result = await generateCSR(branchId);
    setWorking(false);

    if (result.success) {
      toast.success("✅ تم إنشاء CSR. المفتاح الخاص محفوظ بأمان في الخادم");
      await reloadConfig();
    } else {
      setError(result.error || "فشل إنشاء CSR");
      toast.error(result.error || "فشل إنشاء CSR");
    }
  }

  // ── الحصول على Compliance CSID ──
  async function handleComplianceCsid() {
    setWorking(true);
    setError(null);
    const result = await getComplianceCsid(branchId);
    setWorking(false);

    if (result.success) {
      toast.success("✅ تم إصدار Compliance CSID");
      await reloadConfig();
    } else {
      setError(result.error || "فشل إصدار CSID");
      toast.error(result.error || "فشل إصدار CSID");
    }
  }

  // ── الحصول على Production CSID ──
  async function handleProductionCsid() {
    setWorking(true);
    setError(null);
    const result = await getProductionCsid(branchId);
    setWorking(false);

    if (result.success) {
      toast.success("🎉 تم تفعيل ZATCA Phase 2 بنجاح!");
      await reloadConfig();
    } else {
      setError(result.error || "فشل إصدار Production CSID");
      toast.error(result.error || "فشل إصدار Production CSID");
    }
  }

  // ── قيمة الحقل ──
  const f = (key: keyof ZATCAConfigForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(v => ({ ...v, [key]: e.target.value }));

  // ── حالة الخطوات ──
  const steps = config
    ? getOnboardingSteps(config.onboarding_status, config.onboarding_step)
    : getOnboardingSteps("not_started", 0);

  const status = config?.onboarding_status || "not_started";
  const summary = getZATCAStatusSummary(config);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6 max-w-4xl">

      {/* ── رأس الصفحة ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-black text-foreground">إعدادات ZATCA Phase 2</h2>
            <p className="text-xs text-muted-foreground">الربط الرسمي مع هيئة الزكاة والضريبة والجمارك</p>
          </div>
        </div>

        {/* حالة التسجيل */}
        {config && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold
            ${STATUS_CONFIG[status]?.bg} ${STATUS_CONFIG[status]?.color}`}>
            {status === "active"
              ? <CheckCircle className="w-3.5 h-3.5" />
              : status === "failed"
                ? <XCircle className="w-3.5 h-3.5" />
                : <Clock className="w-3.5 h-3.5" />
            }
            {STATUS_CONFIG[status]?.label || status}
          </div>
        )}
      </div>


      {/* ── طريقة الربط: بضغطة زر أو خطوة بخطوة ── */}
      {!oneClick.isActive && (
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-green-800 text-sm flex items-center gap-2">
                <span>🚀</span> الربط السريع — بضغطة زر واحدة
              </h3>
              <p className="text-xs text-green-600 mt-0.5">
                secp256k1 + Zero-Knowledge Vault — أسرع وأكثر أماناً
              </p>
            </div>
            <button
              onClick={() => setUseOneClick(v => !v)}
              className="text-xs text-green-700 underline"
            >
              {useOneClick ? "الإعداد التقليدي" : "جرّب الربط السريع"}
            </button>
          </div>

          {useOneClick && form.vat_number && form.cr_number && form.business_name && (
            <ZATCAConnectButton
              branchId={branchId}
              vatNumber={form.vat_number}
              crNumber={form.cr_number}
              businessName={form.business_name}
              environment={form.environment as "sandbox" | "simulation" | "production"}
              onSuccess={() => { reloadConfig(); }}
            />
          )}
          {useOneClick && (!form.vat_number || !form.cr_number || !form.business_name) && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              ⚠️ يرجى ملء بيانات المنشأة (رقم الضريبة، السجل التجاري، الاسم) أولاً ثم حفظها.
            </p>
          )}
        </div>
      )}

      {/* ── بانر تفعيل ── */}
      {status === "active" && summary.certHealth !== "expired" && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-bold text-green-800 text-sm">ZATCA Phase 2 مُفعَّل ✅</p>
            <p className="text-xs text-green-700">
              الفواتير الإلكترونية تُرسَل تلقائياً لهيئة الزكاة.
              {summary.daysUntilExpiry !== undefined && ` الشهادة صالحة لمدة ${summary.daysUntilExpiry} يوم.`}
            </p>
          </div>
          {form.environment && (
            <span className={`mr-auto text-xs font-bold ${ENV_LABELS[form.environment].color}`}>
              {ENV_LABELS[form.environment].label}
            </span>
          )}
        </div>
      )}

      {/* ── تحذير انتهاء الشهادة ── */}
      {status === "active" && summary.certHealth === "expiring_soon" && (
        <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-2xl px-5 py-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <p className="text-sm text-yellow-800">
            تنتهي صلاحية الشهادة خلال <strong>{summary.daysUntilExpiry}</strong> يوم. يُنصح بالتجديد.
          </p>
        </div>
      )}

      {/* ── رسالة خطأ ── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-3">
          <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* ── العمود الأيسر: خطوات Onboarding ── */}
        <div className="md:col-span-1">
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-primary" />
              خطوات التسجيل
            </h3>

            <div className="space-y-2">
              {steps.map((step, i) => {
                const Icon = STEP_ICONS[i] || Shield;
                return (
                  <div key={step.id}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-colors
                      ${step.status === "completed" ? "bg-green-50" :
                        step.status === "active"    ? "bg-primary/5 border border-primary/20" :
                        step.status === "failed"    ? "bg-red-50" :
                        "opacity-50"}`}>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0
                      ${step.status === "completed" ? "bg-green-500" :
                        step.status === "active"    ? "bg-primary" :
                        step.status === "failed"    ? "bg-red-500" :
                        "bg-muted"}`}>
                      {step.status === "completed" ? (
                        <CheckCircle className="w-3.5 h-3.5 text-white" />
                      ) : step.status === "failed" ? (
                        <XCircle className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <Icon className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <span className={`text-xs font-medium
                      ${step.status === "completed" ? "text-green-700" :
                        step.status === "active"    ? "text-primary" :
                        step.status === "failed"    ? "text-red-700" :
                        "text-muted-foreground"}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* معلومات الشهادة */}
            {config && config.pcsid_expires_at && (
              <div className="mt-4 pt-4 border-t border-border space-y-1.5">
                <p className="text-xs font-bold text-foreground">معلومات الشهادة</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>CSID: {config.csid_issued_at ? "✅ صادر" : "—"}</p>
                  <p>PCSID: {config.pcsid_issued_at ? "✅ صادر" : "—"}</p>
                  <p>انتهاء: {config.pcsid_expires_at
                    ? new Date(config.pcsid_expires_at).toLocaleDateString("ar-SA")
                    : "—"}</p>
                  <p>الفواتير: {config.invoice_counter}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── العمود الأيمن: الإعدادات والإجراءات ── */}
        <div className="md:col-span-2 space-y-5">

          {/* ── نموذج البيانات ── */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              بيانات المنشأة
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: "business_name",    label: "اسم المنشأة *",           placeholder: "مطعم الأصالة",        full: true },
                { key: "business_name_ar", label: "الاسم بالعربية",          placeholder: "Al-Asala Restaurant" },
                { key: "vat_number",       label: "رقم الضريبة (VAT) *",     placeholder: "300000000000003",     hint: "15 رقم يبدأ بـ 3" },
                { key: "cr_number",        label: "رقم السجل التجاري",       placeholder: "1010000000",          hint: "10 أرقام" },
                { key: "branch_name",      label: "اسم الفرع",               placeholder: "الفرع الرئيسي" },
                { key: "address_street",   label: "اسم الشارع",              placeholder: "شارع التحلية" },
                { key: "address_building", label: "رقم المبنى",              placeholder: "1234" },
                { key: "address_district", label: "الحي",                    placeholder: "حي النزهة" },
                { key: "address_city",     label: "المدينة",                 placeholder: "الرياض" },
                { key: "address_postal",   label: "الرمز البريدي",           placeholder: "12345" },
                { key: "address_country",  label: "الدولة",                  placeholder: "SA" },
              ].map((inp) => (
                <div key={inp.key} className={inp.full ? "sm:col-span-2" : ""}>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    {inp.label}
                    {inp.hint && (
                      <span className="text-muted-foreground/60 mr-1">({inp.hint})</span>
                    )}
                  </label>
                  <input
                    value={form[inp.key as keyof ZATCAConfigForm] as string}
                    onChange={f(inp.key as keyof ZATCAConfigForm)}
                    placeholder={inp.placeholder}
                    disabled={status === "active"}
                    className="w-full h-9 px-3 bg-background border border-border rounded-xl text-sm
                      focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              ))}

              {/* البيئة */}
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  البيئة
                </label>
                <select
                  value={form.environment}
                  onChange={f("environment")}
                  disabled={status === "active"}
                  className="w-full h-9 px-3 bg-background border border-border rounded-xl text-sm
                    focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50">
                  {(Object.keys(ENV_LABELS) as ZATCAEnvironment[]).map(env => (
                    <option key={env} value={env}>
                      {ENV_LABELS[env].label} — {ENV_LABELS[env].desc}
                    </option>
                  ))}
                </select>
                <p className={`text-xs mt-1 ${ENV_LABELS[form.environment]?.color}`}>
                  {ENV_LABELS[form.environment]?.desc}
                </p>
              </div>
            </div>

            {status !== "active" && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="mt-5 flex items-center gap-2 h-9 px-5 bg-primary text-primary-foreground
                  rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                حفظ الإعدادات
              </button>
            )}
          </div>

          {/* ── إجراءات Onboarding ── */}
          {status !== "active" && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" />
                إجراءات التسجيل مع ZATCA
              </h3>

              <div className="space-y-3">

                {/* طلب OTP */}
                <OnboardingAction
                  label="طلب OTP من ZATCA"
                  description="إرسال رمز التحقق لبريدك الإلكتروني المسجل في ZATCA"
                  enabled={!!config && ["not_started", "failed", "otp_requested"].includes(status)}
                  completed={["otp_requested", "otp_verified", "csr_generated",
                    "compliance_csid_issued", "production_csid_issued", "active"].includes(status)}
                  working={working}
                  onClick={handleRequestOTP}
                  icon={<FileText className="w-4 h-4" />}
                />

                {/* إدخال OTP */}
                {(showOtpInput || status === "otp_requested") && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-medium text-blue-800">
                      أدخل OTP المُرسَل لبريدك الإلكتروني:
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={otp}
                        onChange={e => setOtp(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                        className="flex-1 h-9 px-3 bg-white border border-blue-300 rounded-xl text-sm
                          text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                      <button
                        onClick={handleVerifyOTP}
                        disabled={working || !otp.trim()}
                        className="h-9 px-4 bg-blue-600 text-white rounded-xl text-sm font-medium
                          hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                        {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        تحقق
                      </button>
                    </div>
                  </div>
                )}

                {/* إنشاء CSR */}
                <OnboardingAction
                  label="إنشاء CSR والمفاتيح الرقمية"
                  description="يتم إنشاء المفتاح الخاص وتخزينه بأمان في الخادم — لا يُرسَل للمتصفح أبداً"
                  enabled={status === "otp_verified"}
                  completed={["csr_generated", "compliance_csid_issued",
                    "production_csid_issued", "active"].includes(status)}
                  working={working}
                  onClick={handleGenerateCSR}
                  icon={<Key className="w-4 h-4" />}
                  security
                />

                {/* Compliance CSID */}
                <OnboardingAction
                  label="الحصول على Compliance CSID"
                  description="شهادة الامتثال من ZATCA — مطلوبة للبدء في الفواتير التجريبية"
                  enabled={status === "csr_generated"}
                  completed={["compliance_csid_issued", "production_csid_issued", "active"].includes(status)}
                  working={working}
                  onClick={handleComplianceCsid}
                  icon={<Award className="w-4 h-4" />}
                />

                {/* Production CSID */}
                <OnboardingAction
                  label="تفعيل Production CSID"
                  description="الشهادة الرسمية — تُفعّل الفواتير الإلكترونية الحقيقية مع ZATCA"
                  enabled={status === "compliance_csid_issued"}
                  completed={["production_csid_issued", "active"].includes(status)}
                  working={working}
                  onClick={handleProductionCsid}
                  icon={<Rocket className="w-4 h-4" />}
                />
              </div>

              {/* تحذير أمان */}
              <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <p>
                  جميع العمليات الحساسة (المفاتيح، الشهادات، OTP) تُنفَّذ حصرياً في
                  الخادم الآمن ولا تُخزَّن في المتصفح. هذا متوافق مع معايير OWASP وZATCA.
                </p>
              </div>
            </div>
          )}

          {/* ── إعادة تهيئة (لبيئة الاختبار فقط) ── */}
          {status === "active" && config?.environment !== "production" && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-yellow-800">إعادة التسجيل (Sandbox)</p>
                  <p className="text-xs text-yellow-700">إعادة بدء عملية التسجيل للاختبار</p>
                </div>
                <button
                  onClick={async () => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (supabase as any)
                      .from("zatca_config")
                      .update({ onboarding_status: "not_started", onboarding_step: 0 })
                      .eq("branch_id", branchId);
                    await reloadConfig();
                    toast.info("تمت إعادة التهيئة");
                  }}
                  className="text-xs px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700">
                  إعادة التهيئة
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── مكوّن إجراء Onboarding ─────────────────────────────────────────────────
function OnboardingAction({
  label, description, enabled, completed, working, onClick, icon, security,
}: {
  label:        string;
  description:  string;
  enabled:      boolean;
  completed:    boolean;
  working:      boolean;
  onClick:      () => void;
  icon:         React.ReactNode;
  security?:    boolean;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors
      ${completed  ? "bg-green-50 border-green-200" :
        enabled    ? "bg-background border-border hover:border-primary/30" :
        "bg-muted/30 border-border opacity-50"}`}>

      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
        ${completed ? "bg-green-500" : enabled ? "bg-primary/10" : "bg-muted"}`}>
        {completed
          ? <CheckCircle className="w-4 h-4 text-white" />
          : React.cloneElement(icon as React.ReactElement, {
              className: `w-4 h-4 ${enabled ? "text-primary" : "text-muted-foreground"}`
            })
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${completed ? "text-green-700" : "text-foreground"}`}>
          {label}
          {security && (
            <span className="mr-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md">🔒 آمن</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>

      {!completed && enabled && (
        <button
          onClick={onClick}
          disabled={working}
          className="flex-shrink-0 h-7 px-3 bg-primary text-primary-foreground rounded-lg
            text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
          {working ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          تنفيذ
        </button>
      )}
    </div>
  );
}
