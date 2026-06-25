import React from 'react';
import { Link } from 'react-router-dom';
import felsynLogo from '@/assets/felsy-logo.png';
import { CONTACT_INFO } from '@/lib/pricingPlans';
import { ArrowRight } from 'lucide-react';

export default function TermsConditions() {
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

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black text-gray-900 mb-2">الشروط والأحكام</h1>
        <p className="text-gray-400 text-sm mb-10">آخر تحديث: {new Date().toLocaleDateString('ar-SA')}</p>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. قبول الشروط</h2>
            <p>
              باستخدامك منصة "فلسي" بأي شكل، فإنك توافق على الالتزام بهذي الشروط والأحكام بالكامل. إذا لم
              توافق على أي بند منها، يُرجى عدم استخدام المنصة.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. وصف الخدمة</h2>
            <p>
              فلسي نظام برمجي (SaaS) لإدارة نقاط البيع والمخزون والفواتير الضريبية والعملاء، مُقدَّم لأصحاب
              المطاعم والمقاهي والمتاجر ومغاسل السيارات وغيرها من الأنشطة التجارية في المملكة العربية
              السعودية، مقابل اشتراك دوري حسب الباقة المختارة.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. الحساب والاشتراك</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li>يجب تقديم معلومات صحيحة ودقيقة عند إنشاء الحساب.</li>
              <li>أنت المسؤول الوحيد عن سرية بيانات الدخول لحسابك (البريد/كلمة المرور ورموز PIN الداخلية).</li>
              <li>تُحدَّد مميزات وقيود كل باقة (عدد الفروع، المستخدمين، المميزات المتاحة) حسب الباقة المختارة وقت الاشتراك.</li>
              <li>يحق لفلسي تعليق أو إيقاف الحساب في حال الاستخدام غير المشروع أو مخالفة هذي الشروط.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. الفوترة والدفع</h2>
            <p>
              الاشتراك دوري (شهري) حسب الباقة المختارة، ويُجدَّد تلقائياً عند انتهاء الفترة الحالية ما لم
              يُلغَ الاشتراك مسبقاً. الأسعار المعروضة في المنصة قابلة للتغيير مستقبلاً، وسيُعلَن أي تغيير
              قبل تطبيقه على الاشتراكات الحالية بفترة كافية.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. التزامات المستخدم</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li>استخدام المنصة فقط لأغراض تجارية مشروعة ووفق الأنظمة المعمول بها في المملكة.</li>
              <li>عدم محاولة اختراق النظام، أو الوصول لبيانات حسابات أخرى، أو إعادة هندسة الكود البرمجي.</li>
              <li>الالتزام بصحة البيانات المُدخلة في الفواتير الضريبية، حيث تقع المسؤولية النظامية عن دقتها على صاحب النشاط التجاري.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. الملكية الفكرية</h2>
            <p>
              جميع حقوق الملكية الفكرية المتعلقة بالنظام (الكود، التصميم، العلامة التجارية "فلسي") مملوكة
              بالكامل لمالك المنصة. لا يحق لأي مستخدم نسخ النظام أو إعادة بيعه أو توزيعه دون إذن خطي مسبق.
              بيانات أعمالك الخاصة (المنتجات، الطلبات، العملاء) تبقى ملكاً لك بالكامل.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. حدود المسؤولية</h2>
            <p>
              تُقدَّم الخدمة "كما هي"، ونسعى لأعلى مستويات الجاهزية والاستقرار، لكننا لا نضمن خلو الخدمة من
              أي انقطاع أو خطأ تقني بنسبة 100%. لا تتحمل فلسي مسؤولية أي خسارة تجارية غير مباشرة ناتجة عن
              انقطاع مؤقت في الخدمة، مع التزامنا بمعالجة أي مشكلة تقنية بأسرع وقت ممكن.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. الإلغاء والاسترجاع</h2>
            <p>
              يمكنك إلغاء اشتراكك في أي وقت من لوحة التحكم. لا يتم استرجاع أي مبالغ عن الفترة الحالية
              المدفوعة فعلياً، ويستمر الوصول للخدمة حتى نهاية الفترة المدفوعة.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">9. التعديل على الشروط</h2>
            <p>
              يحق لفلسي تعديل هذي الشروط من وقت لآخر. سيُعرض تاريخ آخر تحديث في أعلى الصفحة، واستمرارك في
              استخدام المنصة بعد أي تعديل يُعتبر موافقة على الشروط المُحدّثة.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">10. القانون الحاكم</h2>
            <p>
              تخضع هذي الشروط وتُفسَّر وفقاً لأنظمة المملكة العربية السعودية، وأي نزاع ينشأ يُحل وفق
              الجهات القضائية المختصة في المملكة.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">11. التواصل معنا</h2>
            <ul className="mt-3 space-y-1.5">
              <li>📞 <a href={`tel:${CONTACT_INFO.phone}`} className="text-red-600 hover:underline">{CONTACT_INFO.phone}</a></li>
              <li>✉️ <a href={`mailto:${CONTACT_INFO.email}`} className="text-red-600 hover:underline">{CONTACT_INFO.email}</a></li>
              <li>📍 {CONTACT_INFO.address}</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
