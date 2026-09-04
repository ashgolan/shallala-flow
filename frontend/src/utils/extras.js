// ════════════════════════════════════════════════════════════
//  EXTRAS — دوال موحّدة لحساب "الإضافات" (LandExtra)
//  ✅ الإضافات صارت تابعة للأرض نفسها (landId) بدل ما كانت مخزّنة
//  جوا كل قراءة على حدة — فكل الدوال هون بتاخذ مباشرة "مصفوفة
//  إضافات" (مثل landExtrasByLand[landId]) بدل ما كانت تاخذ كائن
//  قراءة (reading) وتقرأ r.extras منه.
// ════════════════════════════════════════════════════════════

/** يرجّع نفس المصفوفة (أو [] لو فاضية/غير موجودة) — للراحة عند الاستدعاء */
export const getExtrasList = (extras) => extras || [];

/** إجمالي المبلغ الصافي المتبقي (المبلغ - المدفوع) لمصفوفة إضافات */
export const getExtrasNet = (extras) =>
  (extras || []).reduce((s, e) => s + (parseFloat(e.amount) || 0) - (parseFloat(e.paid) || 0), 0);

/** إجمالي المبلغ الكامل (بدون خصم المدفوع) لمصفوفة إضافات */
export const getExtrasGross = (extras) =>
  (extras || []).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

/** يبني خريطة landId -> [extras] من مصفوفة إضافات مسطّحة (نتيجة adminAPI.getLandExtras) */
export const groupExtrasByLand = (extrasFlat) => {
  const map = {};
  (extrasFlat || []).forEach(e => {
    const key = String(e.landId);
    if (!map[key]) map[key] = [];
    map[key].push(e);
  });
  return map;
};