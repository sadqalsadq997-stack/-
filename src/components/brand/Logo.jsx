import React from 'react';
import markSrc from '@/assets/felsy-mark.png';

// ══════════════════════════════════════════════════════════════════
// شعار فلسي الرسمي (نبتة نمو + دوائر تقنية) — مستخرج من ملف الشعار الأصلي
// ══════════════════════════════════════════════════════════════════

export function LogoMark({ size = 40, className = '', title = 'فلسي Felsy' }) {
  return <img src={markSrc} alt={title} width={size} height={Math.round(size * 0.89)} className={`object-contain ${className}`} style={{ width: size, height: 'auto' }} />;
}

/** variant: 'dark' = نص فحمي (خلفية فاتحة) | 'light' = نص أبيض (خلفية غامقة) */
export default function Logo({ size = 38, variant = 'dark', latin = true, className = '' }) {
  const main = variant === 'light' ? 'text-white' : 'text-[#222528]';
  const sub = variant === 'light' ? 'text-white/60' : 'text-ink/55';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} dir="ltr">
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className={`font-bold tracking-tight ${main}`} style={{ fontSize: size * 0.68, lineHeight: 1 }}>Felsy</span>
        {latin && <span className={`mt-0.5 font-semibold ${sub}`} style={{ fontSize: size * 0.28 }} dir="rtl">فلسي</span>}
      </span>
    </span>
  );
}
