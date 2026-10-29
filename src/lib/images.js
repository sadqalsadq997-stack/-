import { supabase } from '@/integrations/supabase/client';
import { tenantUploadPath } from '@/lib/api';

// ══════════════════════════════════════════════════════════════════
// الصور: ضغط في الجهاز ثم رفع خارج Supabase (Cloudflare R2) إن توفر
//   صورة جوال 4MB ⇒ WebP 800px ≈ 60KB  (توفير ~98% مساحة وباندويدث)
// ══════════════════════════════════════════════════════════════════

/** يصغّر الصورة لأقصى بُعد ويحوّلها WebP (أو JPEG للمتصفحات القديمة) */
export async function compressImage(file, { max = 800, quality = 0.8 } = {}) {
  if (!file?.type?.startsWith('image/')) throw new Error('اختر صورة');
  if (file.size > 15 * 1024 * 1024) throw new Error('الصورة أكبر من 15MB');
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('تعذر قراءة الصورة'); }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale); const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const toBlob = (type, q) => new Promise(r => canvas.toBlob(r, type, q));
  let blob = await toBlob('image/webp', quality);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', quality); // سفاري القديم
  // لو لسه كبيرة نخفض الجودة
  for (let q = quality - 0.15; blob && blob.size > 350 * 1024 && q > 0.4; q -= 0.15) {
    blob = await toBlob(blob.type, q);
  }
  if (!blob) throw new Error('تعذر ضغط الصورة');
  return blob;
}

/** يرفع صورة مضغوطة ويرجع رابطها العام. folder: products | logos | loyalty | categories */
export async function uploadImage(file, folder = 'products', opts) {
  const blob = await compressImage(file, opts);
  const { data: { session } } = await supabase.auth.getSession();
  // 1) Cloudflare R2 (خارج Supabase)
  try {
    const res = await fetch(`/api/upload?folder=${encodeURIComponent(folder)}`, {
      method: 'POST', body: blob,
      headers: { 'Content-Type': blob.type, Authorization: `Bearer ${session?.access_token || ''}` },
    });
    if (res.ok) return (await res.json()).url;
    if (res.status !== 501 && res.status !== 404) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || 'تعذر رفع الصورة');
    }
  } catch (e) {
    if (e instanceof TypeError === false && e.message && !/fetch/i.test(e.message)) throw e;
  }
  // 2) احتياطي: تخزين Supabase (الصورة مضغوطة برضه)
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = await tenantUploadPath(folder, ext);
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error('تعذر رفع الصورة');
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}
