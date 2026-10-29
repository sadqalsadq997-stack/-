// ══════════════════════════════════════════════════════════════════
// Edge Function: ai-chat
// كل طلبات الذكاء الاصطناعي تمر من هنا — مفتاح Gemini يبقى في السيرفر
// (GEMINI_API_KEY في Supabase Secrets) ولا يظهر في المتصفح أبداً.
// حد: 60 طلب بالساعة لكل مستخدم.
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { CORS, json, adminClient, requireTenantMember, errorResponse, HttpError } from '../_shared/auth.ts';

const MAX_PER_HOUR = 60;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const sb = adminClient();
    const caller = await requireTenantMember(req, sb, null, false);

    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt || '').slice(0, 12000);
    const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 600, 50), 1000);
    if (prompt.trim().length < 2) throw new HttpError(400, 'اكتب سؤالك');

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await sb.from('security_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'ai_request').eq('user_id', caller.userId).gte('created_at', since);
    if ((count || 0) >= MAX_PER_HOUR) throw new HttpError(429, 'وصلت الحد المسموح للساعة — حاول بعد قليل');
    await sb.from('security_events').insert({ event_type: 'ai_request', user_id: caller.userId, success: true });

    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ text: null, configured: false });

    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
        }),
      },
    );
    const data = await res.json().catch(() => ({}));
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    return json({ text, configured: true });
  } catch (err) {
    return errorResponse(err);
  }
});
