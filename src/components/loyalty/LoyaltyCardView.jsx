import React from 'react';
import { Wallet, Star, Gift } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// بطاقة الولاء — نفس الشكل في: شاشة التصميم، صفحة العميل، صفحة المحفظة
// الحركات (animation) يختارها صاحب المحل، وتتوقف تلقائياً لمن فعّل
// "تقليل الحركة" في جواله
// ══════════════════════════════════════════════════════════════════

export const LOYALTY_ANIMATIONS = [
  { id: 'shine',    label: 'لمعة',        desc: 'ضوء يمر على البطاقة' },
  { id: 'gradient', label: 'تدرّج متحرك', desc: 'ألوان تتموج بهدوء' },
  { id: 'glow',     label: 'توهّج',       desc: 'هالة ضوء حول البطاقة' },
  { id: 'sparkle',  label: 'نجوم',        desc: 'نجوم صغيرة تلمع' },
  { id: 'float',    label: 'طفو',         desc: 'البطاقة تطفو بخفة' },
  { id: 'pulse',    label: 'نبض الطوابع', desc: 'الطوابع المكتملة تنبض' },
  { id: 'tilt',     label: 'ميلان ثلاثي', desc: 'تميل مع حركة الإصبع' },
  { id: 'none',     label: 'بدون حركة',   desc: 'بطاقة ثابتة' },
];

export const LOYALTY_COLORS = [
  '#4F7360', '#2C3E50', '#B8655D', '#7C3AED', '#0F766E', '#B45309', '#BE123C', '#1D4ED8', '#111827', '#A16207', '#0E7490', '#9D174D',
];

function shade(hex, amt) {
  const n = parseInt((hex || '#4F7360').slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `#${[c(n >> 16), c((n >> 8) & 255), c(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export default function LoyaltyCardView({
  design = {}, customerName = 'عميلنا العزيز', stamps = 0, points = 0, businessName, compact = false, className = '',
}) {
  const bg = /^#[0-9a-f]{6}$/i.test(design.background_color || '') ? design.background_color : '#4F7360';
  const fg = /^#[0-9a-f]{6}$/i.test(design.text_color || '') ? design.text_color : '#ffffff';
  const accent = /^#[0-9a-f]{6}$/i.test(design.accent_color || '') ? design.accent_color : fg;
  const anim = design.animation || 'shine';
  const isStamps = (design.program_type || 'stamps') === 'stamps';
  const required = Math.max(1, Math.min(30, Number(design.stamps_required) || 10));
  const filled = Math.min(required, Math.max(0, Number(stamps) || 0));
  const complete = isStamps && filled >= required;

  const tilt = (e) => {
    if (anim !== 'tilt') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 14;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -14;
    e.currentTarget.style.transform = `perspective(700px) rotateY(${x}deg) rotateX(${y}deg)`;
  };
  const untilt = (e) => { if (anim === 'tilt') e.currentTarget.style.transform = ''; };

  return (
    <div
      className={`loyalty-card loyalty-anim-${anim} relative w-full overflow-hidden rounded-3xl shadow-xl ${compact ? 'p-4' : 'p-6'} ${className}`}
      style={{ '--lc-bg': bg, '--lc-bg2': shade(bg, -40), '--lc-bg3': shade(bg, 35), '--lc-fg': fg, '--lc-accent': accent, color: fg }}
      onPointerMove={tilt} onPointerLeave={untilt}
    >
      {anim === 'sparkle' && (
        <div className="lc-sparkles" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => <span key={i} style={{ '--i': i, top: `${8 + (i * 37) % 84}%`, left: `${6 + (i * 53) % 88}%` }} />)}
        </div>
      )}
      <div className="relative">
        <div className={`flex items-center justify-between ${compact ? 'mb-3' : 'mb-5'}`}>
          {design.logo_url ? (
            <img src={design.logo_url} alt="" className={`${compact ? 'h-9 w-9' : 'h-12 w-12'} rounded-xl bg-white/15 object-contain p-1`} />
          ) : (
            <span className={`${compact ? 'h-9 w-9' : 'h-12 w-12'} flex items-center justify-center rounded-xl bg-white/15`}><Wallet className="h-5 w-5" /></span>
          )}
          <span className="text-left text-xs opacity-85">{design.program_name || 'برنامج الولاء'}{businessName ? <><br />{businessName}</> : null}</span>
        </div>
        <p className="text-xs opacity-80">بطاقة ولاء</p>
        <p className={`${compact ? 'mb-3 text-lg' : 'mb-5 text-2xl'} font-black`}>{customerName}</p>

        {isStamps ? (
          <>
            <div className={`grid ${required > 10 ? 'grid-cols-6' : 'grid-cols-5'} gap-2`}>
              {Array.from({ length: required }).map((_, i) => {
                const on = i < filled;
                return (
                  <span key={i} className={`lc-stamp flex aspect-square items-center justify-center rounded-xl ${on ? 'lc-on' : ''}`}
                    style={{
                      background: on ? 'var(--lc-accent)' : 'transparent',
                      border: `1.5px ${on ? 'solid' : 'dashed'} var(--lc-fg)`,
                      opacity: on ? 1 : 0.55,
                      '--d': `${i * 90}ms`,
                    }}>
                    {i === required - 1 && !on ? <Gift className="h-4 w-4" /> : <Star className="h-4 w-4" style={{ color: on ? bg : fg, fill: on ? bg : 'none' }} />}
                  </span>
                );
              })}
            </div>
            <p className="mt-3 text-sm opacity-90">{filled} من {required} — {design.reward_description || 'مكافأة مجانية'}</p>
          </>
        ) : (
          <div>
            <p className="text-4xl font-black">{Number(points) || 0}</p>
            <p className="text-sm opacity-80">نقطة</p>
          </div>
        )}

        {complete && (
          <div className="lc-complete mt-4 rounded-xl bg-white/20 p-3 text-center text-sm font-bold">
            {design.completion_message || '🎉 تهانينا! اطلب مكافأتك الآن'}
          </div>
        )}
      </div>
    </div>
  );
}
