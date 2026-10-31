// يُستخدم وقت البناء فقط: يحوّل صفحات التسويق العامة إلى HTML ثابت
// حتى تقرأ محركات البحث وأدوات الذكاء الاصطناعي المحتوى كاملاً بدون JavaScript
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { Routes, Route } from 'react-router-dom';
import LandingPage from '@/pages/LandingPage';
import PricingPage from '@/pages/PricingPage';
import SolutionPage from '@/pages/SolutionPage';
import TermsConditions from '@/pages/TermsConditions';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import AboutUs from '@/pages/AboutUs';
import { SOLUTIONS, PUBLIC_ROUTES, getHead, SITE } from '@/content/seo';

export { PUBLIC_ROUTES, getHead, SITE, SOLUTIONS };

export function render(url) {
  return renderToString(
    <StaticRouter location={url}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        {SOLUTIONS.map(s => <Route key={s.slug} path={`/${s.slug}`} element={<SolutionPage slug={s.slug} />} />)}
        <Route path="/terms" element={<TermsConditions />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/about" element={<AboutUs />} />
      </Routes>
    </StaticRouter>
  );
}
