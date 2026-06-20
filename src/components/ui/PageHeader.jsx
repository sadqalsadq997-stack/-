import React from 'react';

export default function PageHeader({ title, titleEn, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="font-tajawal text-2xl font-bold text-left">{title}</h1>
        {titleEn && <p className="text-xs text-muted-foreground mt-0.5">{titleEn}</p>}
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>);

}