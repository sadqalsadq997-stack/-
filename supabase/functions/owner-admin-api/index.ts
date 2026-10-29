// ══════════════════════════════════════════════════════════════════
// Edge Function: owner-admin-api — كل عمليات لوحة مالك النظام (/owner)
// كانت مفقودة من المشروع (اللوحة تناديها ولا توجد)، وكانت اللوحة تكتب
// الأسعار والمدونة والإعدادات مباشرة من المتصفح. الآن كل شيء هنا، بعد
// التحقق من جلسة المالك المربوطة بالجهاز.
// انشر بـ: supabase functions deploy owner-admin-api --no-verify-jwt
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { CORS, json, adminClient, errorResponse, HttpError } from '../_shared/auth.ts';
import { requireOwner } from '../_shared/security.ts';

type Payload = Record<string, unknown>;

const pick = (src: Payload, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => src[k] !== undefined).map((k) => [k, src[k]]));
const uuid = (v: unknown) => {
  if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/i.test(v)) throw new HttpError(400, 'معرّف غير صحيح');
  return v;
};
const text = (v: unknown, max = 5000) => String(v ?? '').slice(0, max);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const sb = adminClient();
    const body = await req.json().catch(() => ({}));
    await requireOwner(req, sb, body.ownerToken, body.device_id);
    const action = String(body.action || '');
    const p: Payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};

    const ok = (data: unknown) => json({ data });
    const must = <T>(r: { data: T; error: { message: string } | null }) => {
      if (r.error) throw new HttpError(400, r.error.message);
      return r.data;
    };

    switch (action) {
      // ── العملاء والاشتراكات ─────────────────────────────────────
      case 'list_branches':
        return ok(must(await sb.from('branches').select('id, name, name_ar, tenant_id, is_active, created_at').order('created_at', { ascending: false }).limit(1000)));

      case 'list_subscriptions': {
        const tenants = must(await sb.from('tenants').select('id, name, contact_email, created_at').order('created_at', { ascending: false })) as any[];
        const subs = must(await sb.from('tenant_subscriptions').select('tenant_id, status, current_period_end, billing_plans(plan_code)')) as any[];
        const paid = must(await sb.from('billing_invoices').select('tenant_id, amount').eq('status', 'paid')) as any[];
        const branches = must(await sb.from('branches').select('id, tenant_id')) as any[];
        return ok(tenants.map((t) => {
          const s = subs.find((x) => x.tenant_id === t.id);
          const live = s && ['active', 'trialing'].includes(s.status) && new Date(s.current_period_end) > new Date();
          return {
            client_id: t.id,
            client_name: t.name,
            email: t.contact_email,
            plan: s?.billing_plans?.plan_code || '—',
            status: live ? 'active' : (s?.status || 'none'),
            amount_paid: paid.filter((i) => i.tenant_id === t.id).reduce((n, i) => n + Number(i.amount || 0), 0),
            expires_at: s?.current_period_end || null,
            branch_id: branches.find((b) => b.tenant_id === t.id)?.id || null,
            created_at: t.created_at,
          };
        }));
      }

      // ── المشتركين: بحث بالاسم/البريد/الجوال/رقم الحساب + صفحات ──
      case 'list_subscribers':
        return ok(must(await sb.rpc('owner_list_tenants', {
          p_search: text(p.search, 80) || null,
          p_limit: Math.min(Math.max(Number(p.limit) || 50, 1), 200),
          p_offset: Math.max(Number(p.offset) || 0, 0),
        })));

      // كلمات المرور مشفّرة (bcrypt) ولا يمكن عرضها لأحد — المالك يعيّن كلمة جديدة أو يرسل رابط استعادة
      case 'set_owner_password': {
        const uid = uuid(p.user_id);
        const pw = String(p.password || '');
        if (pw.length < 8 || pw.length > 72) throw new HttpError(400, 'كلمة المرور 8 أحرف على الأقل');
        const { error } = await sb.auth.admin.updateUserById(uid, { password: pw });
        if (error) throw new HttpError(400, 'تعذر تغيير كلمة المرور');
        await sb.from('security_events').insert({ event_type: 'owner_set_password', meta: { user_id: uid } }).then(() => {}, () => {});
        return ok({ updated: true });
      }

      case 'recovery_link': {
        const email = String(p.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new HttpError(400, 'بريد غير صحيح');
        const { data, error } = await sb.auth.admin.generateLink({ type: 'recovery', email });
        const hash = (data as any)?.properties?.hashed_token;
        if (error || !hash) throw new HttpError(400, 'تعذر إنشاء الرابط');
        const site = (Deno.env.get('SITE_URL') || 'https://felsy.org').replace(/\/+$/, '');
        // رابط على دومين فلسي (ما يظهر رابط Supabase للعميل) — صالح لمرة واحدة
        return ok({ link: `${site}/auth/reset?token_hash=${hash}&type=recovery` });
      }

      case 'set_tenant_period': {
        const tid = uuid(p.tenant_id);
        const end = new Date(String(p.period_end || ''));
        if (isNaN(+end)) throw new HttpError(400, 'تاريخ غير صحيح');
        return ok(must(await sb.from('tenant_subscriptions').update({ current_period_end: end.toISOString(), status: 'active' })
          .eq('tenant_id', tid).select('tenant_id, current_period_end, status')));
      }

      case 'list_tenant_subscriptions':
        return ok(must(await sb.from('tenant_subscriptions')
          .select('id, tenant_id, status, current_period_start, current_period_end, next_charge_amount, trial_periods_remaining, moyasar_card_brand, moyasar_card_last_four, failed_attempts, created_at, billing_plans(plan_code, name_ar, price_monthly), tenants(name)')
          .order('created_at', { ascending: false })));

      case 'list_billing_invoices':
        return ok(must(await sb.from('billing_invoices').select('id, tenant_id, amount, currency, status, failure_reason, paid_at, created_at')
          .order('created_at', { ascending: false }).limit(300)));

      case 'suspend_tenant_subscription':
      case 'reactivate_tenant_subscription':
      case 'cancel_tenant_subscription': {
        const status = { suspend_tenant_subscription: 'suspended', reactivate_tenant_subscription: 'active', cancel_tenant_subscription: 'cancelled' }[action];
        return ok(must(await sb.from('tenant_subscriptions').update({ status }).eq('id', uuid(p.id)).select('id, status')));
      }

      // ── الدعم الفني ─────────────────────────────────────────────
      case 'list_support_tickets':
        return ok(must(await sb.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(300)));

      case 'list_support_messages':
        return ok(must(await sb.from('support_messages').select('*').eq('ticket_id', uuid(p.ticket_id)).order('created_at')));

      case 'reply_support_ticket': {
        const ticketId = uuid(p.ticket_id);
        const ticket = must(await sb.from('support_tickets').select('id, tenant_id').eq('id', ticketId).maybeSingle()) as any;
        if (!ticket) throw new HttpError(404, 'التذكرة غير موجودة');
        must(await sb.from('support_messages').insert({
          ticket_id: ticketId, tenant_id: ticket.tenant_id, role: 'agent',
          content: text(p.content, 4000), sender_name: 'فريق فلسي', is_bot: false,
        }));
        must(await sb.from('support_tickets').update({ status: text(p.status || 'answered', 20), updated_at: new Date().toISOString() }).eq('id', ticketId));
        return ok(true);
      }

      case 'update_ticket_status': {
        const status = text(p.status, 20);
        if (!['open', 'pending', 'answered', 'closed'].includes(status)) throw new HttpError(400, 'حالة غير صحيحة');
        return ok(must(await sb.from('support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', uuid(p.ticket_id))));
      }

      // ── رسائل لأصحاب المنشآت ───────────────────────────────────
      case 'send_owner_notifications': {
        const list = Array.isArray(p.messages) ? p.messages.slice(0, 5000) : [];
        const rows = list.map((m: any) => ({
          tenant_id: uuid(m.recipient_id),
          recipient_id: m.recipient_id,
          recipient_name: text(m.recipient_name, 200),
          subject: text(m.subject, 200),
          body: text(m.body, 5000),
          type: 'broadcast',
          sent_at: new Date().toISOString(),
        }));
        if (rows.length) must(await sb.from('owner_notifications').insert(rows));
        return ok(rows.length);
      }

      // ── الأسعار والعروض ─────────────────────────────────────────
      case 'list_billing_plans':
        return ok(must(await sb.from('billing_plans').select('*').order('plan_code').order('version', { ascending: false })));

      case 'publish_billing_plan': {
        const code = text(p.plan_code, 40);
        const price = Number(p.price_monthly);
        if (!code || !text(p.name_ar, 80) || !(price >= 0 && price < 100000)) throw new HttpError(400, 'بيانات الخطة غير صحيحة');
        const existing = must(await sb.from('billing_plans').select('version, included_branches, extra_branch_price').eq('plan_code', code).order('version', { ascending: false }).limit(1)) as any[];
        const prev = existing?.[0];
        const version = (prev?.version || 0) + 1;
        const included = p.included_branches !== undefined ? Math.trunc(Number(p.included_branches)) : (prev?.included_branches ?? 1);
        const extra = p.extra_branch_price !== undefined && p.extra_branch_price !== '' ? Number(p.extra_branch_price) : (prev?.extra_branch_price ?? price);
        if (!(included >= 1 && included <= 999) || !(extra >= 0 && extra < 100000)) throw new HttpError(400, 'إعدادات الفروع غير صحيحة');
        must(await sb.from('billing_plans').update({ is_active: false }).eq('plan_code', code));
        must(await sb.from('billing_plans').insert({
          plan_code: code, version, name_ar: text(p.name_ar, 80), price_monthly: price,
          features: Array.isArray(p.features) ? p.features.map((f) => text(f, 200)).slice(0, 30) : [],
          included_branches: included, extra_branch_price: extra,
          is_active: true,
        }));
        return ok({ version });
      }

      case 'list_billing_promotions':
        return ok(must(await sb.from('billing_promotions').select('*').order('created_at', { ascending: false })));

      case 'create_billing_promotion':
        return ok(must(await sb.from('billing_promotions').insert(pick(p, [
          'code', 'name_ar', 'plan_code', 'trial_price', 'trial_period_count', 'trial_period_unit', 'max_redemptions', 'valid_until',
        ])).select('id')));

      case 'list_subscription_plans':
        return ok(must(await sb.from('subscription_plans').select('*').order('sort_order')));

      case 'save_subscription_plan': {
        const row = pick(p, ['name', 'description', 'price_monthly', 'price_yearly', 'features', 'sort_order', 'is_active']);
        if (p.id) must(await sb.from('subscription_plans').update(row).eq('id', uuid(p.id)));
        else must(await sb.from('subscription_plans').insert(row));
        return ok(true);
      }

      case 'delete_subscription_plan':
        return ok(must(await sb.from('subscription_plans').delete().eq('id', uuid(p.id))));

      // ── طلبات الاشتراك والتحويلات البنكية ────────────────────────
      case 'list_billing_orders': {
        let q = sb.from('billing_orders').select('*, tenants(name, contact_phone, contact_email)')
          .order('created_at', { ascending: false }).limit(200);
        const st = text(p.status, 30);
        if (st) q = q.eq('status', st);
        return ok(must(await q));
      }

      case 'receipt_url': {
        const { data: o } = await sb.from('billing_orders').select('receipt_path').eq('id', uuid(p.id)).maybeSingle();
        if (!o?.receipt_path) throw new HttpError(404, 'لا يوجد إيصال');
        const { data, error } = await sb.storage.from('receipts').createSignedUrl(o.receipt_path, 600);
        if (error) throw new HttpError(400, error.message);
        return ok(data.signedUrl);
      }

      case 'approve_order': {
        const id = uuid(p.id);
        const r = must(await sb.rpc('billing_activate_order', { p_order: id, p_ref: `transfer:${id.slice(0, 8)}`, p_method: 'transfer' }));
        await sb.from('billing_orders').update({ reviewed_at: new Date().toISOString(), review_note: text(p.note, 300) || null }).eq('id', id);
        return ok(r);
      }

      case 'reject_order': {
        const note = text(p.note, 300);
        if (note.length < 3) throw new HttpError(400, 'اكتب سبب الرفض ليظهر للعميل');
        return ok(must(await sb.from('billing_orders').update({
          status: 'rejected', review_note: note, reviewed_at: new Date().toISOString(),
        }).eq('id', uuid(p.id)).eq('status', 'pending_review').select('id')));
      }

      case 'list_billing_terms':
        return ok(must(await sb.from('billing_terms').select('*').order('months')));

      case 'save_billing_term': {
        const months = Math.trunc(Number(p.months));
        const disc = Number(p.discount_pct);
        if (!(months >= 1 && months <= 36) || !(disc >= 0 && disc <= 90)) throw new HttpError(400, 'قيم غير صحيحة');
        return ok(must(await sb.from('billing_terms').upsert({
          months, discount_pct: disc, label_ar: text(p.label_ar, 40) || null, is_active: p.is_active !== false,
        }, { onConflict: 'months' })));
      }

      // ── المدونة ──────────────────────────────────────────────────
      case 'list_blog_posts':
        return ok(must(await sb.from('blog_posts').select('*').order('published_at', { ascending: false })));

      case 'save_blog_post': {
        const row: Payload = pick(p, ['title', 'slug', 'excerpt', 'content', 'category', 'seo_title', 'seo_description', 'published',
          'cover_url', 'cover_alt', 'author_name', 'featured', 'cta']);
        if (row.title !== undefined) row.title = text(row.title, 160).trim();
        if (p.id === undefined && !row.title) throw new HttpError(400, 'العنوان مطلوب');
        // الرابط: حروف عربية/إنجليزية وأرقام وشرطات فقط
        const rawSlug = String(row.slug || row.title || '').toLowerCase().trim();
        if (row.slug !== undefined || p.id === undefined) {
          row.slug = rawSlug.replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
          if (!row.slug) throw new HttpError(400, 'رابط المقالة غير صالح');
        }
        if (row.category !== undefined && !['solutions', 'guides', 'zatca', 'restaurants', 'retail', 'news', 'updates'].includes(String(row.category))) row.category = 'solutions';
        if (row.cta !== undefined && !['trial', 'demo', 'whatsapp', 'none'].includes(String(row.cta))) row.cta = 'trial';
        if (row.content !== undefined) {
          row.content = text(row.content, 200_000);
          const words = String(row.content).split(/\s+/).filter(Boolean).length;
          row.reading_minutes = Math.max(1, Math.round(words / 180));
        }
        if (row.cover_url !== undefined && row.cover_url && !/^(https:\/\/|\/api\/db\/storage\/v1\/object\/public\/blog\/)/.test(String(row.cover_url))) {
          throw new HttpError(400, 'رابط الغلاف غير صالح');
        }
        if (Array.isArray(p.tags)) row.tags = (p.tags as unknown[]).map((t) => text(t, 40).trim()).filter(Boolean).slice(0, 12);
        if (Array.isArray(p.faq)) {
          row.faq = (p.faq as Array<Record<string, unknown>>).map((f) => ({ q: text(f?.q, 300).trim(), a: text(f?.a, 2000).trim() }))
            .filter((f) => f.q && f.a).slice(0, 15);
        }
        if (p.published_at) {
          const d = new Date(String(p.published_at));
          if (isNaN(+d)) throw new HttpError(400, 'تاريخ النشر غير صحيح');
          row.published_at = d.toISOString();
        }
        row.updated_at = new Date().toISOString();
        const res = p.id
          ? await sb.from('blog_posts').update(row).eq('id', uuid(p.id)).select('id, slug').single()
          : await sb.from('blog_posts').insert({ published_at: new Date().toISOString(), ...row }).select('id, slug').single();
        if (res.error) throw new HttpError(400, /duplicate|unique/i.test(res.error.message) ? 'رابط المقالة مستخدم — غيّره' : res.error.message);
        return ok(res.data);
      }

      case 'upload_blog_image': {
        const type = String(p.content_type || '');
        if (!['image/webp', 'image/jpeg', 'image/png'].includes(type)) throw new HttpError(400, 'صور فقط');
        const bytes = Uint8Array.from(atob(String(p.data || '')), (c) => c.charCodeAt(0));
        if (!bytes.length || bytes.length > 1_000_000) throw new HttpError(400, 'حجم الصورة أكبر من 1MB');
        const ext = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg';
        const path = `posts/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const up = await sb.storage.from('blog').upload(path, bytes, { contentType: type, cacheControl: '31536000', upsert: false });
        if (up.error) throw new HttpError(400, 'تعذر رفع الصورة');
        // رابط على دومين فلسي (عبر الوكيل) — ما يظهر رابط Supabase
        return ok({ path, url: `/api/db/storage/v1/object/public/blog/${path}` });
      }

      case 'delete_blog_post':
        return ok(must(await sb.from('blog_posts').delete().eq('id', uuid(p.id))));

      // ── إعدادات النظام ───────────────────────────────────────────
      case 'get_setting': {
        const key = text(p.key, 60);
        if (!['ai_assistant', 'about_us_content'].includes(key)) throw new HttpError(400, 'إعداد غير معروف');
        const row = must(await sb.from('system_settings').select('value').eq('key', key).maybeSingle()) as any;
        return ok(row?.value ?? null);
      }

      case 'save_ai_settings':
        return ok(must(await sb.from('system_settings').upsert({
          key: 'ai_assistant',
          value: JSON.stringify({ name: text(p.name, 60), persona: text(p.persona, 2000) }),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })));

      case 'update_about_content':
        return ok(must(await sb.from('system_settings').upsert({
          key: 'about_us_content', value: text(p.content, 20000), updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })));

      // ── الفريق وقاعدة البيانات ───────────────────────────────────
      case 'list_team_members':
        return ok(must(await sb.from('platform_team_members').select('*').order('created_at')));

      case 'add_team_member':
        if (!text(p.full_name, 120).trim()) throw new HttpError(400, 'الاسم مطلوب');
        return ok(must(await sb.from('platform_team_members').insert(pick(p, ['full_name', 'email', 'phone', 'role', 'notes'])).select('id')));

      case 'update_team_member': {
        const u = (p.updates && typeof p.updates === 'object') ? p.updates as Payload : {};
        return ok(must(await sb.from('platform_team_members').update(pick(u, ['full_name', 'email', 'phone', 'role', 'notes', 'is_active'])).eq('id', uuid(p.id))));
      }

      case 'delete_team_member':
        return ok(must(await sb.from('platform_team_members').delete().eq('id', uuid(p.id))));

      case 'db_overview': {
        const tables = ['tenants', 'branches', 'products', 'orders', 'customers', 'employee_profiles', 'support_tickets', 'billing_invoices'];
        const out: Record<string, number> = {};
        for (const t of tables) {
          const { count } = await sb.from(t).select('*', { count: 'exact', head: true });
          out[t] = count || 0;
        }
        return ok(out);
      }

      case 'logout': {
        const { sha256Hex } = await import('../_shared/security.ts');
        await sb.from('owner_sessions').delete().eq('token_hash', await sha256Hex(String(body.ownerToken)));
        return ok(true);
      }

      default:
        throw new HttpError(400, 'عملية غير معروفة');
    }
  } catch (err) {
    return errorResponse(err);
  }
});
