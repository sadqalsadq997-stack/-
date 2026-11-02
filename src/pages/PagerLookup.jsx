import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { BellRing, Loader2, Search, ShieldCheck, XCircle } from 'lucide-react';

export default function PagerLookup() {
  const { branchToken } = useParams();
  const navigate = useNavigate();
  const [branch, setBranch] = useState(null);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!/^[a-f0-9]{32,64}$/i.test(branchToken || '')) {
        if (alive) { setBranch(null); setLoading(false); }
        return;
      }
      const { data, error: lookupError } = await supabase.rpc('pager_public_branch', { p_public_token: branchToken });
      const row = Array.isArray(data) ? data[0] : data;
      if (alive) {
        setBranch(!lookupError && row?.business_name ? row : null);
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [branchToken]);

  async function submit(e) {
    e.preventDefault();
    const value = invoiceNo.trim();
    if (value.length < 3 || value.length > 64) {
      setError('أدخل رقم الفاتورة كما يظهر في الإيصال.');
      return;
    }
    setSearching(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('pager_start_for_invoice', {
      p_public_token: branchToken,
      p_invoice_no: value,
    });
    setSearching(false);
    const row = Array.isArray(data) ? data[0] : data;
    if (rpcError || !row?.pager_token) {
      setError('لم نعثر على فاتورة بهذا الرقم. تأكد من الرقم أو راجع الكاشير.');
      return;
    }
    navigate(`/p/${row.pager_token}`);
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;
  if (!branch) return (
    <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
      <XCircle className="h-12 w-12 text-slate-300" />
      <h1 className="text-xl font-black text-slate-800">رابط المنشأة غير متاح</h1>
      <p className="text-sm text-slate-500">اطلب رابط البيجر الصحيح من المنشأة.</p>
    </div>
  );

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50 to-slate-100 p-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl sm:p-8">
        {branch.logo_url
          ? <img src={branch.logo_url} alt="" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain" />
          : <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><BellRing className="h-8 w-8" /></div>}
        <p className="text-sm font-bold text-emerald-700">البيجر الإلكتروني</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">{branch.business_name}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">أدخل رقم الفاتورة الموجود في إيصالك لمتابعة حالة الطلب واستلام تنبيه عند جاهزيته.</p>
        <form onSubmit={submit} className="mt-7 space-y-3 text-right">
          <label className="block text-sm font-bold text-slate-700" htmlFor="invoice-number">رقم الفاتورة</label>
          <input id="invoice-number" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)}
            autoComplete="off" dir="ltr" placeholder="INV-000123"
            className="h-14 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 text-center font-mono text-lg font-bold tracking-wide outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
          {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
          <button type="submit" disabled={searching || !invoiceNo.trim()}
            className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-black text-white transition hover:bg-emerald-700 disabled:opacity-50">
            {searching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            متابعة طلبي
          </button>
        </form>
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-right text-xs leading-5 text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
          لا نعرض تفاصيل الفاتورة أو بياناتك؛ نستخدم رقمها فقط لفتح رابط متابعة خاص بطلبك.
        </div>
        <p className="mt-5 text-[11px] text-slate-400">مدعوم من Felsy</p>
      </section>
    </main>
  );
}
