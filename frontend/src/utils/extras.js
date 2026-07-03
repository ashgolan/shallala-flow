// ════════════════════════════════════════════════════════════
//  EXTRAS — دالة موحّدة لحساب "الإضافات" لكل قراءة
//  ✅ مصدر واحد يدعم الصيغة الجديدة extras:[{note,amount,paid}]
//     والصيغة القديمة (extra/extraPaid/extraNote) معاً، بدل
//     نسخ متفرقة كان بعضها يقرأ الصيغة القديمة فقط ويتجاهل
//     الإضافات المتعددة الجديدة — ما كان يسبب نقص في الإجماليات.
// ════════════════════════════════════════════════════════════

/**
 * قائمة كل الإضافات لقراءة واحدة (تدعم الصيغتين)
 */
export const getExtrasList = (r) => {
  const extras = r?.extras || [];
  if (extras.length > 0) return extras;
  const legacyExtra = parseFloat(r?.extra) || 0;
  if (legacyExtra > 0) return [{ note: r?.extraNote || '', amount: legacyExtra, paid: parseFloat(r?.extraPaid) || 0 }];
  return [];
};

/** إجمالي المبلغ الصافي المتبقي (المبلغ - المدفوع) لكل الإضافات في قراءة واحدة */
export const getExtrasNet = (r) =>
  getExtrasList(r).reduce((s, e) => s + (parseFloat(e.amount) || 0) - (parseFloat(e.paid) || 0), 0);

/** إجمالي المبلغ الكامل (بدون خصم المدفوع) لكل الإضافات في قراءة واحدة */
export const getExtrasGross = (r) =>
  getExtrasList(r).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);