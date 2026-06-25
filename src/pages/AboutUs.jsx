import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import felsynLogo from '@/assets/felsy-logo.png';
import { CONTACT_INFO } from '@/lib/pricingPlans';
import { ArrowRight, Loader2 } from 'lucide-react';

const FALLBACK_CONTENT = `فلسي هو نظام نقطة بيع سعودي متكامل، صُمم خصيصاً لمساعدة المطاعم والمقاهي والمتاجر ومغاسل
السيارات على إدارة أعمالها بكل سهولة واحترافية. نوفّر لك كل ما تحتاجه: نقطة بيع سريعة، إدارة مخزون دقيقة،
فواتير ضريبية متوافقة مع هيئة الزكاة والضريبة والجمارك (ZATCA)، وتقارير تساعدك تتخذ قرارات أفضل لنشاطك.`;

export default function AboutUs() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'about_us_content').maybeSingle()
      .then(({ data }) => {
        setContent(data?.value || FALLBACK_CONTENT);
        setLoading(false);
      })
      .catch(() => { setContent(FALLBACK_CONTENT); setLoading(false); });
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-white">
      <header className="border-b border-gray-100 sticky top-0 bg-white/90 backdrop-blur-sm z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/home" className="flex items-center gap-2.5">
            <img src={felsynLogo} alt="فلسي Felsy" className="h-8 w-auto object-contain" />
          </Link>
          <Link to="/home" className="text-sm text-gray-500 hover:text-red-600 flex items-center gap-1">
            <ArrowRight className="w-4 h-4" /> العودة للرئيسية
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black text-gray-900 mb-8 text-center">من نحن</h1>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : (
          <div className="bg-gray-50 rounded-3xl p-8 md:p-10">
            <p className="text-gray-700 leading-loose text-lg whitespace-pre-line">{content}</p>
          </div>
        )}

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div className="p-6 rounded-2xl border border-gray-100">
            <p className="text-3xl font-black text-red-600 mb-1">100%</p>
            <p className="text-sm text-gray-500">متوافق مع ZATCA</p>
          </div>
          <div className="p-6 rounded-2xl border border-gray-100">
            <p className="text-3xl font-black text-red-600 mb-1">24/7</p>
            <p className="text-sm text-gray-500">دعم فني سعودي</p>
          </div>
          <div className="p-6 rounded-2xl border border-gray-100">
            <p className="text-3xl font-black text-red-600 mb-1">☁️</p>
            <p className="text-sm text-gray-500">نظام سحابي بالكامل</p>
          </div>
        </div>

        <div className="mt-12 text-center text-gray-500 text-sm space-y-1">
          <p>للتواصل معنا:</p>
          <p>
            <a href={`tel:${CONTACT_INFO.phone}`} className="text-red-600 hover:underline">{CONTACT_INFO.phone}</a>
            {' • '}
            <a href={`mailto:${CONTACT_INFO.email}`} className="text-red-600 hover:underline">{CONTACT_INFO.email}</a>
          </p>
          <p>{CONTACT_INFO.address}</p>
        </div>
      </main>
    </div>
  );
}
