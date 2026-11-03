import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';
import { Upload, BriefcaseBusiness, MapPin, Clock3, Send, FileText } from 'lucide-react';
import { toast } from 'sonner';

const copy = {
  ar: {
    eyebrow:'انضم إلى فريق فلسي', title:'ابنِ المستقبل معنا', intro:'اكتشف الفرص الوظيفية في فلسي وقدّم طلبك مباشرة من الموقع.',
    openings:'الوظائف المتاحة', noJobs:'لا توجد وظائف منشورة حالياً. تابعنا للاطلاع على الفرص الجديدة.',
    apply:'التقديم على الوظيفة', general:'طلب توظيف عام', name:'الاسم الكامل', email:'البريد الإلكتروني', phone:'رقم الجوال',
    city:'المدينة / الدولة', university:'الجامعة', major:'التخصص', experience:'سنوات الخبرة', languages:'اللغات', skills:'المهارات',
    resume:'السيرة الذاتية (PDF أو DOCX)', consent:'أوافق على معالجة بياناتي لغرض التوظيف وفق سياسة الخصوصية.',
    submit:'إرسال الطلب', sending:'جارٍ الإرسال…', required:'يرجى إكمال الحقول المطلوبة والموافقة على سياسة الخصوصية.',
    success:'تم استلام طلبك بنجاح.', failed:'تعذر إرسال الطلب. حاول مرة أخرى لاحقاً.',
    privacy:'تُحفظ السيرة الذاتية في مساحة خاصة ولا تكون متاحة للعامة.', type:'نوع الدوام', location:'الموقع',
    fulltime:'دوام كامل', parttime:'دوام جزئي', contract:'عقد', remote:'عن بُعد', hybrid:'هجين', onsite:'من مقر الشركة',
  },
  en: {
    eyebrow:'Join the Felsy team', title:'Build the future with us', intro:'Explore opportunities at Felsy and apply directly through our website.',
    openings:'Open positions', noJobs:'There are no published openings right now. Check back for future opportunities.',
    apply:'Apply for this role', general:'General application', name:'Full name', email:'Email address', phone:'Phone number',
    city:'City / Country', university:'University', major:'Major / Specialization', experience:'Years of experience', languages:'Languages', skills:'Skills',
    resume:'Resume (PDF or DOCX)', consent:'I agree to the processing of my data for recruitment under the Privacy Policy.',
    submit:'Submit application', sending:'Submitting…', required:'Complete the required fields and accept the privacy notice.',
    success:'Your application has been received.', failed:'Could not submit your application. Please try again later.',
    privacy:'Your resume is stored privately and is not publicly accessible.', type:'Employment type', location:'Location',
    fulltime:'Full-time', parttime:'Part-time', contract:'Contract', remote:'Remote', hybrid:'Hybrid', onsite:'On-site',
  }
};

export default function Careers() {
  const { lang } = useI18n();
  const t = copy[lang === 'en' ? 'en' : 'ar'];
  const [jobs,setJobs] = useState([]);
  const [jobId,setJobId] = useState('');
  const [form,setForm] = useState({full_name:'',email:'',phone:'',location:'',university:'',major:'',experience_years:'',languages:'',skills:''});
  const [resume,setResume] = useState(null);
  const [consent,setConsent] = useState(false);
  const [busy,setBusy] = useState(false);

  useEffect(() => {
    supabase.from('job_posts').select('id,slug,title,description,department,employment_type,workplace_type,location,created_at')
      .eq('status','published').order('created_at',{ascending:false})
      .then(({data,error}) => { if (!error) setJobs(data || []); });
  }, []);

  const update = e => setForm(v => ({...v,[e.target.name]:e.target.value}));
  async function submit(e) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim() || !consent) return toast.error(t.required);
    if (resume && (!['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(resume.type) || resume.size > 8*1024*1024)) {
      return toast.error(lang === 'en' ? 'Upload a PDF or DOCX file up to 8 MB.' : 'ارفع ملف PDF أو DOCX بحجم لا يتجاوز 8 ميجابايت.');
    }
    setBusy(true);
    try {
      let resumePath = null;
      const applicationId = crypto.randomUUID();
      if (resume) {
        const ext = resume.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx';
        resumePath = applicationId + '/resume.' + ext;
        const {error: uploadError} = await supabase.storage.from('job-resumes').upload(resumePath,resume,{upsert:false,contentType:resume.type});
        if (uploadError) throw uploadError;
      }
      const {error} = await supabase.from('job_applications').insert({
        id:applicationId,job_id:jobId || null,full_name:form.full_name.trim(),email:form.email.trim().toLowerCase(),
        phone:form.phone.trim() || null,location:form.location.trim() || null,university:form.university.trim() || null,
        major:form.major.trim() || null,experience_years:form.experience_years === '' ? null : Number(form.experience_years),
        languages:form.languages.split(',').map(x=>x.trim()).filter(Boolean),skills:form.skills.split(',').map(x=>x.trim()).filter(Boolean),
        resume_path:resumePath,privacy_consent:true
      });
      if (error) throw error;
      toast.success(t.success);
      setForm({full_name:'',email:'',phone:'',location:'',university:'',major:'',experience_years:'',languages:'',skills:''});
      setResume(null); setConsent(false); e.target.reset();
    } catch (err) { console.error('Career application failed',err); toast.error(t.failed); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-background text-foreground" dir={lang === 'en' ? 'ltr' : 'rtl'}>
    <section className="bg-gradient-to-br from-ink to-slate-800 px-5 pb-16 pt-28 text-white sm:px-8">
      <div className="mx-auto max-w-6xl"><p className="font-bold text-emerald-300">{t.eyebrow}</p>
        <h1 className="mt-3 text-4xl font-black sm:text-6xl">{t.title}</h1><p className="mt-4 max-w-2xl text-lg text-white/75">{t.intro}</p>
      </div>
    </section>
    <section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[.9fr_1.1fr]">
      <div><h2 className="text-2xl font-black">{t.openings}</h2><div className="mt-5 space-y-4">
        {jobs.length ? jobs.map(job=><article key={job.id} className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-xl font-bold">{job.title}</h3>{job.department && <p className="mt-1 text-sm text-muted-foreground">{job.department}</p>}
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
            {job.location && <span className="flex items-center gap-1"><MapPin size={15}/>{job.location}</span>}
            {job.employment_type && <span className="flex items-center gap-1"><Clock3 size={15}/>{job.employment_type}</span>}
          </div><p className="mt-3 whitespace-pre-line text-sm leading-7">{job.description}</p>
          <button onClick={()=>{setJobId(job.id);document.getElementById('career-form')?.scrollIntoView({behavior:'smooth'});}} className="mt-4 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground">{t.apply}</button>
        </article>) : <p className="rounded-2xl border border-dashed border-border p-6 text-muted-foreground">{t.noJobs}</p>}
      </div></div>
      <div id="career-form" className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <h2 className="text-2xl font-black">{t.apply}</h2>
        <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">{t.name} *<input required name="full_name" value={form.full_name} onChange={update} className="h-11 rounded-xl border border-input bg-background px-3"/></label>
          <label className="grid gap-1 text-sm font-semibold">{t.email} *<input required type="email" name="email" value={form.email} onChange={update} className="h-11 rounded-xl border border-input bg-background px-3"/></label>
          <label className="grid gap-1 text-sm font-semibold">{t.phone}<input name="phone" value={form.phone} onChange={update} className="h-11 rounded-xl border border-input bg-background px-3"/></label>
          <label className="grid gap-1 text-sm font-semibold">{t.city}<input name="location" value={form.location} onChange={update} className="h-11 rounded-xl border border-input bg-background px-3"/></label>
          <label className="grid gap-1 text-sm font-semibold">{t.university}<input name="university" value={form.university} onChange={update} className="h-11 rounded-xl border border-input bg-background px-3"/></label>
          <label className="grid gap-1 text-sm font-semibold">{t.major}<input name="major" value={form.major} onChange={update} className="h-11 rounded-xl border border-input bg-background px-3"/></label>
          <label className="grid gap-1 text-sm font-semibold">{t.experience}<input type="number" min="0" max="60" name="experience_years" value={form.experience_years} onChange={update} className="h-11 rounded-xl border border-input bg-background px-3"/></label>
          <label className="grid gap-1 text-sm font-semibold">{t.languages}<input name="languages" value={form.languages} onChange={update} placeholder="Arabic, English" className="h-11 rounded-xl border border-input bg-background px-3"/></label>
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t.skills}<input name="skills" value={form.skills} onChange={update} className="h-11 rounded-xl border border-input bg-background px-3"/></label>
          <label className="grid gap-2 text-sm font-semibold sm:col-span-2"><span className="flex items-center gap-2"><Upload size={16}/>{t.resume}</span><input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e=>setResume(e.target.files?.[0] || null)} className="block w-full text-sm"/></label>
          <p className="text-xs text-muted-foreground sm:col-span-2">{t.privacy}</p>
          <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1"/><span>{t.consent} <Link to="/privacy" className="underline">{lang==='en'?'Privacy Policy':'سياسة الخصوصية'}</Link></span></label>
          <button disabled={busy} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50 sm:col-span-2">{busy?t.sending:t.submit}<Send size={16}/></button>
        </form>
      </div>
    </section>
  </main>;
}
