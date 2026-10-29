// رمز الريال السعودي الجديد (U+20C1) — يُعرض بخط SaudiRiyal المستضاف في الموقع
export const SAR = '⃁';
/** 1234.5 → "1,234.50 ⃁" */
export const formatSAR = (n, { decimals = 2 } = {}) =>
  `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${SAR}`;
