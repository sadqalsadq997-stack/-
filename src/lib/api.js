import { supabase, getDeviceId } from '@/integrations/supabase/client';

/**
 * استدعاء Edge Function مع قراءة رسالة الخطأ الحقيقية من السيرفر
 * يرجع { data, error, status } — error نص عربي جاهز للعرض
 */
export async function callFunction(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, {
    body: { device_id: getDeviceId(), ...body },
  });
  if (!error) return { data, error: null, status: 200 };
  let status = error?.context?.status || 0;
  let payload = null;
  try { payload = await error.context.json(); } catch { /* ليس JSON */ }
  const msg = payload?.error?.message || payload?.error || payload?.message || error.message || 'حدث خطأ';
  return { data: payload, error: typeof msg === 'string' ? msg : 'حدث خطأ', status };
}

let _tenantId = null;
/** مسار رفع الملفات داخل مجلد المنشأة (سياسة التخزين ترفض أي مسار آخر) */
export async function tenantUploadPath(subfolder, ext) {
  if (!_tenantId) {
    const { data } = await supabase.rpc('my_tenant_id');
    _tenantId = data || null;
  }
  if (!_tenantId) throw new Error('تعذر تحديد المنشأة — سجّل دخولك من جديد');
  const safeExt = String(ext || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // صور فقط — SVG/HTML ممنوعة لأنها ممكن تحمل سكربت
  if (!['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(safeExt)) {
    throw new Error('نوع الملف غير مسموح — ارفع صورة PNG أو JPG أو WEBP');
  }
  const rand = crypto.getRandomValues(new Uint32Array(2)).join('');
  return `${_tenantId}/${subfolder}/${Date.now()}-${rand}.${safeExt}`;
}
