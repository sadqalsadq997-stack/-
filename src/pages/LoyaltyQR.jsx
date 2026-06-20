import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, Loader2, Smartphone, AlertTriangle, Stamp, Star, Apple } from 'lucide-react';

// ══════════════════════════════════════════════════════
// صفحة QR العامة لبطاقة الولاء — /wallet/:token
// ══════════════════════════════════════════════════════
// هذه الصفحة هي ما يفتحه جوال العميل بعد مسح رمز QR.
// لا تحتاج تسجيل دخول، ولا تكشف أي بيانات عن باقي العملاء —
// تعتمد فقط على RPC آمن (get_wallet_pass_by_token) يرجع
// بطاقة واحدة بالضبط بناءً على الرمز السري بالرابط.
//
// السلوك:
//  - أندرويد → زر "أضف إلى Google Wallet" يفتح رابط pay.google.com
//    مباشرة فيُحفظ البطاقة في جوال العميل بدون أي تطبيق إضافي.
//  - آيفون → حالياً تظهر رسالة "قريباً" (Apple Wallet يحتاج
//    شهادات Apple Developer منفصلة، تُضاف في مرحلة لاحقة بدون
//    أي تعديل على هذه الصفحة — فقط تفعيل الزر الموجود مسبقاً).
// ══════════════════════════════════════════════════════

function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export default function LoyaltyQR() {
  const { token } = useParams();
  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const platform = detectPlatform();

  useEffect(() => {
    if (!token) return;
    supabase.rpc('get_wallet_pass_by_token', { p_token: token })
      .then(({ data, error }) => {
        if (error || !data?.length) {
          setError('لم يتم العثور على بطاقة الولاء — تأكد من الرابط أو تواصل مع المحل');
        } else {
          setPass(data[0]);
        }
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !pass) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-3xl p-8 max-w-sm text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="font-bold text-foreground">{error || 'حدث خطأ'}</p>
        </div>
      </div>
    );
  }

  const isStamps = pass.program_type === 'stamps';
  const bg = pass.background_color || '#dc2626';
  const fg = pass.text_color || '#ffffff';
  const completed = isStamps && pass.stamps >= pass.stamps_required;

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col items-center justify-center p-4 gap-6">
      {/* بطاقة المعاينة */}
      <div className="rounded-3xl p-6 shadow-2xl w-full max-w-sm" style={{ backgroundColor: bg, color: fg }}>
        <div className="flex items-center justify-between mb-6">
          {pass.logo_url ? (
            <img src={pass.logo_url} alt="logo" className="w-12 h-12 rounded-xl object-contain bg-white/10 p-1" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
              <Wallet className="w-6 h-6" />
            </div>
          )}
          <span className="text-xs opacity-80">{pass.program_name}</span>
        </div>

        <p className="text-sm opacity-80 mb-1">عزيزي العميل</p>
        <p className="text-2xl font-black mb-5">{pass.customer_name || 'عميل'}</p>

        {isStamps ? (
          <div>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {Array.from({ length: pass.stamps_required || 10 }).map((_, i) => (
                <div key={i}
                  className="aspect-square rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: i < pass.stamps ? fg : 'transparent',
                    border: `1.5px ${i < pass.stamps ? 'solid' : 'dashed'} ${fg}`,
                    opacity: i < pass.stamps ? 1 : 0.5,
                  }}>
                  <Stamp className="w-4 h-4" style={{ color: i < pass.stamps ? bg : fg }} />
                </div>
              ))}
            </div>
            <p className="text-sm opacity-90">{pass.stamps} من {pass.stamps_required} طابع</p>
          </div>
        ) : (
          <div>
            <p className="text-4xl font-black">{pass.points}</p>
            <p className="text-sm opacity-80 mt-1">نقطة</p>
          </div>
        )}

        {completed && (
          <div className="mt-4 bg-white/15 rounded-xl p-3 text-sm font-bold text-center">
            {pass.completion_message || '🎉 تهانينا! اطلب مكافأتك الآن'}
          </div>
        )}
      </div>

      {/* أزرار الإضافة للمحفظة */}
      <div className="w-full max-w-sm space-y-3">
        {platform === 'ios' ? (
          <div className="bg-card border border-border rounded-2xl p-5 text-center space-y-2">
            <Apple className="w-7 h-7 mx-auto text-foreground" />
            <p className="text-sm font-bold text-foreground">دعم Apple Wallet قريباً</p>
            <p className="text-xs text-muted-foreground">يمكنك حالياً متابعة رصيدك من هذه الصفحة، وسنوافيك بإمكانية الحفظ في Apple Wallet قريباً.</p>
          </div>
        ) : pass.save_url ? (
          <a href={pass.save_url}
            className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl bg-black text-white font-bold text-sm hover:opacity-90 transition-opacity">
            <Wallet className="w-5 h-5" />
            أضف إلى Google Wallet
          </a>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-5 text-center">
            <Smartphone className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">بطاقتك قيد التحضير، حاول مرة أخرى بعد قليل</p>
          </div>
        )}
      </div>
    </div>
  );
}
