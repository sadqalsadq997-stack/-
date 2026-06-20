/**
 * ══════════════════════════════════════════════════════════════════
 * Felsy Integration Layer — Plugin-Ready Architecture
 *
 * يدعم مستقبلاً بدون تعديل هذا الكود:
 *  سلة | زد | ميسر | تمارا | تابي | Stripe | PayTabs | Moyasar
 *  WhatsApp Business | SMS Providers
 *  سمسا | أرامكس | DHL | SPL | Naqel
 *
 * البنية: REST + OAuth + Webhooks + Event Bus + Plugin System
 * ══════════════════════════════════════════════════════════════════
 */

// ── Integration Registry ─────────────────────────────────────────
export type IntegrationCategory =
  | 'ecommerce'    // سلة، زد
  | 'payment'      // تمارا، تابي، Moyasar، Stripe
  | 'messaging'    // WhatsApp، SMS
  | 'shipping'     // سمسا، أرامكس، DHL
  | 'accounting'   // محاسبة خارجية
  | 'pos';         // POS خارجي

export interface IntegrationPlugin {
  id:          string;
  name:        string;
  name_ar:     string;
  category:    IntegrationCategory;
  version:     string;
  icon?:       string;
  status:      'available' | 'coming_soon' | 'connected' | 'error';
  oauth?:      { authUrl: string; tokenUrl: string; scopes: string[] };
  webhooks?:   string[];    // Events this plugin emits
  onSaleComplete?:   (event: SaleEvent)   => Promise<void>;
  onRefund?:         (event: RefundEvent) => Promise<void>;
  onOrderCreate?:    (event: OrderEvent)  => Promise<void>;
  onInventoryLow?:   (event: StockEvent)  => Promise<void>;
  onProductUpdate?:  (event: ProductEvent)=> Promise<void>;
}

type SaleEvent    = { invoiceId: string; total: number; items: unknown[] };
type RefundEvent  = { invoiceId: string; amount: number; reason: string };
type OrderEvent   = { orderId: string; status: string; items: unknown[] };
type StockEvent   = { productId: string; quantity: number; warehouseId: string };
type ProductEvent = { productId: string; action: 'create' | 'update' | 'delete' };

// ── Plugin Registry ──────────────────────────────────────────────
const registry = new Map<string, IntegrationPlugin>();

export function registerPlugin(plugin: IntegrationPlugin) {
  registry.set(plugin.id, plugin);
  console.info(`[Felsy Integration] Plugin registered: ${plugin.name}`);
}

export function getPlugin(id: string): IntegrationPlugin | undefined {
  return registry.get(id);
}

export function listPlugins(category?: IntegrationCategory): IntegrationPlugin[] {
  const all = Array.from(registry.values());
  return category ? all.filter(p => p.category === category) : all;
}

// ── Event Bus ────────────────────────────────────────────────────
type EventHandler = (data: unknown) => Promise<void>;
const eventBus = new Map<string, EventHandler[]>();

export function on(event: string, handler: EventHandler) {
  const handlers = eventBus.get(event) || [];
  handlers.push(handler);
  eventBus.set(event, handlers);
}

export async function emit(event: string, data: unknown) {
  const handlers = eventBus.get(event) || [];
  await Promise.allSettled(handlers.map(h => h(data)));
  // أيضاً أطلق على جميع الـ plugins المتصلة
  for (const plugin of registry.values()) {
    if (plugin.status !== 'connected') continue;
    const fn = (plugin as unknown as Record<string, unknown>)[`on${toPascal(event)}`] as EventHandler | undefined;
    if (fn) await fn(data).catch(e => console.warn(`[Plugin ${plugin.id}]`, e));
  }
}

function toPascal(s: string) {
  return s.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
}

// ── Webhook Manager ──────────────────────────────────────────────
export interface Webhook {
  id:        string;
  url:       string;
  events:    string[];
  secret:    string;
  active:    boolean;
  created_at:string;
}

export async function dispatchWebhook(webhook: Webhook, event: string, payload: unknown) {
  if (!webhook.active) return;
  if (!webhook.events.includes(event) && !webhook.events.includes('*')) return;

  const body    = JSON.stringify({ event, payload, timestamp: Date.now() });
  const sig     = await signWebhook(body, webhook.secret);

  try {
    await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'X-Felsy-Event':     event,
        'X-Felsy-Signature': sig,
        'X-Felsy-Timestamp': Date.now().toString(),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.warn(`[Webhook] Failed to dispatch to ${webhook.url}:`, e);
  }
}

async function signWebhook(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── Pre-registered Future Integrations (Coming Soon) ────────────
const FUTURE_PLUGINS: IntegrationPlugin[] = [
  { id:'salla',    name:'Salla',           name_ar:'سلة',        category:'ecommerce', version:'1.0', status:'coming_soon' },
  { id:'zid',      name:'Zid',             name_ar:'زد',          category:'ecommerce', version:'1.0', status:'coming_soon' },
  { id:'moyasar',  name:'Moyasar',         name_ar:'ميسر',        category:'payment',   version:'1.0', status:'coming_soon' },
  { id:'tamara',   name:'Tamara',          name_ar:'تمارا',       category:'payment',   version:'1.0', status:'coming_soon' },
  { id:'tabby',    name:'Tabby',           name_ar:'تابي',        category:'payment',   version:'1.0', status:'coming_soon' },
  { id:'stripe',   name:'Stripe',          name_ar:'Stripe',      category:'payment',   version:'1.0', status:'coming_soon' },
  { id:'paytabs',  name:'PayTabs',         name_ar:'PayTabs',     category:'payment',   version:'1.0', status:'coming_soon' },
  { id:'whatsapp', name:'WhatsApp Business',name_ar:'واتساب أعمال',category:'messaging', version:'1.0', status:'coming_soon' },
  { id:'smsa',     name:'SMSA Express',    name_ar:'سمسا',        category:'shipping',  version:'1.0', status:'coming_soon' },
  { id:'aramex',   name:'Aramex',          name_ar:'أرامكس',      category:'shipping',  version:'1.0', status:'coming_soon' },
  { id:'dhl',      name:'DHL',             name_ar:'DHL',         category:'shipping',  version:'1.0', status:'coming_soon' },
  { id:'spl',      name:'SPL',             name_ar:'البريد السعودي',category:'shipping', version:'1.0', status:'coming_soon' },
  { id:'naqel',    name:'Naqel',           name_ar:'ناقل',        category:'shipping',  version:'1.0', status:'coming_soon' },
];

// تسجيل الـ plugins عند تحميل الملف
FUTURE_PLUGINS.forEach(p => registerPlugin(p));
