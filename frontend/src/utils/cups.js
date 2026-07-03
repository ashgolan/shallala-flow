// ════════════════════════════════════════════════════════════
//  CUPS — دالة موحّدة لحساب فرق الأكواب بين قراءتين متتاليتين
//  ✅ مصدر واحد لكل حسابات الاستهلاك في التطبيق (القراءات، لوحة
//     التحكم، التقارير، بوابة المزارع) بدل النسخ المتفرقة القديمة
//     التي كانت تتعامل مع القيم الناقصة/الصفرية بشكل مختلف بين
//     صفحة وأخرى، مما كان يسبب اختلاف الإجماليات.
// ════════════════════════════════════════════════════════════

/**
 * الفرق (عدد الأكواب) بين القراءة رقم i والقراءة رقم i+1
 * يرجع null إذا كانت القيمة غير مأخوذة بعد (وليس 0، لأن 0 قيمة صحيحة)
 * يستثني حالة "إعادة تصفير العداد" (القراءة الحالية = 0 والسابقة > 0)
 */
export const cupsDiff = (readings, i) => {
  if (!readings) return null;
  const a = readings[i];
  const b = readings[i + 1];
  if (a == null || a === '' || b == null || b === '') return null;
  const fa = parseFloat(a);
  const fb = parseFloat(b);
  if (isNaN(fa) || isNaN(fb)) return null;
  if (fb === 0 && fa > 0) return null; // إعادة تصفير العداد — تُستثنى
  return fb - fa;
};

/**
 * نفس cupsDiff لكن للاستخدام في المجاميع/الإجماليات فقط:
 * لو الفرق سالب (خطأ إدخال أو شذوذ لم يُلتقط كـ"إعادة تصفير") تُحسب كـ 0
 * بدل طرحها من الإجمالي. القيمة الخام (السالبة) تبقى تُعرض في كل خلية
 * على حدة (بالأحمر) للتنبيه، لكنها لا تُدرَج في أي مجموع/إجمالي.
 */
export const cupsPositive = (readings, i) => {
  const c = cupsDiff(readings, i);
  return (c && c > 0) ? c : 0;
};

/**
 * إجمالي الأكواب لقراءة واحدة (مصفوفة readings كاملة)
 */
export const totalCupsForReading = (readings) => {
  if (!readings || readings.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < readings.length - 1; i++) {
    total += cupsPositive(readings, i);
  }
  return total;
};