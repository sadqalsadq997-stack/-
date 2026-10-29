import { callFunction } from '@/lib/api';

// ══════════════════════════════════════════════════════════════════
// إصدار المستند للهيئة (المرحلة الثانية) من الواجهة
// يرجع QR المرحلة الثانية للطباعة. لو الفرع غير مربوط أو الشبكة بطيئة
// (أكثر من 4 ثوانٍ) ⇒ الطباعة تكمل بـ QR المرحلة الأولى، والسيرفر
// يوقّع ويرسل تلقائياً خلال دقائق (الهيئة تمهل 24 ساعة للمبسطة).
// ══════════════════════════════════════════════════════════════════
export async function issueEinvoice(kind, id, { timeoutMs = 4000 } = {}) {
  try {
    const res = await Promise.race([
      callFunction('zatca-einvoice', { action: 'issue', kind, id }),
      new Promise((r) => setTimeout(() => r({ data: null, error: 'timeout' }), timeoutMs)),
    ]);
    if (res?.data?.qr) return { qr: res.data.qr, status: res.data.status, counter: res.data.counter, standard: res.data.standard };
    if (res?.data?.status) return { status: res.data.status, standard: res.data.standard, errors: res.data.errors };
    return { status: 'deferred', error: res?.error };
  } catch (e) {
    return { status: 'deferred', error: e?.message };
  }
}
