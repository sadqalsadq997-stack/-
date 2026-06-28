import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Send, Loader2, Bot, User, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

const PROMPTS = [
  'ما هي أكثر المنتجات مبيعاً هذا الشهر؟',
  'غيّر سعر منتج معين',
  'حدّث حالة طلب',
  'عدّل كمية المخزون لمنتج',
  'ما هي المنتجات التي مخزونها منخفض؟',
];

// ══════════════════════════════════════════════════════════════
// كل "مهمة" يطلبها المساعد تحتاج موافقة صريحة من المستخدم قبل
// أي تنفيذ فعلي على قاعدة البيانات. لا يوجد أي تنفيذ تلقائي.
// كل عملية كتابة تمر عبر عميل Supabase بجلسة المستخدم، وتخضع
// تلقائياً لسياسات RLS (tenant_id) — فلا يمكن للمساعد التأثير
// على بيانات أي منشأة أخرى بأي حال.
// ══════════════════════════════════════════════════════════════

export default function AIAssistant() {
  const qc = useQueryClient();
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: 'مرحباً! أنا مساعد فلسي الذكي. أقدر أحلل بياناتك، وأقدر أساعدك تنفّذ مهام مثل تعديل سعر منتج أو تحديث حالة طلب أو تعديل المخزون — لكن أي تنفيذ فعلي يحتاج موافقتك الصريحة أولاً.',
  }]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { type, ... } بانتظار موافقة المستخدم
  const [executing, setExecuting] = useState(false);
  const messagesEndRef        = useRef(null);

  const { data: orders = [] } = useQuery({ queryKey: ['ai-orders'], queryFn: async () => { const { data } = await supabase.from('orders').select('id, order_number, total, status, created_at').order('created_at', { ascending: false }).limit(100); return data || []; } });
  const { data: products = [] } = useQuery({ queryKey: ['ai-products'], queryFn: async () => { const { data } = await supabase.from('products').select('id, name, name_ar, base_price, stock_quantity, track_inventory'); return data || []; } });
  const { data: customers = [] } = useQuery({ queryKey: ['ai-customers'], queryFn: async () => { const { data } = await supabase.from('customers').select('id'); return data || []; } });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingAction]);

  // ── تنفيذ فعلي على قاعدة البيانات — يُستدعى فقط بعد ضغط "موافقة" ──
  async function executeAction(action) {
    setExecuting(true);
    try {
      if (action.type === 'update_price') {
        const { error } = await supabase.from('products').update({ base_price: action.new_price }).eq('id', action.product_id);
        if (error) throw error;
        toast.success(`تم تعديل سعر "${action.product_name}" إلى ${action.new_price} ر.س`);
      } else if (action.type === 'update_order_status') {
        const { error } = await supabase.from('orders').update({ status: action.new_status }).eq('id', action.order_id);
        if (error) throw error;
        toast.success(`تم تحديث حالة الطلب #${action.order_number} إلى "${action.new_status}"`);
      } else if (action.type === 'adjust_stock') {
        const { error } = await supabase.from('products').update({ stock_quantity: action.new_quantity }).eq('id', action.product_id);
        if (error) throw error;
        await supabase.from('inventory_logs').insert({
          product_id: action.product_id,
          product_name: action.product_name,
          quantity_change: action.new_quantity - action.previous_quantity,
          previous_stock: action.previous_quantity,
          new_stock: action.new_quantity,
          type: 'manual_ai_assistant',
          reason: 'تعديل عبر المساعد الذكي بموافقة المستخدم',
        });
        toast.success(`تم تعديل مخزون "${action.product_name}" إلى ${action.new_quantity}`);
      }
      setMessages(prev => [...prev, { role: 'assistant', content: '✅ تم التنفيذ بنجاح.' }]);
      qc.invalidateQueries({ queryKey: ['ai-products'] });
      qc.invalidateQueries({ queryKey: ['ai-orders'] });
      qc.invalidateQueries({ queryKey: ['inventory-products'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    } catch (e) {
      toast.error('فشل التنفيذ');
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ تعذّر التنفيذ: ${e.message || 'خطأ غير معروف'}` }]);
    } finally {
      setExecuting(false);
      setPendingAction(null);
    }
  }

  function cancelAction() {
    setMessages(prev => [...prev, { role: 'assistant', content: 'تم تجاهل العملية ولم يتم تنفيذ أي تغيير.' }]);
    setPendingAction(null);
  }

  // ── محاولة استخراج بلوك إجراء JSON من رد المساعد ──
  function extractAction(text) {
    const m = text.match(/```action\s*([\s\S]*?)```/i);
    if (!m) return null;
    try {
      const action = JSON.parse(m[1].trim());
      if (action?.type) return action;
    } catch { /* تجاهل أي JSON غير صالح */ }
    return null;
  }

  async function sendMessage(text) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const context = `
بيانات النظام الحالية لهذا الحساب فقط (لا يمكنك رؤية أي حساب آخر):
- عدد الطلبات: ${orders.length} | إجمالي المبيعات: ${orders.reduce((s, o) => s + (o.total || 0), 0).toFixed(2)} ر.س
- المنتجات (id | الاسم | السعر | المخزون): ${products.slice(0, 40).map(p => `${p.id}|${p.name_ar || p.name}|${p.base_price}|${p.stock_quantity ?? 0}`).join(' ، ')}
- آخر 10 طلبات (id | رقم | الحالة): ${orders.slice(0, 10).map(o => `${o.id}|${o.order_number}|${o.status}`).join(' ، ')}
- عدد العملاء: ${customers.length}
`;

      const systemInstruction = `أنت مساعد أعمال ذكي لنظام فلسي POS. لديك صلاحية اقتراح تنفيذ مهام (لا تنفيذها مباشرة):
- تعديل سعر منتج (update_price)
- تحديث حالة طلب (update_order_status)
- تعديل كمية مخزون (adjust_stock)

إذا طلب المستخدم تنفيذ أي من هذه المهام، يجب أن يحتوي ردك على بلوك بالشكل التالي بالضبط (JSON صالح فقط، استخدم القيم الحقيقية من البيانات أعلاه):

\`\`\`action
{"type":"update_price","product_id":"...","product_name":"...","old_price":0,"new_price":0}
\`\`\`
أو
\`\`\`action
{"type":"update_order_status","order_id":"...","order_number":"...","old_status":"...","new_status":"..."}
\`\`\`
أو
\`\`\`action
{"type":"adjust_stock","product_id":"...","product_name":"...","previous_quantity":0,"new_quantity":0}
\`\`\`

اكتب قبل البلوك جملة قصيرة توضح ما ستفعله. لا تخمّن أي id غير موجود في البيانات أعلاه — إذا لم تجد المنتج/الطلب المطلوب، اطلب توضيحاً من المستخدم بدلاً من تخمين بلوك action.
لن يُنفَّذ أي إجراء إلا بعد موافقة المستخدم الصريحة بالضغط على زر التأكيد — هذا مضبوط من النظام تلقائياً، فلا تطلب من المستخدم تأكيداً نصياً بنفسك.`;

      const key = import.meta.env.VITE_GEMINI_API_KEY;
      if (!key) {
        setTimeout(() => {
          setMessages(prev => [...prev, { role: 'assistant', content: `بناءً على بياناتك:\n\n${getLocalInsight(orders, products, customers)}\n\n(لتفعيل تنفيذ المهام والتحليل الكامل، أضف مفتاح Gemini API في متغيرات البيئة)` }]);
          setLoading(false);
        }, 600);
        return;
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemInstruction}\n\n${context}\n\nسؤال/طلب المستخدم: ${msg}\n\nأجب باللغة العربية.` }] }],
            generationConfig: { maxOutputTokens: 600, temperature: 0.4 },
          }),
        }
      );
      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'لم أتمكن من الحصول على إجابة.';

      const action = extractAction(reply);
      const cleanText = reply.replace(/```action[\s\S]*?```/i, '').trim();

      setMessages(prev => [...prev, { role: 'assistant', content: cleanText || (action ? 'إليك الإجراء المقترح للموافقة عليه:' : reply) }]);
      if (action) setPendingAction(action);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: getLocalInsight(orders, products, customers) }]);
    }
    setLoading(false);
  }

  function getLocalInsight(orders, products, customers) {
    const total = orders.reduce((s, o) => s + (o.total || 0), 0);
    const avg = orders.length ? (total / orders.length).toFixed(2) : 0;
    return `📊 ملخص بياناتك الحالية:\n\n• إجمالي المبيعات: ${total.toFixed(2)} ر.س\n• متوسط قيمة الطلب: ${avg} ر.س\n• عدد العملاء: ${customers.length}\n• عدد المنتجات: ${products.length}`;
  }

  function actionLabel(action) {
    if (action.type === 'update_price') return `تعديل سعر "${action.product_name}" من ${action.old_price} إلى ${action.new_price} ر.س`;
    if (action.type === 'update_order_status') return `تحديث حالة الطلب #${action.order_number} من "${action.old_status}" إلى "${action.new_status}"`;
    if (action.type === 'adjust_stock') return `تعديل مخزون "${action.product_name}" من ${action.previous_quantity} إلى ${action.new_quantity}`;
    return 'إجراء غير معروف';
  }

  return (
    <div dir="rtl" className="flex flex-col h-[calc(100vh-120px)]">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" /> المساعد الذكي
        </h1>
        <p className="text-muted-foreground text-sm">تحليل البيانات وتنفيذ مهام — بياناتك فقط، وبموافقتك دائماً قبل أي تنفيذ</p>
      </div>

      <div className="flex-1 bg-card border border-border rounded-2xl flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${msg.role === 'assistant' ? 'bg-primary/15' : 'bg-muted'}`}>
                {msg.role === 'assistant' ? <Bot className="w-4 h-4 text-primary" /> : <User className="w-4 h-4 text-muted-foreground" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tl-none' : 'bg-muted text-foreground rounded-tr-none'}`}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* بطاقة تأكيد الإجراء — لا يُنفّذ شيء قبل ضغط "موافقة وتنفيذ" */}
          {pendingAction && (
            <div className="flex gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tr-none border-2 border-amber-500/40 bg-amber-500/5 px-4 py-3">
                <p className="text-sm font-bold text-foreground mb-1">يحتاج موافقتك قبل التنفيذ:</p>
                <p className="text-sm text-foreground mb-3">{actionLabel(pendingAction)}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => executeAction(pendingAction)}
                    disabled={executing}
                    className="flex-1 h-9 bg-emerald-500 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50"
                  >
                    {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    موافقة وتنفيذ
                  </button>
                  <button
                    onClick={cancelAction}
                    disabled={executing}
                    className="flex-1 h-9 bg-muted text-foreground text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 hover:bg-muted/70 disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" /> تجاهل
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tr-none px-4 py-3 flex gap-1 items-center">
                <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {PROMPTS.map((p, i) => (
            <button key={i} onClick={() => sendMessage(p)}
              className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1 hover:bg-primary/20 transition-colors">
              {p}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-border flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
            placeholder="اسألني عن مبيعاتك، أو اطلب مني تعديل سعر/حالة طلب/مخزون..."
            className="flex-1 h-10 bg-muted/50 border border-border rounded-xl px-4 text-sm focus:outline-none focus:border-primary" />
          <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
            className="w-10 h-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center hover:opacity-90 disabled:opacity-40">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
