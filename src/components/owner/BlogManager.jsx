import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Loader2, Search, Eye, Pencil, Trash2, ExternalLink, ArrowRight, Image as ImageIcon, Bold, Heading2, Heading3,
  List, ListOrdered, Link2, Quote, Table2, AlertCircle, Save, Star, CalendarClock, FileText, X, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { renderMarkdown } from '@/lib/markdown';
import { compressImage } from '@/lib/images';
import { BLOG_CATEGORIES, categoryLabel } from '@/content/blog';

// ══════════════════════════════════════════════════════════════════
// إدارة المدونة — لوحة المالك
// كل الحفظ عبر owner-admin-api (جلسة المالك الموثقة) — المتصفح ما يكتب
// في القاعدة مباشرة.
// ══════════════════════════════════════════════════════════════════

const TEMPLATES = {
  solution: `## المشكلة
وصف المشكلة اللي يواجهها صاحب المنشأة بلغة بسيطة — متى تصير، وكم تكلفه (وقت، فلوس، عملاء).

## ليش تصير؟
- السبب الأول
- السبب الثاني

## الحل خطوة بخطوة
1. الخطوة الأولى
2. الخطوة الثانية
3. الخطوة الثالثة

::: نصيحة من فريق فلسي
نصيحة قصيرة عملية يقدر يطبقها اليوم.
:::

## كيف يساعدك فلسي؟
اشرح الميزة اللي تحل المشكلة، مع رابط [الصفحة](/electronic-pager).

## الخلاصة
جملتين تلخص الحل.`,
  guide: `## قبل ما تبدأ
وش تحتاج تجهز.

## الخطوات
1. أول خطوة
2. ثاني خطوة

| الخيار | متى تستخدمه |
|---|---|
| الأول | ... |
| الثاني | ... |

::: تنبيه
نقطة مهمة لا تفوتها.
:::

## أسئلة متكررة
أضف الأسئلة في تبويب "الأسئلة الشائعة" عشان تطلع في نتائج Google.`,
};

const blank = () => ({
  title: '', slug: '', excerpt: '', content: '', category: 'solutions', tags: [], cover_url: '', cover_alt: '',
  author_name: 'فريق فلسي', seo_title: '', seo_description: '', published: false, published_at: null, featured: false,
  faq: [], cta: 'trial',
});

function statusOf(p) {
  if (!p.published) return ['مسودة', 'bg-gray-100 text-gray-600'];
  if (p.published_at && new Date(p.published_at) > new Date()) return ['مجدولة', 'bg-amber-100 text-amber-700'];
  return ['منشورة', 'bg-emerald-100 text-emerald-700'];
}

const toLocalInput = (d) => { if (!d) return ''; const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

export default function BlogManager({ api }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPosts((await api('list_blog_posts')) || []); } catch (e) { toast.error(e.message); }
    setLoading(false);
  }, [api]);
  useEffect(() => { load(); }, [load]);

  async function remove(p) {
    if (!window.confirm(`حذف "${p.title}" نهائياً؟`)) return;
    try { await api('delete_blog_post', { id: p.id }); toast.success('تم الحذف'); load(); } catch (e) { toast.error(e.message); }
  }

  if (editing) return <Editor api={api} initial={editing} onClose={(changed) => { setEditing(null); if (changed) load(); }} />;

  const shown = posts.filter(p => !q || p.title?.includes(q) || p.slug?.includes(q) || (p.tags || []).includes(q));
  const counts = { all: posts.length, live: posts.filter(p => statusOf(p)[0] === 'منشورة').length, drafts: posts.filter(p => !p.published).length };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-black text-gray-900"><FileText className="h-5 w-5" />المدونة</h3>
          <p className="text-xs text-gray-500">{counts.live} منشورة · {counts.drafts} مسودة — تظهر في felsy.org/blog وتنفهرس في Google تلقائياً</p>
        </div>
        <a href="/blog" target="_blank" rel="noopener" className="mr-auto flex items-center gap-1 text-sm font-bold text-gray-600 hover:text-gray-900"><ExternalLink className="h-4 w-4" />فتح المدونة</a>
        <button onClick={() => setEditing(blank())} className="flex h-10 items-center gap-1.5 rounded-xl bg-gray-900 px-4 text-sm font-bold text-white"><Plus className="h-4 w-4" />مقالة جديدة</button>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالعنوان أو الوسم..." className="h-10 w-full rounded-xl border border-gray-300 bg-white pl-3 pr-9 text-sm text-gray-900 focus:border-gray-500 focus:outline-none" />
      </div>
      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-14 text-center">
          <p className="font-bold text-gray-700">ما فيه مقالات بعد</p>
          <p className="mt-1 text-sm text-gray-500">ابدأ بمقالة حلول: مشكلة يواجهها صاحب المطعم ← الحل خطوة بخطوة</p>
          <button onClick={() => setEditing({ ...blank(), content: TEMPLATES.solution })} className="mt-4 rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white">ابدأ من قالب</button>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {shown.map(p => {
            const [label, cls] = statusOf(p);
            return (
              <div key={p.id} className="flex items-center gap-4 p-3">
                <div className="h-14 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                  {p.cover_url ? <img src={p.cover_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ImageIcon className="h-5 w-5 text-gray-300" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-gray-900">{p.featured && <Star className="ml-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" />}{p.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${cls}`}>{label}</span>
                    <span>{categoryLabel(p.category)}</span>
                    {p.published_at && <span>{new Date(p.published_at).toLocaleDateString('ar-SA-u-ca-gregory')}</span>}
                    {p.reading_minutes && <span>{p.reading_minutes} د</span>}
                  </p>
                </div>
                <div className="flex gap-1">
                  {statusOf(p)[0] === 'منشورة' && <a href={`/blog/${encodeURIComponent(p.slug)}`} target="_blank" rel="noopener" title="عرض" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><Eye className="h-4 w-4" /></a>}
                  <button onClick={() => setEditing({ ...blank(), ...p })} title="تعديل" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remove(p)} title="حذف" className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── المحرر ──────────────────────────────────────────────────────────
function Editor({ api, initial, onClose }) {
  const [f, setF] = useState(initial);
  const [tab, setTab] = useState('write'); // write | preview | seo | faq
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [publishMode, setPublishMode] = useState(() => !initial.published ? 'draft' : (initial.published_at && new Date(initial.published_at) > new Date() ? 'schedule' : 'now'));
  const [when, setWhen] = useState(toLocalInput(initial.published_at || new Date(Date.now() + 864e5)));
  const ta = useRef(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const rendered = useMemo(() => renderMarkdown(f.content), [f.content]);
  const words = rendered.words;
  const dirty = useRef(false);
  useEffect(() => { dirty.current = true; }, [f]);

  // أدوات الكتابة: تلف التحديد أو تضيف سطر
  function wrap(before, after = '', placeholder = 'نص') {
    const el = ta.current; if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const sel = value.slice(a, b) || placeholder;
    const next = value.slice(0, a) + before + sel + after + value.slice(b);
    set('content', next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + sel.length); });
  }
  const line = (prefix, placeholder) => {
    const el = ta.current; const v = el?.value || ''; const a = el?.selectionStart ?? v.length;
    const start = v.lastIndexOf('\n', a - 1) + 1;
    set('content', v.slice(0, start) + prefix + (v.slice(start, a) ? '' : placeholder) + v.slice(start));
    requestAnimationFrame(() => el?.focus());
  };
  const insertBlock = (block) => {
    const el = ta.current; const v = el?.value || ''; const a = el?.selectionEnd ?? v.length;
    set('content', v.slice(0, a) + `\n\n${block}\n\n` + v.slice(a));
  };

  async function uploadImage(file, onUrl) {
    try {
      const blob = await compressImage(file, { max: 1600, quality: 0.82 });
      if (blob.size > 1_000_000) throw new Error('الصورة كبيرة حتى بعد الضغط');
      const data = btoa(new Uint8Array(await blob.arrayBuffer()).reduce((s, b) => s + String.fromCharCode(b), ''));
      const r = await api('upload_blog_image', { content_type: blob.type, data });
      onUrl(r.url);
      toast.success('تم رفع الصورة');
    } catch (e) { toast.error(e.message || 'تعذر الرفع'); }
  }

  async function save(mode = publishMode) {
    if (!f.title.trim()) { toast.error('العنوان مطلوب'); return; }
    if (mode !== 'draft' && words < 120) { toast.error('المقالة قصيرة جداً للنشر (أقل من 120 كلمة)'); return; }
    if (mode === 'schedule' && new Date(when) <= new Date()) { toast.error('موعد النشر لازم يكون بالمستقبل'); return; }
    setSaving(true);
    try {
      const payload = {
        ...(f.id ? { id: f.id } : {}),
        title: f.title, slug: f.slug || undefined, excerpt: f.excerpt, content: f.content, category: f.category, tags: f.tags,
        cover_url: f.cover_url || null, cover_alt: f.cover_alt || null, author_name: f.author_name, seo_title: f.seo_title || null,
        seo_description: f.seo_description || null, featured: !!f.featured, faq: f.faq, cta: f.cta,
        published: mode !== 'draft',
        ...(mode === 'now' && (!f.published || (f.published_at && new Date(f.published_at) > new Date())) ? { published_at: new Date().toISOString() } : {}),
        ...(mode === 'schedule' ? { published_at: new Date(when).toISOString() } : {}),
      };
      const r = await api('save_blog_post', payload);
      setF(x => ({ ...x, id: r.id, slug: r.slug, published: mode !== 'draft' }));
      dirty.current = false;
      toast.success(mode === 'draft' ? 'حُفظت كمسودة' : mode === 'schedule' ? 'تمت الجدولة' : 'نُشرت المقالة ✓');
    } catch (e) { toast.error(e.message); }
    setSaving(false);
  }

  const seoTitle = f.seo_title || f.title;
  const seoDesc = f.seo_description || f.excerpt;
  const inp = 'w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-600 focus:outline-none';
  const Tool = ({ icon: I, label, onClick }) => <button type="button" title={label} onClick={onClick} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"><I className="h-4 w-4" /></button>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { if (!dirty.current || window.confirm('خروج بدون حفظ التعديلات؟')) onClose(true); }} className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100"><ArrowRight className="h-4 w-4" />رجوع</button>
        <span className="text-xs text-gray-500">{words} كلمة · {Math.max(1, Math.round(words / 180))} د قراءة</span>
        <div className="mr-auto flex flex-wrap items-center gap-2">
          <select value={publishMode} onChange={e => setPublishMode(e.target.value)} className="h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm">
            <option value="draft">مسودة</option><option value="now">نشر الآن</option><option value="schedule">جدولة</option>
          </select>
          {publishMode === 'schedule' && <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className="h-10 rounded-xl border border-gray-300 bg-white px-2 text-sm" />}
          <button onClick={() => save()} disabled={saving} className="flex h-10 items-center gap-1.5 rounded-xl bg-gray-900 px-5 text-sm font-bold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : publishMode === 'schedule' ? <CalendarClock className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {publishMode === 'draft' ? 'حفظ' : publishMode === 'schedule' ? 'جدولة' : 'نشر'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <input value={f.title} onChange={e => set('title', e.target.value)} placeholder="عنوان المقالة — واضح ويحتوي الكلمة اللي يبحث عنها العميل"
            className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-xl font-black text-gray-900 focus:border-gray-600 focus:outline-none" />
          <textarea value={f.excerpt} onChange={e => set('excerpt', e.target.value)} rows={2} maxLength={300}
            placeholder="ملخص قصير (يظهر في بطاقة المقالة وفي Google)" className={`${inp} resize-none py-2`} />

          <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
            {[['write', 'كتابة'], ['preview', 'معاينة'], ['faq', `أسئلة شائعة (${f.faq.length})`], ['seo', 'محركات البحث']].map(([id, l]) => (
              <button key={id} onClick={() => setTab(id)} className={`flex-1 rounded-lg py-2 text-xs font-bold ${tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{l}</button>
            ))}
          </div>

          {tab === 'write' && (
            <div className="overflow-hidden rounded-2xl border border-gray-300 bg-white">
              <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1">
                <Tool icon={Heading2} label="عنوان رئيسي" onClick={() => line('## ', 'عنوان')} />
                <Tool icon={Heading3} label="عنوان فرعي" onClick={() => line('### ', 'عنوان فرعي')} />
                <Tool icon={Bold} label="عريض" onClick={() => wrap('**', '**')} />
                <Tool icon={List} label="قائمة" onClick={() => line('- ', 'عنصر')} />
                <Tool icon={ListOrdered} label="خطوات" onClick={() => line('1. ', 'خطوة')} />
                <Tool icon={Link2} label="رابط" onClick={() => wrap('[', '](https://felsy.org/pricing)', 'نص الرابط')} />
                <Tool icon={Quote} label="اقتباس" onClick={() => line('> ', 'اقتباس')} />
                <Tool icon={AlertCircle} label="صندوق ملاحظة" onClick={() => insertBlock('::: نصيحة\nنص النصيحة\n:::')} />
                <Tool icon={Table2} label="جدول" onClick={() => insertBlock('| العمود الأول | العمود الثاني |\n|---|---|\n| قيمة | قيمة |')} />
                <label title="صورة داخل المقالة" className="cursor-pointer rounded-lg p-2 text-gray-600 hover:bg-gray-100">
                  {uploading === 'inline' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                  <input type="file" accept="image/*" className="hidden" onChange={async e => {
                    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
                    setUploading('inline'); await uploadImage(file, (url) => insertBlock(`![وصف الصورة](${url})`)); setUploading('');
                  }} />
                </label>
                <div className="mr-auto flex gap-1">
                  <button onClick={() => { if (!f.content || window.confirm('استبدال المحتوى بالقالب؟')) set('content', TEMPLATES.solution); }} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100"><Sparkles className="h-3.5 w-3.5" />قالب حلول</button>
                  <button onClick={() => { if (!f.content || window.confirm('استبدال المحتوى بالقالب؟')) set('content', TEMPLATES.guide); }} className="rounded-lg px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100">قالب دليل</button>
                </div>
              </div>
              <textarea ref={ta} value={f.content} onChange={e => set('content', e.target.value)} dir="rtl" rows={22}
                placeholder={'اكتب هنا...\n\n## عنوان قسم\nفقرة عادية، **كلمة مهمة**، و[رابط](/pricing)\n\n- نقطة\n- نقطة'}
                className="w-full resize-y border-0 p-4 font-sans text-[15px] leading-8 text-gray-900 focus:outline-none" />
            </div>
          )}

          {tab === 'preview' && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6" dir="rtl">
              <h1 className="mb-4 text-3xl font-black text-gray-900">{f.title || 'بدون عنوان'}</h1>
              {f.cover_url && <img src={f.cover_url} alt="" className="mb-6 aspect-[16/9] w-full rounded-2xl object-cover" />}
              <div className="prose-felsy" dangerouslySetInnerHTML={{ __html: rendered.html }} />
            </div>
          )}

          {tab === 'faq' && (
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500">الأسئلة تظهر أسفل المقالة وتُرسل لـ Google كـ FAQ (تزيد فرص الظهور في النتائج).</p>
              {f.faq.map((x, i) => (
                <div key={i} className="space-y-2 rounded-xl bg-gray-50 p-3">
                  <div className="flex gap-2">
                    <input value={x.q} onChange={e => set('faq', f.faq.map((y, j) => j === i ? { ...y, q: e.target.value } : y))} placeholder="السؤال" className={`${inp} h-9`} />
                    <button onClick={() => set('faq', f.faq.filter((_, j) => j !== i))} className="rounded-lg p-2 text-gray-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                  </div>
                  <textarea value={x.a} onChange={e => set('faq', f.faq.map((y, j) => j === i ? { ...y, a: e.target.value } : y))} rows={2} placeholder="الجواب" className={`${inp} resize-none py-2`} />
                </div>
              ))}
              <button onClick={() => set('faq', [...f.faq, { q: '', a: '' }])} className="flex items-center gap-1 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm font-bold text-gray-600"><Plus className="h-4 w-4" />سؤال</button>
            </div>
          )}

          {tab === 'seo' && (
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4">
              <div className="rounded-xl border border-gray-200 p-4" dir="rtl">
                <p className="text-xs text-gray-500">معاينة نتيجة Google</p>
                <p className="mt-1 truncate text-sm text-emerald-700" dir="ltr">felsy.org › blog › {f.slug || '...'}</p>
                <p className="truncate text-lg text-blue-700">{seoTitle || 'عنوان المقالة'} | مدونة فلسي</p>
                <p className="line-clamp-2 text-sm text-gray-600">{seoDesc || 'الوصف...'}</p>
              </div>
              <label className="block text-xs font-bold text-gray-700">عنوان SEO <span className={`font-normal ${seoTitle.length > 60 ? 'text-red-600' : 'text-gray-400'}`}>({seoTitle.length}/60)</span>
                <input value={f.seo_title || ''} onChange={e => set('seo_title', e.target.value)} placeholder={f.title} className={`${inp} mt-1 h-10`} /></label>
              <label className="block text-xs font-bold text-gray-700">وصف SEO <span className={`font-normal ${(seoDesc || '').length > 160 ? 'text-red-600' : 'text-gray-400'}`}>({(seoDesc || '').length}/160)</span>
                <textarea value={f.seo_description || ''} onChange={e => set('seo_description', e.target.value)} rows={3} placeholder={f.excerpt} className={`${inp} mt-1 resize-none py-2`} /></label>
              <label className="block text-xs font-bold text-gray-700">رابط المقالة
                <input value={f.slug} onChange={e => set('slug', e.target.value)} placeholder="يتولد من العنوان تلقائياً" className={`${inp} mt-1 h-10`} />
                <span className="mt-1 block font-normal text-gray-400">تغيير الرابط بعد النشر يكسر الروابط القديمة — ثبّته بعد أول نشر.</span></label>
            </div>
          )}
        </div>

        {/* الشريط الجانبي */}
        <aside className="space-y-3">
          <div className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-bold text-gray-700">صورة الغلاف</p>
            <div className="aspect-[16/9] overflow-hidden rounded-xl bg-gray-100">
              {f.cover_url ? <img src={f.cover_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-gray-400">1600×900 مقترح</div>}
            </div>
            <label className="flex h-9 cursor-pointer items-center justify-center gap-1 rounded-xl border border-gray-300 text-xs font-bold text-gray-700">
              {uploading === 'cover' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} {f.cover_url ? 'تغيير' : 'رفع صورة'}
              <input type="file" accept="image/*" className="hidden" onChange={async e => {
                const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
                setUploading('cover'); await uploadImage(file, (url) => set('cover_url', url)); setUploading('');
              }} />
            </label>
            <input value={f.cover_alt || ''} onChange={e => set('cover_alt', e.target.value)} placeholder="وصف الصورة (لمحركات البحث)" className={`${inp} h-9 text-xs`} />
          </div>
          <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
            <label className="block text-xs font-bold text-gray-700">التصنيف
              <select value={f.category} onChange={e => set('category', e.target.value)} className={`${inp} mt-1 h-9`}>
                {BLOG_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select></label>
            <div className="text-xs font-bold text-gray-700">الوسوم
              <div className="mt-1 flex flex-wrap gap-1">
                {f.tags.map(t => <span key={t} className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs">{t}<button onClick={() => set('tags', f.tags.filter(x => x !== t))}><X className="h-3 w-3" /></button></span>)}
              </div>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="اكتب وسم واضغط Enter"
                onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) { e.preventDefault(); if (!f.tags.includes(tagInput.trim())) set('tags', [...f.tags, tagInput.trim()].slice(0, 12)); setTagInput(''); } }}
                className={`${inp} mt-1 h-9 font-normal`} />
            </div>
            <label className="block text-xs font-bold text-gray-700">الكاتب
              <input value={f.author_name} onChange={e => set('author_name', e.target.value)} className={`${inp} mt-1 h-9`} /></label>
            <label className="block text-xs font-bold text-gray-700">دعوة في آخر المقالة
              <select value={f.cta} onChange={e => set('cta', e.target.value)} className={`${inp} mt-1 h-9`}>
                <option value="trial">ابدأ الاشتراك</option><option value="whatsapp">تواصل واتساب</option><option value="demo">طلب عرض</option><option value="none">بدون</option>
              </select></label>
            <label className="flex items-center gap-2 text-xs font-bold text-gray-700">
              <input type="checkbox" checked={!!f.featured} onChange={e => set('featured', e.target.checked)} className="h-4 w-4" />مقالة مميزة (تظهر أولاً)
            </label>
          </div>
          {f.id && f.published && <a href={`/blog/${encodeURIComponent(f.slug)}`} target="_blank" rel="noopener" className="flex items-center justify-center gap-1 text-sm font-bold text-gray-600"><ExternalLink className="h-4 w-4" />فتح المقالة</a>}
        </aside>
      </div>
    </div>
  );
}
