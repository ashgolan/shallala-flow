// ════════════════════════════════════════════════════════════
//  PRICING — دالة موحّدة لحساب السعر مع الضريبة (מע"מ)
//  ✅ مصدر واحد لكل حسابات الأسعار في التطبيق (القراءات، التقارير،
//     لوحة التحكم، بوابة المزارع) بدل النسخ المكررة القديمة.
// ════════════════════════════════════════════════════════════

// نسبة الضريبة الافتراضية (משמשת فقط إن لم تكن محفوظة بعد في الإعدادات)
export const DEFAULT_VAT_RATE = 18; // %

/**
 * السعر الأساسي كما يُدخل في صفحة الأسعار (بدون ضريبة)
 * يحترم ترتيب الأولوية: أرض/قراءة > أرض عام > سنة/قراءة > سنة عام > عام
 */
export const getBasePrice = (prices, year, landId, idx) => {
  if (!prices) return 0;
  const lp = prices.landPrices?.[String(landId)];
  if (lp?.[`reading_${idx}`]) return parseFloat(lp[`reading_${idx}`]) || 0;
  if (lp?.default) return parseFloat(lp.default) || 0;
  const yp = prices.yearPrices?.[String(year)];
  if (yp?.[`reading_${idx}`]) return parseFloat(yp[`reading_${idx}`]) || 0;
  if (yp?.default) return parseFloat(yp.default) || 0;
  return parseFloat(prices?.globalPrice) || 0;
};

// نسبة الضريبة الحالية كنسبة عشرية (0.18 مثلاً) — تُقرأ من إعدادات الأسعار
export const getVatRate = (prices) => {
  const v = prices?.vatRate;
  return (v === undefined || v === null || v === '') ? DEFAULT_VAT_RATE / 100 : parseFloat(v) / 100;
};

/**
 * السعر شامل الضريبة (מע"מ) — هذا هو المستخدم في كل حسابات
 * القراءات/التقارير/لوحة التحكم/بوابة المزارع.
 */
export const getPrice = (prices, year, landId, idx) => {
  const base = getBasePrice(prices, year, landId, idx);
  return base * (1 + getVatRate(prices));
};