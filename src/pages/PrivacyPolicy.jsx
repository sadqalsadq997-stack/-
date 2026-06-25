import React from 'react';
import { Link } from 'react-router-dom';
import felsynLogo from '@/assets/felsy-logo.png';
import { CONTACT_INFO } from '@/lib/pricingPlans';
import { ArrowRight } from 'lucide-react';

export default function PrivacyPolicy() {
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
        <h1 className="text-3xl font-black text-gray-900 mb-2">سياسة الخصوصية</h1>
        <p className="text-gray-400 text-sm mb-10">آخر تحديث: {new Date().toLocaleDateString('ar-SA')}</p>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. مقدمة</h2>
            <p>
              تحترم "فلسي" خصوصية مستخدمي نظامها، وتلتزم بحماية البيانات الشخصية وبيانات الأعمال التي
              تتم معالجتها عبر المنصة. توضّح هذي السياسة كيف نجمع المعلومات ونستخدمها ونحميها عند استخدامك
              لنظام فلسي لنقاط البيع وإدارة الأعمال.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. البيانات التي نجمعها</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li>بيانات الحساب: الاسم، البريد الإلكتروني، رقم الجوال، اسم النشاط التجاري.</li>
              <li>بيانات تشغيلية: المنتجات، الطلبات، الفواتير، بيانات العملاء التي يُدخلها صاحب الحساب.</li>
              <li>بيانات الفوترة: تفاصيل الاشتراك وسجل الدفعات (لا نخزّن بيانات بطاقات الدفع الكاملة بأنفسنا، تتم معالجتها عبر مزوّد دفع معتمد).</li>
              <li>بيانات تقنية: عنوان IP، نوع المتصفح، سجلات الاستخدام لأغراض الأمان وتحسين الخدمة.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. عزل بيانات كل منشأة</h2>
            <p>
              تُبنى منصة فلسي على مبدأ العزل الكامل لبيانات كل عميل (Multi-Tenant Isolation): لا يمكن
              لأي صاحب حساب الوصول إلى بيانات منشأة أخرى مهما كانت الظروف، وذلك عبر آليات تقنية صارمة على
              مستوى قاعدة البيانات (Row-Level Security) لا يمكن تجاوزها من واجهة الاستخدام العادية.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. كيف نستخدم بياناتك</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li>تقديم خدمة نقطة البيع وإدارة الأعمال وتشغيلها بشكل صحيح.</li>
              <li>إصدار الفواتير الضريبية المتوافقة مع متطلبات هيئة الزكاة والضريبة والجمارك (ZATCA).</li>
              <li>التواصل معك بخصوص حسابك أو التحديثات أو الدعم الفني.</li>
              <li>تحسين الخدمة وتحليل الاستخدام بشكل مجمّع وغير شخصي حيثما أمكن.</li>
              <li>الامتثال للأنظمة واللوائح المعمول بها في المملكة العربية السعودية.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. مشاركة البيانات مع طرف ثالث</h2>
            <p>
              لا نبيع بياناتك لأي طرف ثالث. قد نشارك بيانات محدودة مع مزوّدي خدمات ضروريين لتشغيل المنصة
              (مثل مزوّد البنية السحابية، مزوّد بوابة الدفع، أو هيئة الزكاة والضريبة والجمارك عند إصدار
              الفواتير الإلكترونية)، وفقط بالقدر اللازم لتقديم الخدمة.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. أمان البيانات</h2>
            <p>
              نستخدم تشفيراً للاتصال (HTTPS)، وتشفيراً لكلمات المرور وأرقام PIN، وسياسات وصول صارمة، ونراقب
              محاولات الوصول غير المصرّح بها. مع ذلك، لا توجد طريقة نقل أو تخزين إلكتروني آمنة بنسبة 100%،
              ونعمل دائماً على تحسين معايير الحماية.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. حقوقك</h2>
            <p>
              يحق لك في أي وقت طلب الوصول إلى بياناتك، تصحيحها، أو طلب حذف حسابك وبياناته (مع مراعاة أي
              التزامات نظامية تتطلب الاحتفاظ بسجلات معينة، مثل السجلات المحاسبية والضريبية لفترة محددة
              نظاماً).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. الاحتفاظ بالبيانات</h2>
            <p>
              نحتفظ ببياناتك طالما حسابك نشط، ولفترة إضافية بعد إلغاء الحساب وفقاً للمتطلبات النظامية
              (خصوصاً السجلات الضريبية والمحاسبية التي قد تتطلب الاحتفاظ بها لسنوات حسب نظام هيئة الزكاة
              والضريبة والجمارك).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">9. التواصل معنا</h2>
            <p>لأي استفسار يخص هذي السياسة أو بياناتك، تواصل معنا عبر:</p>
            <ul className="mt-3 space-y-1.5">
              <li>📞 <a href={`tel:${CONTACT_INFO.phone}`} className="text-red-600 hover:underline">{CONTACT_INFO.phone}</a></li>
              <li>✉️ <a href={`mailto:${CONTACT_INFO.email}`} className="text-red-600 hover:underline">{CONTACT_INFO.email}</a></li>
              <li>📍 {CONTACT_INFO.address}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">10. تحديثات هذي السياسة</h2>
            <p>
              قد نُحدّث سياسة الخصوصية من وقت لآخر. سيُعرض تاريخ آخر تحديث في أعلى الصفحة، ويُعتبر استمرارك
              باستخدام المنصة بعد أي تحديث موافقة على النسخة المُحدّثة.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
