/**
 * ═══════════════════════════════════════════════════════════════════════════
 * لوحة مراقبة ZATCA — Admin Dashboard
 * عرض حالة جميع الفروع وإحصائيات الفواتير
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from "react";
import {
  Shield, CheckCircle, XCircle, Clock, AlertCircle,
  RefreshCw, Loader2, FileText, TrendingUp, Award,
  AlertTriangle, Activity, Eye, FlaskConical,
} from "lucide-react";
import { getZATCADashboard, getZATCALogs, runComplianceTests, testZATCAConnection } from "@/services/zatcaService";
import type { ZATCADashboardItem, ZATCALog } from "@/types/zatca";

// ── تحويل حالة Onboarding لعرض مناسب ─────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  not_started:            { label: "لم يبدأ",      color: "text-gray-500",   bg: "bg-gray-50",   dot: "bg-gray-400"  },
  otp_requested:          { label: "OTP مُرسَل",    color: "text-blue-600",   bg: "bg-blue-50",   dot: "bg-blue-400"  },
  otp_verified:           { label: "OTP مُتحقَّق",  color: "text-teal-600",   bg: "bg-teal-50",   dot: "bg-teal-400"  },
  csr_generated:          { label: "CSR جاهز",      color: "text-purple-600", bg: "bg-purple-50", dot: "bg-purple-400"},
  compliance_csid_issued: { label: "CSID صادر",     color: "text-orange-600", bg: "bg-orange-50", dot: "bg-orange-400"},
  production_csid_issued: { label: "PCSID صادر",    color: "text-emerald-600",bg: "bg-emerald-50",dot: "bg-emerald-400"},
  active:                 { label: "✅ مُفعَّل",    color: "text-green-600",  bg: "bg-green-50",  dot: "bg-green-500" },
  failed:                 { label: "⚠️ فشل",         color: "text-red-600",    bg: "bg-red-50",    dot: "bg-red-500"   },
};

const CERT_HEALTH_CONFIG: Record<string, { label: string; color: string }> = {
  valid:         { label: "✅ سارية",          color: "text-green-600" },
  expiring_soon: { label: "⚠️ تنتهي قريباً",   color: "text-yellow-600"},
  expired:       { label: "❌ منتهية",          color: "text-red-600"  },
  not_issued:    { label: "— لم تُصدر",         color: "text-gray-500" },
};

const LOG_TYPE_LABELS: Record<string, string> = {
  otp_request:      "طلب OTP",
  otp_verify:       "تحقق OTP",
  csr_generate:     "إنشاء CSR",
  csid_issue:       "إصدار CSID",
  pcsid_issue:      "إصدار PCSID",
  invoice_report:   "إبلاغ فاتورة",
  invoice_clearance:"تخليص فاتورة",
  invoice_cancel:   "إلغاء فاتورة",
  api_error:        "خطأ API",
  validation_error: "خطأ تحقق",
};

// ══════════════════════════════════════════════════════════════════════════
export default function ZATCADashboard() {
  const [items, setItems]       = useState<ZATCADashboardItem[]>([]);
  const [logs, setLogs]         = useState<ZATCALog[]>([]);
  const [loading, setLoading]   = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "logs" | "compliance">("overview");
  const [selectedBranch, setSelectedBranch] = useState<string | undefined>();
  const [complianceResults, setComplianceResults] = useState<Record<string, unknown> | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await getZATCADashboard();
      setItems(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function loadLogs(branchId?: string) {
    setLogsLoading(true);
    try {
      const data = await getZATCALogs(branchId, 200);
      setLogs(data);
    } catch (e) {
      console.error(e);
    }
    setLogsLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (activeTab === "logs") loadLogs(selectedBranch);
  }, [activeTab, selectedBranch]);

  async function handleRunCompliance() {
    if (!selectedBranch && items.length === 0) return;
    const bid = selectedBranch || items[0]?.branch_id;
    if (!bid) return;
    setComplianceLoading(true);
    try {
      const results = await runComplianceTests(bid);
      setComplianceResults(results as unknown as Record<string, unknown>);
    } catch (e) {
      console.error(e);
    }
    setComplianceLoading(false);
  }

  // ── إجماليات ──
  const totals = {
    active:  items.filter(i => i.onboarding_status === "active").length,
    pending: items.filter(i => !["active","failed"].includes(i.onboarding_status)).length,
    failed:  items.filter(i => i.onboarding_status === "failed").length,
    total:   items.length,
    invoices: items.reduce((s, i) => s + (i.total_invoices || 0), 0),
    reported: items.reduce((s, i) => s + (i.reported_count || 0), 0),
    rejected: items.reduce((s, i) => s + (i.rejected_count || 0), 0),
    expiring: items.filter(i => i.cert_health === "expiring_soon" || i.cert_health === "expired").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">

      {/* ── رأس الصفحة ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-black text-foreground">لوحة مراقبة ZATCA</h2>
            <p className="text-xs text-muted-foreground">متابعة حالة الربط والفواتير لجميع الفروع</p>
          </div>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 h-8 px-3 bg-muted rounded-xl text-xs font-medium hover:bg-muted/80">
          <RefreshCw className="w-3.5 h-3.5" /> تحديث
        </button>
      </div>

      {/* ── بطاقات الإحصاء ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<CheckCircle className="w-5 h-5 text-green-600"/>}
          value={totals.active} label="فروع مُفعَّلة" bg="bg-green-50" />
        <StatCard icon={<Clock className="w-5 h-5 text-yellow-600"/>}
          value={totals.pending} label="قيد الإعداد" bg="bg-yellow-50" />
        <StatCard icon={<XCircle className="w-5 h-5 text-red-600"/>}
          value={totals.failed} label="فشل التسجيل" bg="bg-red-50" />
        <StatCard icon={<AlertTriangle className="w-5 h-5 text-orange-600"/>}
          value={totals.expiring} label="شهادات تنتهي" bg="bg-orange-50" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<FileText className="w-5 h-5 text-blue-600"/>}
          value={totals.invoices} label="إجمالي الفواتير" bg="bg-blue-50" />
        <StatCard icon={<CheckCircle className="w-5 h-5 text-green-600"/>}
          value={totals.reported} label="مُبلَّغ عنها" bg="bg-green-50" />
        <StatCard icon={<XCircle className="w-5 h-5 text-red-600"/>}
          value={totals.rejected} label="مرفوضة" bg="bg-red-50" />
        <StatCard icon={<TrendingUp className="w-5 h-5 text-purple-600"/>}
          value={totals.total} label="إجمالي الفروع" bg="bg-purple-50" />
      </div>

      {/* ── تبويبات ── */}
      <div className="flex gap-2 border-b border-border">
        {[
          { id: "overview",   label: "نظرة عامة" },
          { id: "logs",       label: "سجلات API" },
          { id: "compliance", label: "اختبارات الامتثال" },
        ].map(tab => (
          <button key={tab.id}
            onClick={() => setActiveTab(tab.id as "overview" | "logs" | "compliance")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── نظرة عامة ── */}
      {activeTab === "overview" && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                {["الفرع","رقم الضريبة","البيئة","حالة التسجيل","الشهادة",
                  "الفواتير","مُبلَّغ","مرفوض","خطأ"].map(h => (
                  <th key={h} className="text-right px-4 py-3 text-xs font-bold text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                    لا توجد فروع مضافة بعد
                  </td>
                </tr>
              ) : items.map(item => {
                const sc = STATUS_CONFIG[item.onboarding_status] || STATUS_CONFIG.not_started;
                const ch = CERT_HEALTH_CONFIG[item.cert_health] || CERT_HEALTH_CONFIG.not_issued;
                return (
                  <tr key={item.branch_id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{item.branch_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {item.vat_number || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${
                        item.environment === "production" ? "text-green-600" :
                        item.environment === "simulation" ? "text-yellow-600" : "text-blue-600"
                      }`}>
                        {item.environment}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium ${sc.bg} ${sc.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium ${ch.color}`}>
                      {ch.label}
                    </td>
                    <td className="px-4 py-3 text-center">{item.total_invoices || 0}</td>
                    <td className="px-4 py-3 text-center text-green-600">{item.reported_count || 0}</td>
                    <td className="px-4 py-3 text-center text-red-600">{item.rejected_count || 0}</td>
                    <td className="px-4 py-3 text-center text-red-500">{item.error_count || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── سجلات API ── */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={selectedBranch || ""}
              onChange={e => setSelectedBranch(e.target.value || undefined)}
              className="h-8 px-3 bg-background border border-border rounded-xl text-sm">
              <option value="">جميع الفروع</option>
              {items.map(i => (
                <option key={i.branch_id} value={i.branch_id}>{i.branch_name}</option>
              ))}
            </select>
            <button onClick={() => loadLogs(selectedBranch)}
              className="h-8 px-3 bg-muted rounded-xl text-xs hover:bg-muted/80">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {logsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    {["الوقت","النوع","الاتجاه","الـ Endpoint","الحالة","المدة","خطأ"].map(h => (
                      <th key={h} className="text-right px-4 py-3 text-xs font-bold text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                        لا توجد سجلات
                      </td>
                    </tr>
                  ) : logs.map(log => (
                    <tr key={log.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("ar-SA")}
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-xs font-medium">
                          {LOG_TYPE_LABELS[log.log_type] || log.log_type}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs ${
                          log.direction === "response" ? "text-blue-600" :
                          log.direction === "request"  ? "text-orange-600" : "text-gray-500"
                        }`}>
                          {log.direction}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                        {log.endpoint ? new URL(log.endpoint).pathname : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {log.status_code ? (
                          <span className={`text-xs font-mono font-bold ${
                            log.status_code >= 200 && log.status_code < 300 ? "text-green-600" :
                            log.status_code >= 400 ? "text-red-600" : "text-yellow-600"
                          }`}>
                            {log.status_code}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {log.duration_ms ? `${log.duration_ms}ms` : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-red-600 max-w-[150px] truncate">
                        {log.error_message || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── اختبارات الامتثال ── */}
      {activeTab === "compliance" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedBranch || ""}
              onChange={e => setSelectedBranch(e.target.value || undefined)}
              className="h-8 px-3 bg-background border border-border rounded-xl text-sm">
              <option value="">اختر فرعاً</option>
              {items.map(i => (
                <option key={i.branch_id} value={i.branch_id}>{i.branch_name}</option>
              ))}
            </select>
            <button
              onClick={handleRunCompliance}
              disabled={complianceLoading}
              className="flex items-center gap-1.5 h-8 px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {complianceLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FlaskConical className="w-3.5 h-3.5" />
              }
              تشغيل الاختبارات
            </button>
          </div>

          {complianceResults && (() => {
            const cr = complianceResults as {
              passed: number; warnings: number; failed: number;
              tests: Array<{ name: string; status: string; message: string }>;
            };
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 rounded-2xl p-4 text-center">
                    <p className="text-3xl font-black text-green-600">{cr.passed}</p>
                    <p className="text-sm text-green-700">اختبار ناجح</p>
                  </div>
                  <div className="bg-yellow-50 rounded-2xl p-4 text-center">
                    <p className="text-3xl font-black text-yellow-600">{cr.warnings}</p>
                    <p className="text-sm text-yellow-700">تحذير</p>
                  </div>
                  <div className="bg-red-50 rounded-2xl p-4 text-center">
                    <p className="text-3xl font-black text-red-600">{cr.failed}</p>
                    <p className="text-sm text-red-700">فشل</p>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <h3 className="font-bold text-sm">تفاصيل الاختبارات</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {cr.tests?.map((test, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-3">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
                          ${test.status === "pass" ? "bg-green-100" : test.status === "fail" ? "bg-red-100" : "bg-yellow-100"}`}>
                          {test.status === "pass"
                            ? <CheckCircle className="w-3 h-3 text-green-600" />
                            : test.status === "fail"
                              ? <XCircle className="w-3 h-3 text-red-600" />
                              : <AlertCircle className="w-3 h-3 text-yellow-600" />
                          }
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{test.name}</p>
                          <p className="text-xs text-muted-foreground">{test.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {!complianceResults && !complianceLoading && (
            <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
              <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">اختر فرعاً واضغط "تشغيل الاختبارات" للتحقق من الامتثال</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon, value, label, bg,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  bg: string;
}) {
  return (
    <div className={`${bg} rounded-2xl p-4 flex items-center gap-3`}>
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <p className="text-2xl font-black text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
