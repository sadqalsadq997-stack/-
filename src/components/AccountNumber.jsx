import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HelpCircle, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// بيانات حساب المنشأة (اسم + رقم الحساب + الباقة) — استعلام واحد مخزّن
export function useMyAccount() {
  return useQuery({
    queryKey: ['my-account'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_account');
      if (error) return null;
      return data;
    },
    staleTime: 10 * 60_000,
  });
}

// "رقم الحساب" مع علامة ؟ توضّح معناه
export default function AccountNumber({ tone = 'default', className = '', showName = false }) {
  const { data: acc } = useMyAccount();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!acc?.account_number) return null;
  const muted = tone === 'sidebar' ? 'text-sidebar-foreground/60' : 'text-muted-foreground';
  const strong = tone === 'sidebar' ? 'text-sidebar-foreground' : 'text-foreground';

  const copy = async () => {
    try { await navigator.clipboard.writeText(String(acc.account_number)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  };

  return (
    <div className={`relative ${className}`}>
      {showName && <p className={`truncate text-xs font-bold ${strong}`}>{acc.name}</p>}
      <div className={`flex items-center gap-1 text-[11px] ${muted}`}>
        <span>رقم الحساب</span>
        <button type="button" onClick={copy} title="نسخ" className={`flex items-center gap-0.5 font-mono font-bold ${strong}`} dir="ltr">
          {acc.account_number}{copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-50" />}
        </button>
        <button type="button" aria-label="ما هو رقم الحساب؟" aria-expanded={open}
          onClick={() => setOpen(v => !v)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
          className="rounded-full hover:opacity-100 opacity-70"><HelpCircle className="h-3.5 w-3.5" /></button>
      </div>
      {open && (
        <div role="tooltip" className="absolute right-0 top-full z-50 mt-1 w-60 rounded-xl border border-border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-xl">
          <p className="font-bold">ما هو رقم الحساب؟</p>
          <p className="mt-1 text-muted-foreground">هذا رقم حساب منشأتك المسجّل باسمك في فلسي، ويظهر أسفل اسم المنشأة. اذكره عند التواصل مع الدعم الفني ليتعرّفوا على حسابك فوراً — وهو أيضاً رابط المنيو المختصر: <span dir="ltr" className="font-mono">felsy.org/m/{acc.slug || acc.account_number}</span></p>
        </div>
      )}
    </div>
  );
}
