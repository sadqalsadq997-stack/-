import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// خط Cairo مستضاف محلياً (أسرع ولا يعتمد على Google Fonts)
import '@fontsource/cairo/arabic-400.css';
import '@fontsource/cairo/arabic-500.css';
import '@fontsource/cairo/arabic-600.css';
import '@fontsource/cairo/arabic-700.css';
import '@fontsource/cairo/arabic-800.css';
import '@fontsource/cairo/latin-400.css';
import '@fontsource/cairo/latin-600.css';
import '@fontsource/cairo/latin-700.css';
import '@fontsource/cairo/latin-800.css';
import './index.css';
import { initSecurityLayer } from '@/lib/security/antiTamper';
import { setupPrivacyCleanup, injectPrivacyOverlay } from '@/lib/security/privacy';

// ── تشغيل طبقة الحماية فور تحميل الصفحة ──
initSecurityLayer();
setupPrivacyCleanup();
injectPrivacyOverlay();

// تحميل خط رمز الريال الجديد ⃁ (U+20C1) مبكراً من سيرفرات الموقع
const sarPreload = document.createElement('span');
sarPreload.setAttribute('aria-hidden', 'true');
sarPreload.style.cssText = 'position:absolute;opacity:0;pointer-events:none;font-family:"SaudiRiyal",sans-serif;';
sarPreload.textContent = '\u20C1';
document.body.appendChild(sarPreload);

createRoot(document.getElementById('root')).render(<App />);
