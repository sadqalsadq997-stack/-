// ══════════════════════════════════════════════════════════════════
// felsy — وحدة التشفير المركزية
// كل عمليات التشفير والتحقق تمر من هنا
// ══════════════════════════════════════════════════════════════════

const ENC = new TextEncoder();
const DEC = new TextDecoder();

// ── 1. Hash آمن باستخدام PBKDF2 (أقوى من SHA-256 المباشر) ──────
export async function hashPIN(pin: string, salt?: string): Promise<string> {
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const saltBytes: Uint8Array = typeof s === 'string'
    ? Uint8Array.from(atob(s), c => c.charCodeAt(0))
    : s as Uint8Array;
  const saltBuffer: ArrayBuffer = saltBytes.buffer.slice(
    saltBytes.byteOffset,
    saltBytes.byteOffset + saltBytes.byteLength
  ) as ArrayBuffer;

  const keyMaterial = await crypto.subtle.importKey(
    'raw', ENC.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuffer, iterations: 120_000, hash: 'SHA-512' },
    keyMaterial, 256
  );
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
  const saltB64 = typeof s === 'string' ? s : btoa(String.fromCharCode(...saltBytes));
  return `pbkdf2:${saltB64}:${hashHex}`;
}

export async function verifyPIN(pin: string, stored: string): Promise<boolean> {
  try {
    if (stored.startsWith('pbkdf2:')) {
      const [, saltB64] = stored.split(':');
      const reHashed = await hashPIN(pin, saltB64);
      return timingSafeEqual(reHashed, stored);
    }
    // دعم SHA-256 القديم للهجرة
    const old = await sha256(pin);
    return timingSafeEqual(old, stored);
  } catch { return false; }
}

// ── 2. SHA-256 عادي (للتحقق من التوقيعات) ─────────────────────
export async function sha256(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', ENC.encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── 3. HMAC-SHA256 (لتوقيع رموز الدفع) ────────────────────────
export async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', ENC.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, ENC.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  try {
    if (!signature || signature === 'dev') return false; // رفض صريح لـ dev
    const key = await crypto.subtle.importKey(
      'raw', ENC.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, sigBytes, ENC.encode(data));
  } catch { return false; }
}

// ── 4. تشفير AES-GCM للبيانات الحساسة ─────────────────────────
export async function encryptAES(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveAESKey(password, salt);
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ENC.encode(plaintext));
  // salt(16) + iv(12) + ciphertext
  const out = new Uint8Array(16 + 12 + ct.byteLength);
  out.set(salt, 0); out.set(iv, 16); out.set(new Uint8Array(ct), 28);
  return btoa(String.fromCharCode(...out));
}

export async function decryptAES(cipherB64: string, password: string): Promise<string> {
  const buf  = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
  const salt = buf.slice(0, 16);
  const iv   = buf.slice(16, 28);
  const ct   = buf.slice(28);
  const key  = await deriveAESKey(password, salt);
  const pt   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return DEC.decode(pt);
}

async function deriveAESKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const saltBuffer: ArrayBuffer = salt.buffer.slice(
    salt.byteOffset, salt.byteOffset + salt.byteLength
  ) as ArrayBuffer;
  const km = await crypto.subtle.importKey('raw', ENC.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuffer, iterations: 100_000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

// ── 5. مقارنة زمنياً آمنة (يمنع timing attacks) ───────────────
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── 6. توليد UUID v4 آمن ────────────────────────────────────────
export function secureUUID(): string {
  return crypto.randomUUID();
}

// ── 7. توليد token عشوائي ───────────────────────────────────────
export function secureToken(bytes = 32): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' })[c] ?? c);
}

// ── 8. إخفاء بيانات حساسة في الـ logs ──────────────────────────
export function maskSensitive(value: string, show = 4): string {
  if (!value || value.length <= show) return '****';
  return value.slice(0, show) + '****' + value.slice(-2);
}
