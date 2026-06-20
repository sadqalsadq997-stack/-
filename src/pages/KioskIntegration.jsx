/**
 * src/pages/KioskIntegration.jsx
 *
 * صفحة الربط الكامل: كشك الطلبات + البيجر
 * ─────────────────────────────────────────
 *  1. إعداد مفتاح API → اختبار الاتصال الفوري
 *  2. Auto-detect منفذ USB للبيجر
 *  3. لوحة تحكم المنتجات (رفع صورة + سعر → تحديث لحظي على الكشك)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Plug, Wifi, WifiOff, RefreshCw, Bell, CheckCircle2,
  XCircle, Upload, Save, Loader2, HardDrive, Zap,
  AlertCircle, Package, Image as ImageIcon, DollarSign
} from 'lucide-react';

// ─── نقطة النهاية الخاصة بـ API الكشك (غيّرها حسب مزودك) ───
const KIOSK_API_BASE = import.meta.env.VITE_KIOSK_API_BASE || 'https://api.yourkiosk.com';

// ═══════════════════════════════════════════════════════════════
// Hook: useKioskSettings  — تحميل وحفظ الإعدادات من Supabase
// ═══════════════════════════════════════════════════════════════
function useKioskSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('app_settings').select('*').limit(1).single();
    setSettings(data || {});
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (patch) => {
    const merged = { ...settings, ...patch };
    setSettings(merged);
    if (merged.id) {
      await supabase.from('app_settings').update(patch).eq('id', merged.id);
    } else {
      const { data } = await supabase.from('app_settings').insert(merged).select().single();
      if (data) setSettings(data);
    }
  }, [settings]);

  return { settings, loading, save, reload: load };
}

// ═══════════════════════════════════════════════════════════════
// Hook: usePagerDetect  — كشف منفذ USB للبيجر تلقائياً
// ═══════════════════════════════════════════════════════════════
function usePagerDetect() {
  const [detecting, setDetecting] = useState(false);
  const [port, setPort]           = useState(null);
  const [error, setError]         = useState(null);

  /**
   * Web Serial API (Chrome/Edge 89+)
   * الطريقة: نطلب من المتصفح اختيار منفذ تسلسلي.
   * عند العميل داخل إلكترون أو Tauri نستبدلها بـ serialport مباشرة.
   */
  const detect = useCallback(async () => {
    setDetecting(true);
    setError(null);
    try {
      if (!('serial' in navigator)) {
        throw new Error('المتصفح لا يدعم Web Serial. استخدم Chrome أو Edge.');
      }
      const serialPort = await navigator.serial.requestPort();
      await serialPort.open({ baudRate: 9600 });

      const info = serialPort.getInfo();
      const portLabel = `USB VID:${info.usbVendorId} PID:${info.usbProductId}`;
      setPort({ serialPort, label: portLabel });
      toast.success(`✅ تم اكتشاف البيجر: ${portLabel}`);
      return portLabel;
    } catch (e) {
      setError(e.message);
      toast.error(`⚠️ ${e.message}`);
      return null;
    } finally {
      setDetecting(false);
    }
  }, []);

  /**
   * إرسال أمر الرنين للبيجر عبر المنفذ المفتوح
   * البروتوكول الافتراضي: إرسال بايت 0xFF ثم رقم البيجر
   * عدّله حسب مواصفات جهاز البيجر الخاص بك
   */
  const ringPager = useCallback(async (pagerNumber = 1) => {
    if (!port?.serialPort) {
      toast.error('لم يتم توصيل البيجر بعد');
      return false;
    }
    try {
      const writer = port.serialPort.writable.getWriter();
      // بروتوكول بسيط: [0xFF, pagerNumber, 0x00]
      const cmd = new Uint8Array([0xFF, pagerNumber & 0xFF, 0x00]);
      await writer.write(cmd);
      writer.releaseLock();
      return true;
    } catch (e) {
      toast.error(`فشل إرسال الأمر للبيجر: ${e.message}`);
      return false;
    }
  }, [port]);

  return { detecting, port, error, detect, ringPager };
}

// ═══════════════════════════════════════════════════════════════
// مكوّن: ApiKeyPanel — إعداد مفتاح الكشك واختبار الاتصال
// ═══════════════════════════════════════════════════════════════
function ApiKeyPanel({ settings, onSave }) {
  const [key, setKey]         = useState('');
  const [testing, setTesting] = useState(false);
  const [status, setStatus]   = useState(null); // null | 'ok' | 'fail'

  useEffect(() => {
    if (settings?.kiosk_api_key) setKey(settings.kiosk_api_key);
  }, [settings]);

  async function testAndSave() {
    if (!key.trim()) { toast.error('أدخل مفتاح API أولاً'); return; }
    setTesting(true);
    setStatus(null);
    try {
      // ── اختبار الاتصال مع كشك API ──
      const res = await fetch(`${KIOSK_API_BASE}/v1/ping`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${key.trim()}` },
      });

      if (res.ok) {
        setStatus('ok');
        await onSave({
          kiosk_api_key:  key.trim(),
          kiosk_connected: true,
          kiosk_last_ping: new Date().toISOString(),
        });
        toast.success('✅ تم الربط بنجاح مع الكشك!');
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      setStatus('fail');
      toast.error(`❌ فشل الاتصال: ${e.message}`);
    } finally {
      setTesting(false);
    }
  }

  const connected = settings?.kiosk_connected;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Plug className="w-5 h-5 text-primary" />
        <h3 className="font-bold text-lg">ربط كشك الطلبات</h3>
        {connected && (
          <span className="mr-auto flex items-center gap-1 text-xs text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            متصل
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        أدخل مفتاح API الخاص بمتجرك من لوحة تحكم مزود الكشك، سيتم الربط فوراً.
      </p>

      <div className="flex gap-2">
        <input
          type="password"
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="sk-xxxx-xxxx-xxxx"
          dir="ltr"
          className="flex-1 h-10 bg-muted/50 border border-border rounded-xl px-3 text-sm font-mono focus:outline-none focus:border-primary"
        />
        <button
          onClick={testAndSave}
          disabled={testing}
          className="h-10 px-5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {testing ? 'جارٍ الاتصال...' : 'اتصال وحفظ'}
        </button>
      </div>

      {status === 'ok' && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-500/10 rounded-xl px-3 py-2">
          <CheckCircle2 className="w-4 h-4" />
          الكشك متصل ويعمل. الطلبات ستُستقبل تلقائياً.
        </div>
      )}
      {status === 'fail' && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
          <XCircle className="w-4 h-4" />
          تحقق من صحة المفتاح أو اتصال الإنترنت.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// مكوّن: PagerPanel — كشف البيجر تلقائياً عبر USB
// ═══════════════════════════════════════════════════════════════
function PagerPanel({ settings, onSave }) {
  const { detecting, port, error, detect } = usePagerDetect();

  async function handleDetect() {
    const portLabel = await detect();
    if (portLabel) {
      await onSave({ pager_detected: true, pager_device_name: portLabel });
    }
  }

  const detected = settings?.pager_detected;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-5 h-5 text-primary" />
        <h3 className="font-bold text-lg">جهاز البيجر</h3>
        {detected && (
          <span className="mr-auto flex items-center gap-1 text-xs text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
            <HardDrive className="w-3 h-3" />
            {settings.pager_device_name || 'متصل'}
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        وصّل جهاز البيجر بمنفذ USB ثم اضغط الزر. سيكتشفه النظام تلقائياً.
      </p>

      <button
        onClick={handleDetect}
        disabled={detecting}
        className="h-10 px-5 bg-secondary text-secondary-foreground rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
      >
        {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {detecting ? 'جارٍ الفحص...' : 'فحص تلقائي للبيجر'}
      </button>

      {port && (
        <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-500/10 rounded-xl px-3 py-2">
          <CheckCircle2 className="w-4 h-4" />
          تم اكتشاف: {port.label}
        </div>
      )}
      {error && !port && (
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-500/10 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <p className="text-xs text-muted-foreground/60">
        يتطلب متصفح Chrome أو Edge 89+ لدعم Web Serial API
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// مكوّن: ProductSyncPanel — رفع صور وتعديل أسعار على الكشك
// ═══════════════════════════════════════════════════════════════
function ProductSyncPanel({ apiKey }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState({});
  const fileRefs = useRef({});

  useEffect(() => {
    supabase.from('products').select('id, name, price, image_url, category_id')
      .order('name').then(({ data }) => {
        setProducts(data || []);
        setLoading(false);
      });
  }, []);

  async function updatePrice(product, newPrice) {
    const price = parseFloat(newPrice);
    if (isNaN(price)) return;

    // تحديث في Supabase
    await supabase.from('products').update({ price }).eq('id', product.id);

    // دفع لحظي للكشك
    if (apiKey) {
      await pushToKiosk(product.id, { price });
    }

    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, price } : p));
    toast.success(`✅ تم تحديث سعر ${product.name}`);
  }

  async function uploadImage(product, file) {
    if (!file) return;
    setSyncing(s => ({ ...s, [product.id]: true }));
    try {
      const ext  = file.name.split('.').pop();
      const path = `products/${product.id}.${ext}`;

      const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true });
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
      await supabase.from('products').update({ image_url: publicUrl }).eq('id', product.id);

      // دفع الصورة للكشك
      if (apiKey) await pushToKiosk(product.id, { image_url: publicUrl });

      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, image_url: publicUrl } : p));
      toast.success(`✅ تم رفع صورة ${product.name} وتحديث الكشك`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSyncing(s => ({ ...s, [product.id]: false }));
    }
  }

  // ── إرسال تحديث للكشك عبر API ──
  async function pushToKiosk(productId, patch) {
    try {
      await fetch(`${KIOSK_API_BASE}/v1/products/${productId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(patch),
      });
    } catch {
      // تجاهل هادئ — الـ Supabase Realtime يعوّض
    }
  }

  if (loading) return (
    <div className="flex justify-center py-10">
      <Loader2 className="w-5 h-5 text-primary animate-spin" />
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Package className="w-5 h-5 text-primary" />
        <h3 className="font-bold text-lg">مزامنة المنتجات مع الكشك</h3>
        <span className="text-xs text-muted-foreground mr-auto">التحديث لحظي ✨</span>
      </div>

      <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
        {products.map(p => (
          <div key={p.id} className="flex items-center gap-3 bg-muted/30 rounded-xl p-3">
            {/* صورة المنتج */}
            <div className="relative w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden bg-muted border border-border">
              {p.image_url
                ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                : <ImageIcon className="w-6 h-6 text-muted-foreground absolute inset-0 m-auto" />
              }
              {syncing[p.id] && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                </div>
              )}
            </div>

            {/* اسم المنتج */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{p.name}</p>
              {/* حقل السعر */}
              <div className="flex items-center gap-1 mt-1">
                <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="number"
                  defaultValue={p.price}
                  onBlur={e => updatePrice(p, e.target.value)}
                  className="w-24 h-7 bg-muted/50 border border-border rounded-lg px-2 text-xs focus:outline-none focus:border-primary"
                  dir="ltr"
                />
                <span className="text-xs text-muted-foreground">ر.س</span>
              </div>
            </div>

            {/* زر رفع الصورة */}
            <div>
              <input
                type="file"
                accept="image/*"
                ref={el => fileRefs.current[p.id] = el}
                className="hidden"
                onChange={e => uploadImage(p, e.target.files[0])}
              />
              <button
                onClick={() => fileRefs.current[p.id]?.click()}
                disabled={syncing[p.id]}
                className="h-8 px-3 bg-secondary text-secondary-foreground rounded-lg text-xs font-medium flex items-center gap-1 hover:opacity-90 disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                صورة
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// الصفحة الرئيسية
// ═══════════════════════════════════════════════════════════════
export default function KioskIntegration() {
  const { settings, loading, save } = useKioskSettings();

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
    </div>
  );

  return (
    <div dir="rtl" className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Plug className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-black text-foreground">ربط الكشك والبيجر</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Plug & Play — لا تدخل تقني مطلوب</p>
        </div>
      </div>

      {/* 1. API */}
      <ApiKeyPanel settings={settings} onSave={save} />

      {/* 2. بيجر */}
      <PagerPanel settings={settings} onSave={save} />

      {/* 3. المنتجات */}
      {settings?.kiosk_connected && (
        <ProductSyncPanel apiKey={settings.kiosk_api_key} />
      )}
    </div>
  );
}
