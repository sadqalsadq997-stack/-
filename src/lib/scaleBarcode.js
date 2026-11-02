/**
 * EAN-13 price/weight embedded barcode parser.
 * Layout: PP + PLU(5) + VALUE(5) + check digit.
 * The check digit is validated before any product lookup.
 */
export function isValidEan13(value) {
  const code = String(value ?? '').trim();
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, index) =>
    total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

export function parseScaleBarcode(barcode, expectedPrefix = '20') {
  const rawBarcode = String(barcode ?? '').trim();
  if (!/^\d{2}$/.test(String(expectedPrefix)) || rawBarcode.length !== 13 ||
      !rawBarcode.startsWith(String(expectedPrefix)) || !isValidEan13(rawBarcode)) {
    return { isScaleItem: false, rawBarcode };
  }
  return {
    isScaleItem: true,
    itemCode: rawBarcode.slice(2, 7),
    rawValue: Number(rawBarcode.slice(7, 12)),
    rawBarcode,
  };
}

export function decodeScaleValue(parsed, product) {
  if (!parsed?.isScaleItem || !product) return null;
  const divisor = Number(product.scale_value_divisor || (product.scale_value_type === 'weight' ? 1000 : 100));
  if (!Number.isFinite(divisor) || divisor <= 0) return null;
  const value = parsed.rawValue / divisor;
  if (!Number.isFinite(value) || value <= 0) return null;
  return { type: product.scale_value_type || 'price', value };
}
