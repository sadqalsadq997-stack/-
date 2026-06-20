// إعدادات الطابعة الحرارية — محفوظة في localStorage

export const PRINTER_TYPES = {
  browser: 'browser',   // طباعة عبر المتصفح (افتراضي)
  network: 'network',   // طابعة شبكية IP
  usb:     'usb',       // طابعة USB (Web USB API)
};

const KEY = 'felsy_printer_settings';

export function getPrinterSettings() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function savePrinterSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export const DEFAULT_PRINTER = {
  type: 'browser',
  paperWidth: '80mm',   // 80mm أو 58mm
  networkIp: '',
  networkPort: '9100',
  autoPrint: false,
  copies: 1,
  cutPaper: true,
  openCashDrawer: false,
};
