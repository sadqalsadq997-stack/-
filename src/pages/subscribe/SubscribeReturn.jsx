import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { callFunction } from '@/lib/api';
import { whatsappLink } from '@/lib/contact';
import Logo from '@/components/brand/Logo';
import { clearSubscribeState } from './SubscribeWizard';

// ══════════════════════════════════════════════════════════════════
// الرجوع من ميسر (بعد 3D Secure / Apple Pay / STC Pay)
// لا نثق بـ status في الرابط — السيرفر يجلب الدفعة من ميسر ويتأكد منها
// ══════════════════════════════════════════════════════════════════
export default function SubscribeReturn() {
  const [state, setState] = useState('checking'); // checking | paid | failed
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const paymentId = q.get('id');
    let orderId = '';
    try { orderId = sessionStorage.getItem('felsy_pay_order') || ''; } catch { /* */ }
    window.history.replaceState({}, '', '/subscribe/return');
    if (!paymentId || !orderId) {
      setMsg(q.get('message') || 'ما وصلتنا بيانات الدفع — ارجع لصفحة الاشتراك وحاول مرة ثانية');
      setState('failed');
      return;
    }
    (async () => {
      // نعيد المحاولة مرتين لأن تأكيد البنك أحياناً يتأخر ثواني
      for (let i = 0; i < 3; i++) {
        const { data, error } = await callFunction('billing-order', { action: 'verify_card', order_id: orderId, payment_id: paymentId });
        if (!error && data?.status === 'paid') { clearSubscribeState(); setState('paid'); return; }
        if (data?.status && data.status !== 'initiated') { setMsg(error || 'لم تكتمل عملية الدفع'); break; }
        setMsg(error || 'لم تكتمل عملية الدفع');
        await new Promise(r => setTimeout(r, 2500));
      }
      setState('failed');
    })();
  }, []);

  return (
    <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center bg-beige px-5 text-center text-ink">
      <Logo size={40} />
      <div className="mt-8 w-full max-w-sm rounded-3xl border border-beige-300 bg-white p-8">
        {state === 'checking' && (<><Loader2 className="mx-auto h-10 w-10 animate-spin text-sage-700" /><p className="mt-4 font-bold">جارٍ تأكيد الدفع مع البنك…</p></>)}
        {state === 'paid' && (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-sage-600" />
            <h1 className="mt-4 text-2xl font-black">تم تفعيل اشتراكك</h1>
            <p className="mt-2 text-slate-500">أهلاً بك في فلسي. الخطوة الجاية: اضبط رمز PIN وابدأ البيع.</p>
            <a href="/dashboard" className="mt-6 block rounded-2xl bg-ink py-3.5 font-black text-white">ادخل لوحة التحكم</a>
          </>
        )}
        {state === 'failed' && (
          <>
            <XCircle className="mx-auto h-14 w-14 text-red-500" />
            <h1 className="mt-4 text-xl font-black">ما اكتمل الدفع</h1>
            <p className="mt-2 text-sm text-slate-500">{msg}</p>
            <Link to="/auth/signup" className="mt-6 block rounded-2xl bg-ink py-3.5 font-black text-white">حاول مرة ثانية</Link>
            <a href={whatsappLink('واجهت مشكلة في دفع اشتراك فلسي')} target="_blank" rel="noopener noreferrer" className="mt-3 block text-sm font-bold text-sage-700">تواصل معنا على واتساب</a>
          </>
        )}
      </div>
    </div>
  );
}
