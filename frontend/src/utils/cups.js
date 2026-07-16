// ════════════════════════════════════════════════════════════
//  CUPS — دالة موحّدة لحساب فرق الأكواب بين قراءتين متتاليتين
//  ✅ مصدر واحد لكل حسابات الاستهلاك في التطبيق (القراءات، لوحة
//     التحكم، التقارير، بوابة المزارع) بدل النسخ المتفرقة القديمة
//     التي كانت تتعامل مع القيم الناقصة/الصفرية بشكل مختلف بين
//     صفحة وأخرى، مما كان يسبب اختلاف الإجماليات.
//
//  ✅ دعم تبديل العداد: عند تبديل عداد أثناء فترة معينة، يُدمج
//     استهلاك العداد القديم (حتى إغلاقه) + العداد الجديد (من بدايته)
//     ضمن نفس رقم الفترة تماماً — بدون خلق فترة جديدة منفصلة، وبدون
//     أي انزياح في ترقيم الفترات أو شرائح تسعيرها.
// ════════════════════════════════════════════════════════════

// ✅ يبحث عن تبديل عداد مسجّل لفترة معينة (إن وُجد)
export const getMeterChange = (meterChanges, i) =>
  (Array.isArray(meterChanges) ? meterChanges.find(m => m && m.period === i) : null) || null;

/**
 * الفرق (عدد الأكواب) بين القراءة رقم i والقراءة رقم i+1
 * يرجع null فقط إذا:
 *  - القيمة غير مُدخلة أصلاً (null / '' / undefined)
 *  - الفترة معلّمة بتبديل عداد لكنه ناقص البيانات (oldFinal/newInitial غير رقميين)
 * القيمة 0 تُعتبر قراءة صحيحة وفعلية دائماً — وليست علامة على "لم تُؤخذ بعد".
 *
 * إذا كانت هذه الفترة فيها تبديل عداد مسجّل:
 *   الاستهلاك = (oldFinal - readings[i]) + (readings[i+1] - newInitial)
 * أي: إغلاق العداد القديم ناقص القراءة السابقة، زائد القراءة الحالية ناقص بداية العداد الجديد.
 *
 * ملاحظة: إذا نتج فرق سالب (خطأ إدخال أو شذوذ)، تُترك القيمة كما هي (سالبة)
 * ليتم عرضها بالتحذير الأحمر ⚠️ بالواجهة — بدل إخفائها.
 */
export const cupsDiff = (readings, i, meterChanges = []) => {
  if (!readings) return null;
  const a = readings[i];
  const b = readings[i + 1];
  if (a == null || a === '' || b == null || b === '') return null;
  const fa = parseFloat(a);
  const fb = parseFloat(b);
  if (isNaN(fa) || isNaN(fb)) return null;

  const change = getMeterChange(meterChanges, i);
  if (change) {
    const oldFinal   = parseFloat(change.oldFinal);
    const newInitial = parseFloat(change.newInitial);
    if (isNaN(oldFinal) || isNaN(newInitial)) return null; // بيانات التبديل غير مكتملة بعد
    return (oldFinal - fa) + (fb - newInitial);
  }
  return fb - fa;
};

/**
 * نفس cupsDiff لكن للاستخدام في المجاميع/الإجماليات فقط:
 * لو الفرق سالب (خطأ إدخال أو شذوذ) تُحسب كـ 0 بدل طرحها من الإجمالي.
 */
export const cupsPositive = (readings, i, meterChanges = []) => {
  const c = cupsDiff(readings, i, meterChanges);
  return (c && c > 0) ? c : 0;
};

/**
 * إجمالي الأكواب لقراءة واحدة (مصفوفة readings كاملة)
 */
export const totalCupsForReading = (readings, meterChanges = []) => {
  if (!readings || readings.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < readings.length - 1; i++) {
    total += cupsPositive(readings, i, meterChanges);
  }
  return total;
};