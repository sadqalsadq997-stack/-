import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CreditCard, Download, Loader2, ShieldAlert, Trash2, XCircle, RotateCcw, Mail, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { callFunction } from '@/lib/api';
import { useMyAccount } from '@/components/AccountNumber';
import { CONTACT, whatsappLink } from '@/lib/contact';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const STATUS = { active: 'فعّال', trialing: 'تجريبي', past_due: 'متأخر الدفع', suspended: 'موقوف', cancelled: 'ملغي', pending_payment: 'بانتظار الدفع' };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }) : '—');

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4" />{label}</span>
      <span className="font-bold text-foreground">{children}</span>
    </div>
  );
}

// تنزيل نسخة من الفواتير قبل الحذف (نظام الضريبة يلزم بحفظها 6 سنوات)
async function exportOrdersCsv() {
  const rows = [];
  for (let from = 0; from < 200000; from += 1000) {
    const { data } = await supabase.from('orders')
      .select('order_number, created_at, status, payment_method, subtotal, tax_amount, total, customer_phone')
      .order('created_at').range(from, from + 999);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const head = ['رقم الفاتورة', 'التاريخ', 'الحالة', 'طريقة الدفع', 'قبل الضريبة', 'الضريبة', 'الإجمالي', 'جوال العميل'];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [head, ...rows.map(r => [r.order_number, r.created_at, r.status, r.payment_method, r.subtotal, r.tax_amount, r.total, r.customer_phone])]
    .map(r => r.map(cell).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `felsy-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return rows.length;
}

export default function AccountTab() {
  const { data: acc, isLoading } = useMyAccount();
  const qc = useQueryClient();
  const [dlg, setDlg] = useState(null); // 'cancel' | 'delete'
  const [busy, setBusy] = useState(false);
  const [confirmNo, setConfirmNo] = useState('');
  const [password, setPassword] = useState('');
  const isOwner = acc?.role === 'owner';

  if (isLoading) return <div className="flex h-40 items-center justify-center rounded-2xl border border-border bg-card"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (!acc) return null;

  async function setCancel(cancel) {
    setBusy(true);
    const { error } = await callFunction('account-manage', { action: cancel ? 'cancel_subscription' : 'resume_subscription' });
    setBusy(false); setDlg(null);
    if (error) { toast.error(error); return; }
    toast.success(cancel ? `تم إلغاء التجديد — اشتراكك يبقى شغال حتى ${fmtDate(acc.period_end)}` : 'تم إلغاء طلب الإلغاء، اشتراكك مستمر');
    qc.invalidateQueries({ queryKey: ['my-account'] });
  }

  async function deleteAccount() {
    setBusy(true);
    const { error } = await callFunction('account-manage', { action: 'delete_account', confirm_account: confirmNo.trim(), password });
    setBusy(false);
    if (error) { toast.error(error); return; }
    toast.success('تم حذف الحساب وكل بياناته');
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* */ }
    await supabase.auth.signOut().catch(() => {});
    window.location.replace('/');
  }

  return (
    <div className="max-w-2xl space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-2 font-bold">الحساب والاشتراك</h3>
        <div className="divide-y divide-border">
          <Row icon={Hash} label="رقم الحساب"><span dir="ltr" className="font-mono">{acc.account_number}</span></Row>
          <Row icon={Mail} label="البريد"><span dir="ltr">{acc.email}</span></Row>
          <Row icon={CreditCard} label="الباقة">{acc.plan || '—'} · {STATUS[acc.status] || acc.status || 'بدون اشتراك'}</Row>
          <Row icon={CalendarClock} label={acc.cancel_at_period_end ? 'ينتهي في' : 'يتجدد في'}>{fmtDate(acc.period_end)}</Row>
        </div>
        {acc.cancel_at_period_end && (
          <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            ألغيت التجديد — النظام يبقى شغال لين {fmtDate(acc.period_end)} وبعدها يتوقف.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/subscribe" className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
            <CreditCard className="h-4 w-4" /> تجديد / ترقية / فروع إضافية
          </Link>
          {isOwner && (acc.cancel_at_period_end ? (
            <button onClick={() => setCancel(false)} disabled={busy} className="flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-bold">
              <RotateCcw className="h-4 w-4" /> التراجع عن الإلغاء
            </button>
          ) : acc.status && acc.status !== 'cancelled' && (
            <button onClick={() => setDlg('cancel')} className="flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-bold text-muted-foreground hover:text-foreground">
              <XCircle className="h-4 w-4" /> إلغاء الاشتراك
            </button>
          ))}
        </div>
      </section>

      {isOwner ? (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <h3 className="flex items-center gap-2 font-bold text-destructive"><ShieldAlert className="h-5 w-5" /> حذف الحساب</h3>
          <p className="mt-1 text-sm text-muted-foreground">يحذف المنشأة وكل الفروع والمنتجات والفواتير والعملاء وحسابات الموظفين نهائياً — ولا يمكن استرجاعها.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={async () => { const n = await exportOrdersCsv(); toast.success(`تم تنزيل ${n} فاتورة`); }}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-bold">
              <Download className="h-4 w-4" /> تنزيل نسخة من فواتيري
            </button>
            <button onClick={() => { setConfirmNo(''); setPassword(''); setDlg('delete'); }}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-destructive px-4 text-sm font-bold text-destructive-foreground">
              <Trash2 className="h-4 w-4" /> حذف الحساب
            </button>
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">إلغاء الاشتراك وحذف الحساب متاحة لمالك المنشأة فقط.</p>
      )}

      <p className="text-xs text-muted-foreground">
        تحتاج مساعدة؟ <a href={whatsappLink(`رقم حسابي ${acc.account_number}`)} target="_blank" rel="noopener" className="font-bold text-primary">كلمنا واتساب {CONTACT.phoneDisplay}</a>
      </p>

      {/* تأكيد الإلغاء */}
      <AlertDialog open={dlg === 'cancel'} onOpenChange={(o) => !o && setDlg(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل ترغب حقاً بإلغاء اشتراكك؟</AlertDialogTitle>
            <AlertDialogDescription>
              ما راح نجدد اشتراكك. النظام يبقى شغال لين {fmtDate(acc.period_end)}، وبعدها يتوقف البيع والفواتير. تقدر تتراجع في أي وقت قبل هذا التاريخ.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>لا، خلّه مستمر</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); setCancel(true); }} disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'نعم، ألغِ الاشتراك'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* تأكيد الحذف */}
      <AlertDialog open={dlg === 'delete'} onOpenChange={(o) => !o && setDlg(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل ترغب حقاً بحذف حسابك؟</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>هذا الإجراء نهائي. كل بيانات منشأتك تنحذف ولا يمكن استرجاعها.</p>
                <p className="rounded-lg bg-amber-500/10 p-2 text-amber-700 dark:text-amber-400">تنبيه: نظام ضريبة القيمة المضافة يلزم المنشآت بحفظ الفواتير 6 سنوات — نزّل نسخة من فواتيرك قبل الحذف.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="block text-sm">اكتب رقم الحساب <b dir="ltr" className="font-mono">{acc.account_number}</b> للتأكيد</label>
            <input value={confirmNo} onChange={e => setConfirmNo(e.target.value)} inputMode="numeric" dir="ltr"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 font-mono focus:border-destructive focus:outline-none" />
            <label className="block text-sm">كلمة المرور</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 focus:border-destructive focus:outline-none" />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); deleteAccount(); }}
              disabled={busy || confirmNo.trim() !== String(acc.account_number) || password.length < 6}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'نعم، احذف حسابي نهائياً'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
