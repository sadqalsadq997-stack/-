// ══════════════════════════════════════════════════════════════════
// Edge Function: archive-orders — أرشفة الطلبات الأقدم من 13 شهر إلى R2
// ──────────────────────────────────────────────────────────────────
// لكل منشأة/شهر: ملف JSONL مضغوط gzip (الطلبات + فواتير ZATCA المرتبطة)
//   archive/<tenant>/<YYYY-MM>.jsonl.gz   ← في bucket خاص (غير عام)
// بعد نجاح الرفع: سطر ملخص في order_archives ثم حذف الصفوف من القاعدة.
// تشغيل شهري (cron) بتوكن سري:  POST  Authorization: Bearer <ARCHIVE_SECRET>
// متغيرات: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ARCHIVE_BUCKET, ARCHIVE_SECRET
// انشر بـ: supabase functions deploy archive-orders --no-verify-jwt
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { json, adminClient, errorResponse, HttpError } from '../_shared/auth.ts';

const KEEP_MONTHS = 13;

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

serve(async (req) => {
  try {
    const secret = Deno.env.get('ARCHIVE_SECRET') || '';
    const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!secret || !safeEqual(given, secret)) throw new HttpError(401, 'unauthorized');

    const env = (k: string) => Deno.env.get(k) || '';
    if (!env('R2_ACCOUNT_ID') || !env('R2_ARCHIVE_BUCKET')) throw new HttpError(501, 'R2 غير مضبوط');
    const r2 = new AwsClient({ accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY'), service: 's3', region: 'auto' });
    const sb = adminClient();

    const before = new Date();
    before.setUTCMonth(before.getUTCMonth() - KEEP_MONTHS, 1);
    const { data: jobs, error } = await sb.rpc('archive_candidates', { p_before: before.toISOString().slice(0, 10), p_limit: 100 });
    if (error) throw new HttpError(500, error.message);

    const done: unknown[] = [];
    const started = Date.now();
    for (const j of (jobs ?? []) as { tenant_id: string; month: string; n: number }[]) {
      if (Date.now() - started > 120_000) break; // نكمل في التشغيل الجاي
      const from = new Date(j.month + 'T00:00:00Z');
      const to = new Date(from); to.setUTCMonth(to.getUTCMonth() + 1);

      const orders: any[] = [];
      for (let off = 0; ; off += 1000) {
        const { data } = await sb.from('orders').select('*').eq('tenant_id', j.tenant_id)
          .gte('created_at', from.toISOString()).lt('created_at', to.toISOString()).order('created_at').range(off, off + 999);
        if (!data?.length) break;
        orders.push(...data);
        if (data.length < 1000) break;
      }
      if (!orders.length) continue;
      const ids = orders.map(o => o.id);
      const zatca: any[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await sb.from('zatca_invoices').select('*').in('order_id', ids.slice(i, i + 200));
        if (data) zatca.push(...data);
      }

      const lines = orders.map(o => JSON.stringify({ t: 'order', ...o }))
        .concat(zatca.map(z => JSON.stringify({ t: 'zatca_invoice', ...z }))).join('\n');
      const body = await gzip(lines);
      // لو فيه أرشيف سابق لنفس الشهر (انقسم على أكثر من تشغيل) نكتب ملف جديد بجانبه — ما نكتب فوقه
      const { data: prev } = await sb.from('order_archives').select('*').eq('tenant_id', j.tenant_id).eq('month', j.month).maybeSingle();
      const base = `archive/${j.tenant_id}/${j.month.slice(0, 7)}`;
      const key = prev ? `${base}.${Date.now()}.jsonl.gz` : `${base}.jsonl.gz`;
      const put = await r2.fetch(`https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${env('R2_ARCHIVE_BUCKET')}/${key}`, {
        method: 'PUT', body, headers: { 'Content-Type': 'application/gzip' },
      });
      if (!put.ok) { done.push({ ...j, error: 'upload_failed' }); continue; }

      const sum = (k: string) => Math.round(orders.reduce((s, o) => s + Number(o[k] || 0), 0) * 100) / 100;
      const row = {
        tenant_id: j.tenant_id, month: j.month,
        object_key: prev ? `${prev.object_key},${key}` : key,
        bytes: body.byteLength + Number(prev?.bytes ?? 0),
        orders: orders.length + Number(prev?.orders ?? 0),
        subtotal: sum('subtotal') + Number(prev?.subtotal ?? 0),
        tax_amount: sum('tax_amount') + Number(prev?.tax_amount ?? 0),
        total: sum('total') + Number(prev?.total ?? 0),
      };
      const { error: upErr } = await sb.from('order_archives').upsert(row, { onConflict: 'tenant_id,month' });
      if (upErr) { done.push({ ...j, error: upErr.message }); continue; }

      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        await sb.from('zatca_invoices').delete().in('order_id', chunk);
        await sb.from('orders').delete().in('id', chunk);
      }
      done.push({ ...j, archived: orders.length, bytes: body.byteLength });
    }
    return json({ ok: true, done });
  } catch (err) {
    return errorResponse(err);
  }
});
