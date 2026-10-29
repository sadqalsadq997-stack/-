import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, Loader2, Smartphone, AlertTriangle, Apple } from 'lucide-react';
import LoyaltyCardView from '@/components/loyalty/LoyaltyCardView';

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


  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col items-center justify-center p-4 gap-6">
      {/* بطاقة المعاينة */}
      <div className="w-full max-w-sm">
        <LoyaltyCardView design={pass} customerName={pass.customer_name || 'عميلنا العزيز'} stamps={pass.stamps} points={pass.points} businessName={pass.business_name} />
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
