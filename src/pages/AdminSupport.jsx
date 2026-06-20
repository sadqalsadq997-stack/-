import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Headphones, MessageCircle, Send, Clock, CheckCheck,
  User, Bot, Circle, Loader2, Search, Filter,
  CheckCircle2, XCircle, RefreshCw, AlertTriangle
} from 'lucide-react';

// ══════════════════════════════════════════════════════
// لوحة تحكم الدعم الفني — للمدير فقط
// عرض كل التذاكر والرد عليها
// ══════════════════════════════════════════════════════

const STATUS_LABELS = {
  open:   { label: 'مفتوحة',   color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  pending: { label: 'معلّقة',  color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  closed: { label: 'مغلقة',   color: 'bg-muted text-muted-foreground' },
};

export default function AdminSupport() {
  const [tickets, setTickets]       = useState([]);
  const [selected, setSelected]     = useState(null);
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState('');
  const [sending, setSending]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('open');
  const [search, setSearch]         = useState('');
  const messagesEndRef              = useRef(null);
  const channelRef                  = useRef(null);

  useEffect(() => {
    loadTickets();
    // اشتراك Realtime لجميع التذاكر الجديدة
    const ch = supabase.channel('admin-support')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => loadTickets())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [filter]);

  useEffect(() => {
    if (selected) {
      loadMessages(selected.id);
      // اشتراك Realtime للرسائل
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = supabase.channel(`admin-ticket-${selected.id}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'support_messages',
          filter: `ticket_id=eq.${selected.id}`,
        }, payload => {
          setMessages(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        })
        .subscribe();
    }
  }, [selected?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadTickets() {
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('status', filter === 'all' ? undefined : filter)
      .order('created_at', { ascending: false });
    setTickets(data || []);
    setLoading(false);
  }

  async function loadMessages(ticketId) {
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    // تعليم كقروءة
    await supabase
      .from('support_messages')
      .update({ read: true })
      .eq('ticket_id', ticketId)
      .eq('role', 'user');
  }

  async function sendReply() {
    if (!input.trim() || !selected || sending) return;
    setSending(true);
    const content = input.trim();
    setInput('');

    const tempMsg = {
      id: `temp_${Date.now()}`,
      ticket_id: selected.id,
      role: 'agent',
      content,
      sender_name: 'فريق الدعم',
      created_at: new Date().toISOString(),
      is_bot: false,
    };
    setMessages(prev => [...prev, tempMsg]);

    await supabase.from('support_messages').insert({
      ticket_id: selected.id,
      role: 'agent',
      content,
      sender_name: 'فريق الدعم',
    });

    setSending(false);
  }

  async function updateTicketStatus(ticketId, status) {
    await supabase.from('support_tickets').update({ status }).eq('id', ticketId);
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status } : t));
    if (selected?.id === ticketId) setSelected(t => ({ ...t, status }));
  }

  const filtered = tickets.filter(t =>
    !search || t.subject?.toLowerCase().includes(search.toLowerCase())
      || t.user_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div dir="rtl" className="flex flex-col h-full">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Headphones className="w-6 h-6 text-primary" />
          لوحة الدعم الفني
        </h1>
        <p className="text-muted-foreground text-sm">إدارة طلبات دعم العملاء والرد عليها</p>
      </div>

      <div className="flex gap-4 flex-1 min-h-0" style={{ maxHeight: 'calc(100vh - 180px)' }}>
        {/* قائمة التذاكر */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-3">
          {/* فلتر + بحث */}
          <div className="flex gap-2">
            {['open', 'pending', 'closed', 'all'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {f === 'open' ? 'مفتوحة' : f === 'pending' ? 'معلّقة' : f === 'closed' ? 'مغلقة' : 'الكل'}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث..."
              className="w-full h-9 bg-muted/50 border border-border rounded-xl pr-9 pl-3 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          {/* التذاكر */}
          <div className="flex-1 overflow-y-auto space-y-1.5">
            {loading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                لا توجد تذاكر
              </div>
            ) : filtered.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className={`w-full text-right p-3 rounded-xl border transition-all ${
                  selected?.id === t.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-muted/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-foreground truncate">{t.user_name || 'مجهول'}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{t.subject || 'بدون عنوان'}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(t.created_at).toLocaleDateString('ar', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium flex-shrink-0 ${STATUS_LABELS[t.status]?.color}`}>
                    {STATUS_LABELS[t.status]?.label}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* نافذة المحادثة */}
        <div className="flex-1 bg-card border border-border rounded-2xl flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>اختر تذكرة لعرض المحادثة</p>
              </div>
            </div>
          ) : (
            <>
              {/* رأس التذكرة */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div>
                  <p className="font-bold text-foreground">{selected.user_name}</p>
                  <p className="text-xs text-muted-foreground">{selected.subject}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateTicketStatus(selected.id, selected.status === 'open' ? 'closed' : 'open')}
                    className={`h-7 px-3 rounded-lg text-xs font-medium transition-colors ${
                      selected.status === 'open'
                        ? 'bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                        : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                    }`}
                  >
                    {selected.status === 'open' ? 'إغلاق' : 'إعادة فتح'}
                  </button>
                </div>
              </div>

              {/* الرسائل */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, idx) => (
                  <div key={msg.id || idx} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row' : 'flex-row-reverse'}`}>
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
                      {msg.role === 'user'
                        ? <User className="w-3.5 h-3.5 text-muted-foreground" />
                        : msg.is_bot ? <Bot className="w-3.5 h-3.5 text-primary" /> : <Headphones className="w-3.5 h-3.5 text-primary" />}
                    </div>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                      msg.role === 'user'
                        ? 'bg-muted text-foreground rounded-tl-none'
                        : 'bg-primary text-primary-foreground rounded-tr-none'
                    }`}>
                      {msg.content}
                      <div className={`text-[10px] mt-1 opacity-60`}>
                        {new Date(msg.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                        {msg.role !== 'user' && <span className="mr-1">{msg.sender_name || 'فريق الدعم'}</span>}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* الرد */}
              {selected.status !== 'closed' && (
                <div className="p-3 border-t border-border">
                  <div className="flex gap-2">
                    <input
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendReply())}
                      placeholder="اكتب ردك هنا..."
                      className="flex-1 h-10 bg-muted/50 border border-border rounded-xl px-4 text-sm focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={sendReply}
                      disabled={!input.trim() || sending}
                      className="w-10 h-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center hover:opacity-90 disabled:opacity-40"
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
