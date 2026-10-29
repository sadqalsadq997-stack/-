import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Loader2, Lock, LogOut, MessageCircle } from 'lucide-react';
import { clearSession } from '@/lib/security/session';
import { whatsappLink } from '@/lib/contact';
import SubscribeWizard from '@/pages/subscribe/SubscribeWizard';

// ══════════════════════════════════════════════════════════════════
// بوابة الاشتراك: النظام ما يفتح إلا باشتراك فعّال
//  • الحالة من السيرفر (my_billing_status) — المتصفح ما يقدر يعدّلها
//  • بدون اشتراك: نفس خطوات الاشتراك في الموقع (فروع/مدة/دفع بطاقة أو تحويل)
//  • وحتى لو تجاوز أحد هذي الصفحة، القاعدة نفسها ترفض بياناته (RLS)
// ══════════════════════════════════════════════════════════════════

const ACTIVE = ['active', 'trialing'];
const isActive = (st) => st && ACTIVE.includes(st.sub_status) && st.period_end && new Date(st.period_end) > new Date();

async function signOut() {
  clearSession();
  try { await supabase.auth.signOut(); } catch { /* تجاهل */ }
  window.location.replace('/auth/login');
}

function Centered({ children }) {
  return (
    <div dir="rtl" className="fixed inset-0 z-[9999] flex items-center justify-center bg-beige p-5 text-ink">
      <div className="w-full max-w-md rounded-3xl border border-beige-300 bg-white p-8 text-center">{children}</div>
    </div>
  );
}

export default function PaymentGate({ children }) {
  const [phase, setPhase] = useState('checking'); // checking | paid | pay | not_manager | error

  async function load() {
    const { data, error } = await supabase.rpc('my_billing_status');
    if (error) { setPhase('error'); return; }
    const st = Array.isArray(data) ? data[0] : data;
    if (isActive(st)) return setPhase('paid');
    if (st?.tenant_id && !['owner', 'admin'].includes(st.role)) return setPhase('not_manager');
    setPhase('pay'); // بدون منشأة أو بدون اشتراك → خطوات الاشتراك
  }

  useEffect(() => { load(); }, []);

  if (phase === 'paid') return children;

  if (phase === 'checking') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <Centered>
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
        <p className="mb-5 text-slate-600">تعذر التحقق من الاشتراك — تأكد من الإنترنت وحاول مرة ثانية</p>
        <button onClick={() => { setPhase('checking'); load(); }} className="h-11 w-full rounded-xl bg-ink font-bold text-white">إعادة المحاولة</button>
      </Centered>
    );
  }

  if (phase === 'not_manager') {
    return (
      <Centered>
        <Lock className="mx-auto mb-3 h-10 w-10 text-slate-400" />
        <h2 className="mb-2 text-xl font-black">اشتراك المنشأة غير فعّال</h2>
        <p className="text-sm text-slate-500">تواصل مع مالك المنشأة لتجديد الاشتراك.</p>
        <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-sage-700">
          <MessageCircle className="h-4 w-4" /> أو تواصل معنا
        </a>
        <button onClick={signOut} className="mt-4 flex w-full items-center justify-center gap-1.5 text-sm text-slate-500"><LogOut className="h-4 w-4" />خروج</button>
      </Centered>
    );
  }

  return <SubscribeWizard embedded />;
}
