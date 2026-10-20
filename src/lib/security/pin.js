// PBKDF2 لرموز PIN — نفس الخوارزمية في كل مكان (حفظ + تحقق)
export async function hashPin(pin) {
  const enc = new TextEncoder();
  const salt = enc.encode('felsy-pin-salt-v2');
  const km = await crypto.subtle.importKey('raw', enc.encode(String(pin)), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    km, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}
