import React from 'react';
import { CONTACT } from '@/lib/contact';

// "صنع بواسطة فلسي" — أسفل كل منيو/متجر/بطاقة/بيجر، ويفتح موقع فلسي
export default function MadeByFelsy({ source = 'menu', className = '', tone = 'muted' }) {
  const href = `${CONTACT.site}/?utm_source=${encodeURIComponent(source)}&utm_medium=made_by&utm_campaign=felsy_badge`;
  return (
    <a href={href} target="_blank" rel="noopener"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-opacity hover:opacity-100 ${tone === 'light' ? 'text-white/80' : 'text-muted-foreground'} opacity-80 ${className}`}>
      صنع بواسطة
      <img src="/logo-square.png" alt="" width="16" height="16" className="h-4 w-4 rounded" loading="lazy" />
      <strong className="font-black">فلسي</strong>
    </a>
  );
}
