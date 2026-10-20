// ══════════════════════════════════════════════════════════════════
// نغمة البيجر — تُولَّد كملف WAV داخل المتصفح (بدون ملفات صوت خارجية)
// نستخدم <audio> بدل Web Audio لأن آيفون يكتم Web Audio في الوضع
// الصامت، بينما عنصر <audio> يشتغل كتشغيل وسائط عادي.
// ══════════════════════════════════════════════════════════════════

function buildRingWav() {
  const rate = 22050;
  // نمط: بيب-بيب-بيب (نغمتين متبادلتين) ثم سكون
  const pattern = [
    [880, 0.14], [0, 0.05], [1320, 0.14], [0, 0.05],
    [880, 0.14], [0, 0.05], [1320, 0.14], [0, 0.45],
  ];
  const total = pattern.reduce((s, [, d]) => s + d, 0);
  const n = Math.floor(rate * total);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  let i = 0;
  for (const [f, d] of pattern) {
    const len = Math.floor(rate * d);
    for (let k = 0; k < len && i < n; k++, i++) {
      const env = Math.min(1, k / 200, (len - k) / 200); // تنعيم البداية والنهاية
      const s = f ? Math.sin(2 * Math.PI * f * (k / rate)) * 0.8 * env : 0;
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true);
    }
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

let audio = null;

export function getRingAudio() {
  if (!audio && typeof window !== 'undefined') {
    audio = new Audio(buildRingWav());
    audio.loop = true;
    audio.preload = 'auto';
  }
  return audio;
}

/** يُستدعى من ضغطة المستخدم لفتح إذن تشغيل الصوت في المتصفح */
export async function unlockAudio() {
  const a = getRingAudio();
  if (!a) return false;
  try {
    a.muted = true;
    await a.play();
    a.pause();
    a.currentTime = 0;
    a.muted = false;
    return true;
  } catch {
    return false;
  }
}

export async function startRinging() {
  const a = getRingAudio();
  try { a.currentTime = 0; await a.play(); } catch { /* المتصفح منع التشغيل */ }
  try { navigator.vibrate?.([400, 150, 400, 150, 800]); } catch { /* */ }
}

export function stopRinging() {
  try { audio?.pause(); if (audio) audio.currentTime = 0; } catch { /* */ }
  try { navigator.vibrate?.(0); } catch { /* */ }
}
