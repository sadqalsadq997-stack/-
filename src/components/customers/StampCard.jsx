import React from 'react';
import { Gift } from 'lucide-react';

export default function StampCard({ customer, stampsThreshold = 10, stampIcon = '⭐', rewardDesc = 'هدية مجانية', primaryColor = '#c0392b' }) {
  const stamps = customer?.stamps || 0;
  const threshold = stampsThreshold;
  const completed = Math.floor(stamps / threshold);
  const current = stamps % threshold;
  const isReady = stamps >= threshold;

  return (
    <div className="rounded-2xl overflow-hidden shadow-lg select-none" style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, #1a1a2e 100%)` }}>
      <div className="p-4 text-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-white/70">بطاقة الولاء</p>
            <p className="font-bold text-base">{customer?.name}</p>
          </div>
          <div className="text-left">
            <p className="text-xs text-white/70">الطوابع</p>
            <p className="font-bold text-2xl">{current}<span className="text-sm text-white/60">/{threshold}</span></p>
          </div>
        </div>

        {/* Stamps grid */}
        <div className="flex flex-wrap gap-2 my-3">
          {Array.from({ length: threshold }).map((_, i) => (
            <div
              key={i}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all ${
                i < current
                  ? 'bg-white shadow-md scale-110'
                  : 'bg-white/20 border border-white/30'
              }`}
            >
              {i < current ? stampIcon : <span className="opacity-30">{stampIcon}</span>}
            </div>
          ))}
        </div>

        {/* Reward */}
        <div className={`rounded-xl p-2.5 mt-2 flex items-center gap-2 ${isReady ? 'bg-amber-400/30 border border-amber-400/50' : 'bg-white/10'}`}>
          <Gift className={`w-4 h-4 flex-shrink-0 ${isReady ? 'text-amber-300' : 'text-white/50'}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-bold ${isReady ? 'text-amber-200' : 'text-white/70'}`}>
              {isReady ? `🎉 مبروك! استحق ${rewardDesc}` : rewardDesc}
            </p>
            {!isReady && <p className="text-[10px] text-white/50">متبقي {threshold - current} طابع</p>}
          </div>
          {completed > 0 && (
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full text-white/80">×{completed} دورة</span>
          )}
        </div>
      </div>
    </div>
  );
}