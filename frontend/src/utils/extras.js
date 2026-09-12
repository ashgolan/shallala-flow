import { getVatRate } from './pricing';

// ════════════════════════════════════════════════════════════
//  EXTRAS — دوال موحّدة لحساب "الإضافات" (LandExtra)
//  ✅ الإضافات صارت تابعة للأرض نفسها (landId) بدل ما كانت مخزّنة
//  جوا كل قراءة على حدة — فكل الدوال هون بتاخذ مباشرة "مصفوفة
//  إضافات" (مثل landExtrasByLand[landId]) بدل ما كانت تاخذ كائن
//  قراءة (reading) وتقرأ r.extras منه.
//
//  ✅ إضافة جديدة (بدون أي تغيير على الدوال القديمة): حساب "قبل/
//  بعد الضريبة" — للعرض فقط. المبلغ الفعلي المطلوب من المزارع
//  (amount / paid / getExtrasNet) يبقى كما هو تماماً بدون أي تغيير
//  — الضريبة هون رقم معلوماتي إضافي بس، محسوب حيّاً من نسبة
//  الضريبة العامة الحالية (prices.vatRate)، ما بيتخزن ولا بيأثر
//  على أي رصيد/مجموع موجود بالنظام.
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

/** مبلغ إضافة واحدة بعد الضريبة — للعرض فقط، لا يُستخدم بأي حساب رصيد/مجموع فعلي */
export const getExtraAfterTax = (amount, prices) =>
  (parseFloat(amount) || 0) * (1 + getVatRate(prices));

/**
 * إجمالي قبل/بعد الضريبة لمصفوفة إضافات — للعرض فقط (مثلاً إجمالي إضافات أرض
 * معيّنة بالنموذج). لا علاقة له بـ getExtrasNet/getExtrasGross المستخدمتين
 * بكل حسابات الرصيد/المدفوع الفعلية بالنظام — تلك تبقى كما هي بدون أي تغيير.
 */
export const getExtrasTaxTotals = (extras, prices) => {
  const beforeTax = getExtrasGross(extras);
  const afterTax  = beforeTax * (1 + getVatRate(prices));
  return { beforeTax, afterTax };
};