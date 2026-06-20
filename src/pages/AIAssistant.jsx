import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Send, Loader2, Bot, User, TrendingUp, Package, Users, Zap } from 'lucide-react';

const PROMPTS = [
  'ما هي أكثر المنتجات مبيعاً هذا الشهر؟',
  'كيف يمكنني تحسين هامش الربح؟',
  'أعطني تقريراً عن أداء المبيعات',
  'ما هي المنتجات التي مخزونها منخفض؟',
  'تحليل سلوك العملاء',
];

export default function AIAssistant() {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: 'مرحباً! أنا مساعد فلسي الذكي. يمكنني مساعدتك في تحليل مبيعاتك وإعطائك توصيات لتطوير عملك. ما الذي تريد معرفته؟',
  }]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef        = useRef(null);

  const { data: orders = []   } = useQuery({ queryKey: ['orders'],   queryFn: async () => { const { data } = await supabase.from('orders').select('id, total, status, created_at').order('created_at', { ascending: false }).limit(100); return data || []; } });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: async () => { const { data } = await supabase.from('products').select('id, name, name_ar'); return data || []; } });
  const { data: customers = []} = useQuery({ queryKey: ['customers'],queryFn: async () => { const { data } = await supabase.from('customers').select('id'); return data || []; } });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const context = `
بيانات النظام الحالية:
- عدد الطلبات الإجمالي: ${orders.length}
- إجمالي المبيعات: ${orders.reduce((s, o) => s + (o.total || 0), 0).toFixed(2)} ر.س
- عدد المنتجات: ${products.length}
- عدد العملاء: ${customers.length}
- أكثر 3 منتجات مبيعاً: ${products.slice(0, 3).map(p => p.name_ar || p.name).join(', ')}
`;

      const key = import.meta.env.VITE_GEMINI_API_KEY;
      if (!key) {
        setTimeout(() => {
          setMessages(prev => [...prev, { role: 'assistant', content: `بناءً على بياناتك:\n\n${getLocalInsight(msg, orders, products, customers)}` }]);
          setLoading(false);
        }, 800);
        return;
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `أنت مساعد أعمال ذكي لنظام فلسي POS. ${context}\n\nسؤال المستخدم: ${msg}\n\nأجب باللغة العربية بشكل مفيد وعملي.`
              }]
            }],
            generationConfig: { maxOutputTokens: 500, temperature: 0.7 }
          })
        }
      );
      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'لم أتمكن من الحصول على إجابة.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: getLocalInsight(msg, orders, products, customers) }]);
    }
    setLoading(false);
  }

  function getLocalInsight(msg, orders, products, customers) {
    const total = orders.reduce((s, o) => s + (o.total || 0), 0);
    const avg = orders.length ? (total / orders.length).toFixed(2) : 0;
    return `📊 ملخص بياناتك الحالية:\n\n• إجمالي المبيعات: ${total.toFixed(2)} ر.س\n• متوسط قيمة الطلب: ${avg} ر.س\n• عدد العملاء: ${customers.length}\n• عدد المنتجات: ${products.length}\n\nللحصول على تحليل أعمق، أضف مفتاح Gemini API في الإعدادات.`;
  }

  return (
    <div dir="rtl" className="flex flex-col h-[calc(100vh-120px)]">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" /> المساعد الذكي
        </h1>
        <p className="text-muted-foreground text-sm">تحليل البيانات والتوصيات بالذكاء الاصطناعي</p>
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

        {/* اقتراحات */}
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
            placeholder="اسألني عن مبيعاتك أو عملائك..."
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
