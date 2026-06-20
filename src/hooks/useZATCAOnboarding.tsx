/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * useZATCAOnboarding — React Hook
 * ربط حساب فاتورة بضغطة زر واحدة (One-Click Onboarding)
 *
 * الاستخدام البسيط:
 *   const { connect, status, error, isLoading } = useZATCAOnboarding(branchId);
 *   <button onClick={() => connect({ vatNumber, crNumber, businessName })}>
 *     ربط حساب فاتورة
 *   </button>
 *
 * الاستخدام المتقدم (خطوة بخطوة):
 *   const { requestOTP, verifyOTP, generateCSR, ... } = useZATCAOnboarding(branchId);
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZATCAConnectInput {
  vatNumber:    string;
  crNumber:     string;
  businessName: string;
  branchName?:  string;
  city?:        string;
  environment?: "sandbox" | "simulation" | "production";
}

export interface ZATCAError {
  code:    string;
  message: string;
  details: string;
  retry:   boolean;
}

export type OnboardingStatus =
  | "idle"
  | "loading"
  | "not_started"
  | "otp_requested"
  | "otp_verified"
  | "csr_generated"
  | "compliance_csid_issued"
  | "active"
  | "failed"
  | "production_failed";

export interface ZATCAConfig {
  branchId:         string;
  businessName:     string;
  vatNumber:        string;
  crNumber:         string;
  environment:      string;
  onboardingStatus: OnboardingStatus;
  onboardingStep:   number;
  onboardingError:  string | null;
  csidExpiresAt:    string | null;
  pcsidExpiresAt:   string | null;
  invoiceCounter:   number;
  hasVaultKey:      boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useZATCAOnboarding(branchId?: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<ZATCAError | null>(null);
  const [config, setConfig]       = useState<ZATCAConfig | null>(null);
  const [status, setStatus]       = useState<OnboardingStatus>("idle");
  const [progress, setProgress]   = useState<string>("");

  // جلب الفرع النشط إن لم يُحدَّد
  const [resolvedBranchId, setResolvedBranchId] = useState<string | null>(branchId || null);

  useEffect(() => {
    if (branchId) {
      setResolvedBranchId(branchId);
      return;
    }
    // جلب الفرع النشط تلقائياً
    (async () => {
      const { data } = await (supabase as any)
        .from("branches")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .single();
      if (data?.id) setResolvedBranchId(data.id);
    })();
  }, [branchId]);

  /**
   * تحميل الحالة الحالية للربط
   */
  const loadStatus = useCallback(async () => {
    if (!resolvedBranchId) return;

    const { data, error: fnError } = await supabase.functions.invoke("zatca-onboarding", {
      body: { action: "get_status", branchId: resolvedBranchId },
    });

    if (!fnError && data?.config) {
      const c = data.config;
      setConfig({
        branchId:         c.branch_id,
        businessName:     c.business_name,
        vatNumber:        c.vat_number,
        crNumber:         c.cr_number,
        environment:      c.environment,
        onboardingStatus: c.onboarding_status,
        onboardingStep:   c.onboarding_step,
        onboardingError:  c.onboarding_error,
        csidExpiresAt:    c.csid_expires_at,
        pcsidExpiresAt:   c.pcsid_expires_at,
        invoiceCounter:   c.invoice_counter,
        hasVaultKey:      !!c.vault_secret_id,
      });
      setStatus(c.onboarding_status as OnboardingStatus);
    }
  }, [resolvedBranchId]);

  useEffect(() => {
    if (resolvedBranchId) loadStatus();
  }, [resolvedBranchId, loadStatus]);

  /**
   * الدالة الرئيسية: ربط كامل بضغطة زر واحدة
   * secp256k1 + Vault + CSR + CSID + PCSID كلها في استدعاء واحد
   */
  const connect = useCallback(async (input: ZATCAConnectInput): Promise<boolean> => {
    if (!resolvedBranchId) {
      setError({ code: "NO_BRANCH", message: "لم يتم تحديد الفرع", details: "", retry: false });
      return false;
    }

    setIsLoading(true);
    setError(null);
    setProgress("جارٍ التحقق من البيانات...");
    setStatus("loading" as OnboardingStatus);

    try {
      setProgress("جارٍ توليد مفاتيح التشفير (secp256k1)...");
      const { data, error: fnError } = await supabase.functions.invoke("zatca-onboarding", {
        body: {
          action:       "onboard",
          branchId:     resolvedBranchId,
          vatNumber:    input.vatNumber.trim(),
          crNumber:     input.crNumber.trim(),
          businessName: input.businessName.trim(),
          branchName:   input.branchName,
          city:         input.city,
          environment:  input.environment || "sandbox",
        },
      });

      if (fnError) {
        setError({ code: "FUNCTION_ERROR", message: "فشل الاتصال بالخادم", details: fnError.message, retry: true });
        setStatus("failed");
        return false;
      }

      if (!data?.success) {
        const err = data?.error as ZATCAError;
        setError(err || { code: "UNKNOWN", message: "فشل الربط", details: "", retry: false });
        setStatus("failed");
        return false;
      }

      setProgress(data.message || "تم الربط بنجاح ✅");
      await loadStatus();
      return true;

    } catch (err) {
      setError({
        code: "UNEXPECTED_ERROR", message: "حدث خطأ غير متوقع",
        details: err instanceof Error ? err.message : String(err), retry: true,
      });
      setStatus("failed");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [resolvedBranchId, loadStatus]);

  /**
   * الخطوة المنفصلة: طلب OTP
   */
  const requestOTP = useCallback(async () => {
    if (!resolvedBranchId) return false;
    setIsLoading(true);
    try {
      const { data } = await supabase.functions.invoke("zatca-onboarding", {
        body: { action: "request_otp", branchId: resolvedBranchId },
      });
      if (data?.success) { await loadStatus(); return true; }
      setError(data?.error || { code: "OTP_FAILED", message: data?.error || "فشل طلب OTP", details: "", retry: true });
      return false;
    } finally { setIsLoading(false); }
  }, [resolvedBranchId, loadStatus]);

  /**
   * الخطوة المنفصلة: التحقق من OTP
   */
  const verifyOTP = useCallback(async (otp: string) => {
    if (!resolvedBranchId) return false;
    setIsLoading(true);
    try {
      const { data } = await supabase.functions.invoke("zatca-onboarding", {
        body: { action: "verify_otp", branchId: resolvedBranchId, otp },
      });
      if (data?.success) { await loadStatus(); return true; }
      setError({ code: "OTP_INVALID", message: data?.error || "OTP غير صحيح", details: "", retry: true });
      return false;
    } finally { setIsLoading(false); }
  }, [resolvedBranchId, loadStatus]);

  /**
   * الخطوة المنفصلة: إنشاء CSR
   */
  const generateCSR = useCallback(async () => {
    if (!resolvedBranchId) return false;
    setIsLoading(true);
    try {
      const { data } = await supabase.functions.invoke("zatca-onboarding", {
        body: { action: "generate_csr", branchId: resolvedBranchId },
      });
      if (data?.success) { await loadStatus(); return true; }
      setError({ code: "CSR_FAILED", message: data?.error || "فشل إنشاء CSR", details: "", retry: true });
      return false;
    } finally { setIsLoading(false); }
  }, [resolvedBranchId, loadStatus]);

  /**
   * الخطوة المنفصلة: Compliance CSID
   */
  const getComplianceCsid = useCallback(async () => {
    if (!resolvedBranchId) return false;
    setIsLoading(true);
    try {
      const { data } = await supabase.functions.invoke("zatca-onboarding", {
        body: { action: "compliance_csid", branchId: resolvedBranchId },
      });
      if (data?.success) { await loadStatus(); return true; }
      setError({ code: "CSID_FAILED", message: data?.error || "فشل إصدار CSID", details: "", retry: true });
      return false;
    } finally { setIsLoading(false); }
  }, [resolvedBranchId, loadStatus]);

  /**
   * الخطوة المنفصلة: Production CSID
   */
  const getProductionCsid = useCallback(async () => {
    if (!resolvedBranchId) return false;
    setIsLoading(true);
    try {
      const { data } = await supabase.functions.invoke("zatca-onboarding", {
        body: { action: "production_csid", branchId: resolvedBranchId },
      });
      if (data?.success) { await loadStatus(); return true; }
      setError({ code: "PCSID_FAILED", message: data?.error || "فشل إصدار PCSID", details: "", retry: true });
      return false;
    } finally { setIsLoading(false); }
  }, [resolvedBranchId, loadStatus]);

  /**
   * إلغاء الربط وحذف المفاتيح من Vault
   */
  const disconnect = useCallback(async (): Promise<boolean> => {
    if (!resolvedBranchId) return false;
    setIsLoading(true);
    try {
      const { data } = await supabase.functions.invoke("zatca-onboarding", {
        body: { action: "revoke", branchId: resolvedBranchId },
      });
      if (data?.success) {
        setConfig(null);
        setStatus("not_started");
        setError(null);
        return true;
      }
      return false;
    } finally { setIsLoading(false); }
  }, [resolvedBranchId]);

  /**
   * التحقق من قرب انتهاء صلاحية الشهادات
   */
  const isExpiringSoon = useCallback((): boolean => {
    if (!config?.pcsidExpiresAt) return false;
    const daysLeft = (new Date(config.pcsidExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysLeft < 30;
  }, [config]);

  const isActive   = status === "active";
  const needsSetup = !config || status === "not_started" || status === "idle";
  const hasFailed  = status === "failed" || status === "production_failed";

  return {
    // الحالة
    isLoading, isActive, needsSetup, hasFailed,
    status, config, error, progress,
    branchId: resolvedBranchId,

    // One-Click
    connect,

    // خطوات منفصلة
    requestOTP, verifyOTP, generateCSR, getComplianceCsid, getProductionCsid,

    // إدارة
    disconnect, reload: loadStatus, isExpiringSoon,
  };
}

// ─── مكوّن الربط الجاهز ───────────────────────────────────────────────────────

import type { FC } from "react";

interface ZATCAConnectButtonProps {
  branchId?:    string;
  vatNumber:    string;
  crNumber:     string;
  businessName: string;
  environment?: "sandbox" | "simulation" | "production";
  onSuccess?:   (config: ZATCAConfig) => void;
  onError?:     (error: ZATCAError) => void;
}

export const ZATCAConnectButton: FC<ZATCAConnectButtonProps> = ({
  branchId, vatNumber, crNumber, businessName, environment = "sandbox", onSuccess, onError,
}) => {
  const { connect, disconnect, isLoading, isActive, error, config, progress } =
    useZATCAOnboarding(branchId);

  const handleConnect = async () => {
    const ok = await connect({ vatNumber, crNumber, businessName, environment });
    if (ok && config)  onSuccess?.(config);
    if (!ok && error)  onError?.(error);
  };

  if (isActive) {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
        <span className="text-green-600 text-xl">✅</span>
        <div className="flex-1">
          <p className="text-green-800 font-semibold text-sm">مرتبط بـ ZATCA Phase 2</p>
          <p className="text-green-600 text-xs">{config?.businessName} — {config?.vatNumber}</p>
        </div>
        <button
          onClick={disconnect}
          disabled={isLoading}
          className="text-xs text-red-500 hover:text-red-700 underline"
        >
          إلغاء الربط
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleConnect}
        disabled={isLoading}
        className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200
          ${isLoading
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg"
          }`}
      >
        {isLoading ? (
          <><span className="animate-spin">⏳</span>{progress || "جارٍ الربط..."}</>
        ) : (
          <><span>🔗</span>ربط حساب فاتورة</>
        )}
      </button>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
          <p className="text-red-800 font-semibold text-sm">{error.message}</p>
          {error.details && <p className="text-red-600 text-xs mt-1">{error.details}</p>}
          {error.retry && (
            <button onClick={handleConnect} className="mt-2 text-xs text-red-700 underline">
              إعادة المحاولة
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default useZATCAOnboarding;
