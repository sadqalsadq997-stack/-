import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { initSecurityLayer } from '@/lib/security/antiTamper';
import { setupPrivacyCleanup, injectPrivacyOverlay } from '@/lib/security/privacy';

// ── تشغيل طبقة الحماية فور تحميل الصفحة ──
initSecurityLayer();
setupPrivacyCleanup();
injectPrivacyOverlay();

// ضمان ظهور رمز الريال ﷼ (U+FDFC) في كل المتصفحات
// نضع الرمز في DOM مخفي عشان المتصفح يحمّل الـ glyph من الفونت
const sarPreload = document.createElement('span');
sarPreload.style.cssText = 'position:absolute;opacity:0;pointer-events:none;font-family:"Noto Sans Arabic","Tajawal",sans-serif;';
sarPreload.textContent = '\uFDFC';
document.body.appendChild(sarPreload);

createRoot(document.getElementById('root')).render(<App />);
