import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  MessageCircle, Send, Phone, Mail, Globe, Clock,
  CheckCheck, Check, Loader2, Paperclip, X, Smile,
  Headphones, AlertCircle, ChevronDown, Bot
} from 'lucide-react';

// ══════════════════════════════════════════════════════
// صفحة الدعم الفني — شات مباشر + معلومات التواصل
// ══════════════════════════════════════════════════════

const QUICK_REPLIES = [
  'كيف أضيف منتج جديد؟',
  'مشكلة في الطباعة',
  'كيف أربط دومين؟',
  'استفسار عن الفواتير',
  'مشكلة في تسجيل الدخول',
  'طلب تدريب على النظام',
];

const CONTACT_INFO = [
  { icon: Phone, label: 'اتصل بنا', value: '+966 50 000 0000', href: 'tel:+966500000000', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  { icon: MessageCircle, label: 'واتساب', value: '+966 50 000 0000', href: 'https://wa.me/966500000000', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
  { icon: Mail, label: 'البريد الإلكتروني', value: 'support@felsy.sa', href: 'mailto:support@felsy.sa', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  { icon: Globe, label: 'الموقع الإلكتروني', value: 'www.felsy.sa', href: 'https://felsy.sa', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
];

async function getUser() {
  try {
    const { loadSession } = await import('@/lib/security/session');
    const sess = await loadSession();
    if (sess) return { id: sess.empId||'guest', name: sess.empName||'مستخدم', role: sess.role||'employee' };
  } catch {}
  return { id: 'guest', name: 'مستخدم', role: 'employee' };
}

export default function Support() {
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState('');
  const [sending, setSending]         = useState(false);
  const [ticketId, setTicketId]       = useState(null);
  const [status, setStatus]           = useState('idle'); // idle | open | closed
  const [showQuick, setShowQuick]     = useState(true);
  const [loading, setLoading]         = useState(true);
  const [unread, setUnread]           = useState(0);
  const messagesEndRef                = useRef(null);
  const inputRef                      = useRef(null);
  const user                          = getUser();

  useEffect(() => {
    initChat();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function initChat() {
    // جلب آخر تذكرة مفتوحة للمستخدم
    try {
      const { data: tickets } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);

      if (tickets?.length) {
        const ticket = tickets[0];
        setTicketId(ticket.id);
        setStatus('open');
        await loadMessages(ticket.id);
        subscribeToMessages(ticket.id);
      } else {
        // رسالة ترحيب من الذكاء الاصطناعي
        setMessages([{
          id: 'welcome',
          role: 'agent',
          content: 'مرحباً! 👋 أنا مساعد فلسي الذكي. كيف يمكنني مساعدتك اليوم؟\n\nيمكنك اختيار أحد الأسئلة الشائعة أدناه أو كتابة سؤالك مباشرة.',
          created_at: new Date().toISOString(),
          is_bot: true,
        }]);
        setStatus('idle');
      }
    } catch {
      setMessages([{
        id: 'welcome',
        role: 'agent',
        content: 'مرحباً! كيف يمكنني مساعدتك؟',
        created_at: new Date().toISOString(),
        is_bot: true,
      }]);
    }
    setLoading(false);
  }

  async function loadMessages(tid) {
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', tid)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  }

  function subscribeToMessages(tid) {
    const channel = supabase
      .channel(`support:${tid}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `ticket_id=eq.${tid}`,
      }, (payload) => {
        setMessages(prev => {
          const exists = prev.find(m => m.id === payload.new.id);
          if (exists) return prev;
          return [...prev, payload.new];
        });
        if (payload.new.role === 'agent') {
          setUnread(n => n + 1);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }

  async function sendMessage(text) {
    if (!text.trim() || sending) return;
    setSending(true);
    setShowQuick(false);
    const content = text.trim();
    setInput('');

    // إذا لم توجد تذكرة، أنشئها
    let tid = ticketId;
    if (!tid) {
      try {
        const { data: ticket, error } = await supabase
          .from('support_tickets')
          .insert({
            user_id: user.id,
            user_name: user.name,
            subject: content.slice(0, 80),
            status: 'open',
            branch_id: JSON.parse(localStorage.getItem('activeBranch') || '{}').id || null,
          })
          .select()
          .single();

        if (!error && ticket) {
          tid = ticket.id;
          setTicketId(tid);
          setStatus('open');
          subscribeToMessages(tid);
        }
      } catch { /* محلي */ }
    }

    // إضافة الرسالة محلياً فوراً
    const tempMsg = {
      id: `temp_${Date.now()}`,
      ticket_id: tid,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
      read: false,
    };
    setMessages(prev => [...prev, tempMsg]);

    // حفظ في قاعدة البيانات
    if (tid) {
      try {
        await supabase.from('support_messages').insert({
          ticket_id: tid,
          role: 'user',
          content,
          sender_name: user.name,
        });
      } catch { /* محلي */ }
    }

    // رد الذكاء الاصطناعي (إذا لم يكن هناك وكيل بشري)
    setTimeout(async () => {
      const aiReply = await getAIReply(content);
      const botMsg = {
        id: `bot_${Date.now()}`,
        ticket_id: tid,
        role: 'agent',
        content: aiReply,
        created_at: new Date().toISOString(),
        is_bot: true,
      };
      setMessages(prev => [...prev, botMsg]);

      if (tid) {
        try {
          await supabase.from('support_messages').insert({
            ticket_id: tid,
            role: 'agent',
            content: aiReply,
            sender_name: 'مساعد فلسي',
            is_bot: true,
          });
        } catch { /* محلي */ }
      }
    }, 800);

    setSending(false);
    inputRef.current?.focus();
  }

  async function getAIReply(userMessage) {
    try {
      const key = import.meta.env.VITE_GEMINI_API_KEY;
      if (!key) return getFallbackReply(userMessage);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `أنت مساعد دعم فني لنظام فلسي (Felsy POS) — نظام نقطة بيع سعودي. 
أجب على السؤال التالي باختصار ووضوح باللغة العربية (3-5 جمل):
السؤال: ${userMessage}

النظام يدعم: إدارة المنتجات، الطلبات، الفواتير (ZATCA)، المخزون، الموظفين، التقارير، المطبخ، الدفع الإلكتروني، دمج الدومين.`
              }]
            }]
          })
        }
      );
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || getFallbackReply(userMessage);
    } catch {
      return getFallbackReply(userMessage);
    }
  }

  function getFallbackReply(msg) {
    const lower = msg.toLowerCase();
    if (lower.includes('دومين') || lower.includes('domain'))
      return 'لربط دومينك بالنظام، اذهب إلى الإعدادات ← إدارة الدومين. يمكنك شراء دومين جديد أو ربط دومين موجود مباشرةً من واجهة الإعدادات.';
    if (lower.includes('طباعة') || lower.includes('طابع'))
      return 'للإعداد: الإعدادات ← إعدادات الطابعة. نحن ندعم طابعات الشبكة وUSB والمتصفح. إذا استمرت المشكلة، تواصل معنا على الواتساب.';
    if (lower.includes('فاتور'))
      return 'فلسي يدعم فواتير ZATCA المرحلة الثانية. اذهب إلى الفواتير ← إنشاء فاتورة. تأكد من إدخال رقم VAT في الإعدادات أولاً.';
    if (lower.includes('دخول') || lower.includes('login') || lower.includes('pin'))
      return 'لمشاكل تسجيل الدخول: تأكد من إدخال PIN الصحيح. إذا نسيته، تواصل مع المدير لإعادة ضبطه من إعدادات النظام.';
    return 'شكراً على تواصلك! سيرد عليك أحد أفراد فريق الدعم خلال دقائق. للمساعدة الفورية، تواصل معنا عبر الواتساب.';
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-100px)] gap-0" dir="rtl">
      {/* العنوان */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Headphones className="w-6 h-6 text-primary" />
          الدعم الفني
        </h1>
        <p className="text-muted-foreground text-sm mt-1">نحن هنا لمساعدتك — فريق دعم متاح طوال اليوم</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* شات الدعم */}
        <div className="lg:col-span-2 flex flex-col bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* رأس الشات */}
          <div className="flex items-center gap-3 p-4 border-b border-border bg-gradient-to-l from-primary/5 to-transparent">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div className="absolute bottom-0 left-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-card" />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">مساعد فلسي</p>
              <p className="text-xs text-emerald-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                متصل الآن
              </p>
            </div>
            {unread > 0 && (
              <div className="mr-auto bg-primary text-primary-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unread}
              </div>
            )}
          </div>

          {/* الرسائل */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: '400px' }}>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : messages.map((msg, idx) => (
              <div key={msg.id || idx} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {msg.role === 'agent' && (
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-1">
                    {msg.is_bot ? <Bot className="w-3.5 h-3.5 text-primary" /> : <Headphones className="w-3.5 h-3.5 text-primary" />}
                  </div>
                )}
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tl-none'
                    : 'bg-muted text-foreground rounded-tr-none'
                }`}>
                  {msg.content}
                  <div className={`text-[10px] mt-1 flex items-center gap-1 ${msg.role === 'user' ? 'justify-end text-primary-foreground/60' : 'text-muted-foreground'}`}>
                    {new Date(msg.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                    {msg.role === 'user' && <CheckCheck className="w-3 h-3" />}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* ردود سريعة */}
          {showQuick && messages.length <= 1 && (
            <div className="px-4 pb-2">
              <p className="text-xs text-muted-foreground mb-2">أسئلة شائعة:</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="text-xs bg-muted/80 hover:bg-primary/10 hover:text-primary border border-border rounded-full px-3 py-1 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* حقل الإدخال */}
          <div className="p-3 border-t border-border bg-card/50">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="اكتب رسالتك هنا..."
                rows={1}
                className="flex-1 resize-none bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors min-h-[42px] max-h-[120px]"
                style={{ height: Math.min(120, Math.max(42, input.split('\n').length * 24)) + 'px' }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || sending}
                className="w-10 h-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-all flex-shrink-0"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* معلومات التواصل + ساعات العمل */}
        <div className="space-y-4">
          {/* معلومات التواصل */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" /> تواصل معنا
            </h3>
            <div className="space-y-3">
              {CONTACT_INFO.map((c, i) => (
                <a
                  key={i}
                  href={c.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:scale-[1.01] ${c.bg}`}
                >
                  <c.icon className={`w-4 h-4 flex-shrink-0 ${c.color}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className="text-sm font-medium text-foreground">{c.value}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* ساعات العمل */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> ساعات الدعم
            </h3>
            <div className="space-y-2 text-sm">
              {[
                { days: 'الأحد – الخميس', hours: '8 ص – 10 م', active: true },
                { days: 'الجمعة – السبت', hours: '10 ص – 6 م', active: false },
              ].map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{s.days}</span>
                  <span className={`font-medium ${s.active ? 'text-emerald-500' : 'text-foreground'}`}>{s.hours}</span>
                </div>
              ))}
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl p-2.5 text-xs text-center mt-3">
                <span className="font-bold">الدعم الطارئ: متاح 24/7</span>
                <br />عبر الواتساب
              </div>
            </div>
          </div>

          {/* حالة النظام */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-primary" /> حالة النظام
            </h3>
            {[
              { name: 'الخوادم الرئيسية', ok: true },
              { name: 'قاعدة البيانات', ok: true },
              { name: 'خدمة الدفع', ok: true },
              { name: 'نظام الدومين', ok: true },
            ].map((s, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">{s.name}</span>
                <span className={`flex items-center gap-1 text-xs font-medium ${s.ok ? 'text-emerald-500' : 'text-red-500'}`}>
                  <span className={`w-2 h-2 rounded-full ${s.ok ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  {s.ok ? 'يعمل' : 'مشكلة'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
