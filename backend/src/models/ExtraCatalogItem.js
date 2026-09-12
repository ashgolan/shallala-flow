const mongoose = require('mongoose');

// ════════════════════════════════════════════════════════════
//  ExtraCatalogItem — عنصر بمخزن "الإضافات" (اسم + سعر افتراضي)
//  ✅ الفكرة: قائمة موحّدة لأسماء/أسعار الإضافات المتكررة (اشتراك
//  خط مياه، رسوم تجهيزات...) بدل كتابة الاسم والسعر يدوياً كل مرة.
//  عند إضافة "إضافة" لأرض معيّنة يقدر المستخدم يختار من هالقائمة
//  فيتعبّى السعر تلقائياً، مع خيار تغييره لمرة وحدة بدون ما يمس
//  السعر الافتراضي هون، أو تحديث السعر هون بشكل دائم بدل هيك.
// ════════════════════════════════════════════════════════════
const extraCatalogItemSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true, unique: true }, // اسم الإضافة
  defaultPrice: { type: Number, default: 0 },     // السعر الافتراضي (قبل الضريبة)
  active:       { type: Boolean, default: true }, // تعطيل بدل حذف — حتى ما تختفي من إضافات قديمة مرتبطة فيه
}, {
  timestamps: true,
  collection: 'extra_catalog_items',
});

module.exports = mongoose.model('ExtraCatalogItem', extraCatalogItemSchema);