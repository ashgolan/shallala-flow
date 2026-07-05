import { useRef, useState, useEffect } from 'react';

// ✅ قياس عرض العنصر يدوياً (بدل الاعتماد على قياس Recharts الداخلي عبر
// ResponsiveContainer، اللي تبيّن إنه غير موثوق على بعض المتصفحات/الأجهزة).
// نراقب: تغيّر حجم فعلي (ResizeObserver) + تغيير اتجاه الجهاز + تغيير حجم
// النافذة، بالإضافة لقياس فوري متكرر لأول ثانيتين كشبكة أمان.
//
// ⚠️ مهم: يجب استدعاء هذا الـ hook داخل مكوّن مستقل يُركَّب فعلياً في نفس
// لحظة ظهور الرسم البياني (وليس في المكوّن الأب العام) — وإلا فالقياس
// يحصل مرة واحدة فقط عند تحميل الصفحة الأب، وقد يفشل إذا لم تكن حاوية
// الرسم موجودة بالـ DOM في تلك اللحظة بالضبط (نفس الخطأ اللي وقعنا فيه
// أول مرة بلوحة المزارع).
export default function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth;
      if (w > 0) setWidth(w);
    };
    measure();
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    const timers = [100,300,600,1000,1500,2000].map(ms => setTimeout(measure, ms));
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      timers.forEach(clearTimeout);
    };
  }, []);
  return [ref, width];
}