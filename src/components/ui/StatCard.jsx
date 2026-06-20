import React from 'react';
import { cn } from '@/lib/utils';

export default function StatCard({ title, value, subtitle, icon: Icon, trend, trendUp, className }) {
  return (
    <div className={cn(
      "bg-card border border-border rounded-2xl p-5 relative overflow-hidden group hover:shadow-lg transition-all duration-300",
      className
    )}>
      <div className="absolute top-0 left-0 w-24 h-24 bg-primary/5 rounded-full -translate-x-8 -translate-y-8 group-hover:scale-150 transition-transform duration-500" />
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl font-bold font-tajawal">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend && (
            <p className={cn("text-xs font-medium", trendUp ? "text-emerald" : "text-ruby")}>
              {trend}
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-3 rounded-xl bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}