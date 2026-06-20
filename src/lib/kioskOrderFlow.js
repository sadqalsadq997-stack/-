/**
 * src/lib/kioskOrderFlow.js
 *
 * التدفق الآلي الكامل للطلب القادم من الكشك:
 *  استقبال → حفظ → إشعار المطبخ → رنين البيجر عند "جاهز"
 *
 * الاستخدام:
 *   import { KioskOrderFlow } from '@/lib/kioskOrderFlow';
 *   const flow = new KioskOrderFlow(supabase, ringPagerFn);
 *   flow.startListening();  // يبدأ الاستماع على Supabase Realtime
 */

// ─── بروتوكول بيجر بسيط (عدّله حسب جهازك) ───────────────────
async function defaultRingPager(port, pagerNumber) {
  if (!port?.writable) return false;
  try {
    const writer = port.writable.getWriter();
    await writer.write(new Uint8Array([0xFF, pagerNumber & 0xFF, 0x00]));
    writer.releaseLock();
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
export class KioskOrderFlow {
  /**
   * @param {object} supabaseClient   - مثيل supabase
   * @param {Function} ringPagerFn    - دالة لإرسال أمر الرنين
   *   Signature: async (pagerNumber: number) => boolean
   */
  constructor(supabaseClient, ringPagerFn = null) {
    this.db         = supabaseClient;
    this.ringPager  = ringPagerFn;
    this._channels  = [];
  }

  // ─── 1. استقبال طلب جديد من الكشك ─────────────────────────
  /**
   * يُستدعى من Webhook Handler أو من Realtime listener
   * @param {object} payload - { items, table_number, kiosk_ref, ... }
   * @returns {string} orderId
   */
  async receiveOrder(payload) {
    // ── أ. حفظ في orders ──────────────────────────────────────
    const orderNumber = `KSK-${Date.now()}`;
    const { data: order, error } = await this.db
      .from('orders')
      .insert({
        order_number:  orderNumber,
        items:         payload.items || [],
        total:         payload.total || 0,
        status:        'pending',
        source:        'kiosk',
        kiosk_ref:     payload.kiosk_ref || null,
        table_number:  payload.table_number || null,
        notes:         payload.notes || null,
        created_at:    new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`[KioskFlow] حفظ الطلب: ${error.message}`);

    // ── ب. تسجيل في kiosk_orders للأرشيف ─────────────────────
    await this.db.from('kiosk_orders').insert({
      order_id:        order.id,
      kiosk_order_ref: payload.kiosk_ref,
      raw_payload:     payload,
      processed:       true,
    });

    // ── ج. Realtime يُشعر المطبخ تلقائياً (لا شيء إضافي) ────
    //   KitchenDisplay.jsx مشترك على postgres_changes على orders
    //   أي insert بـ status='pending' يظهر فوراً على الشاشة.

    console.log(`[KioskFlow] ✅ طلب جديد: ${orderNumber} (${order.id})`);
    return order.id;
  }

  // ─── 2. الاستماع لحدث "جاهز" من المطبخ ────────────────────
  /**
   * عند تغيّر status إلى 'ready' → نطلق البيجر
   */
  startListening() {
    // الاشتراك في تغييرات orders
    const ch = this.db
      .channel('kiosk-order-flow')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => this._onOrderUpdate(payload)
      )
      .subscribe();

    this._channels.push(ch);
    console.log('[KioskFlow] 👂 يستمع لتغييرات الطلبات...');
    return this; // للـ chaining
  }

  // ─── 3. معالج التحديث ──────────────────────────────────────
  async _onOrderUpdate({ new: order }) {
    // فقط طلبات من الكشك تحوّلت إلى "جاهز"
    if (order.source !== 'kiosk')   return;
    if (order.status !== 'ready')   return;
    if (order.pager_sent)           return; // تجنب التكرار

    await this._triggerPager(order);
  }

  // ─── 4. إطلاق البيجر ───────────────────────────────────────
  async _triggerPager(order) {
    const pagerNumber = order.table_number || 1;
    let success = false;

    if (typeof this.ringPager === 'function') {
      success = await this.ringPager(pagerNumber);
    }

    // تسجيل الحدث في قاعدة البيانات
    await this.db.from('pager_events').insert({
      order_id:    order.id,
      pager_number: String(pagerNumber),
      status:      success ? 'sent' : 'failed',
      triggered_at: new Date().toISOString(),
    });

    // تحديث العلم على الطلب حتى لا يُرسل مرة ثانية
    await this.db
      .from('orders')
      .update({ pager_sent: true, pager_sent_at: new Date().toISOString() })
      .eq('id', order.id);

    console.log(
      `[KioskFlow] 🔔 بيجر رقم ${pagerNumber} — ${success ? 'أُرسل' : 'فشل'}`
    );
  }

  // ─── تنظيف الاشتراكات ──────────────────────────────────────
  destroy() {
    this._channels.forEach(ch => this.db.removeChannel(ch));
    this._channels = [];
  }
}


// ═══════════════════════════════════════════════════════════════
// Webhook Handler (Express / Supabase Edge Function)
// ضعه في: supabase/functions/kiosk-webhook/index.ts
// ═══════════════════════════════════════════════════════════════
export const WEBHOOK_HANDLER_CODE = `
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { KioskOrderFlow } from '../../../src/lib/kioskOrderFlow.js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  // التحقق من مفتاح API في الـ Header
  const apiKey = req.headers.get('x-api-key');
  const { data: settings } = await supabase
    .from('app_settings').select('kiosk_api_key').single();

  if (apiKey !== settings?.kiosk_api_key) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json();
  const flow = new KioskOrderFlow(supabase);
  const orderId = await flow.receiveOrder(payload);

  return Response.json({ success: true, order_id: orderId });
});
`;
