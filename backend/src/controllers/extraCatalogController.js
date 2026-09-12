const ExtraCatalogItem = require('../models/ExtraCatalogItem');

// ════════════════════════════════════════════════════════════
//  extraCatalogController — CRUD لمخزن الإضافات (ExtraCatalogItem)
//  ✅ نفس نمط landExtraController.js: كولكشن مستقل بأسماء/أسعار
//  الإضافات الجاهزة، يُستخدم لتعبئة السعر المقترح تلقائياً عند
//  إضافة LandExtra جديدة لأرض معيّنة.
// ════════════════════════════════════════════════════════════

const serialize = (i) => ({
  id:           i._id.toString(),
  name:         i.name || '',
  defaultPrice: i.defaultPrice || 0,
  active:       i.active !== false,
  createdAt:    i.createdAt,
  updatedAt:    i.updatedAt,
});

// GET /admin/extra-catalog — يرجع كل العناصر (بما فيها المعطّلة)، الفلترة/الإخفاء بالواجهة
const getExtraCatalog = async (req, res) => {
  try {
    const items = await ExtraCatalogItem.find({}).sort({ name: 1 }).lean();
    return res.json({ items: items.map(i => serialize(i)) });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// POST /admin/extra-catalog   { name, defaultPrice }
const createExtraCatalogItem = async (req, res) => {
  try {
    const { name, defaultPrice } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'اسم الإضافة مطلوب' });

    const exists = await ExtraCatalogItem.findOne({ name: name.trim() }).lean();
    if (exists) return res.status(409).json({ error: 'يوجد عنصر بنفس الاسم بالمخزن' });

    const item = await ExtraCatalogItem.create({
      name: name.trim(),
      defaultPrice: parseFloat(defaultPrice) || 0,
    });
    return res.status(201).json({ success: true, id: item._id.toString() });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم: ' + err.message }); }
};

// PUT /admin/extra-catalog/:itemId   { name?, defaultPrice?, active? }
// ✅ هاي هي نقطة "تحديث سعر المخزن بشكل دائم" — أي تعديل هون ينعكس على كل الإضافات الجديدة
// الجاية فقط (اقتراح السعر)، وما يلمس أي LandExtra موجود مسبقاً (كل سجل محتفظ بمبلغه الخاص).
const updateExtraCatalogItem = async (req, res) => {
  try {
    const { name, defaultPrice, active } = req.body;
    const patch = {};
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'اسم الإضافة مطلوب' });
      patch.name = name.trim();
    }
    if (defaultPrice !== undefined) patch.defaultPrice = parseFloat(defaultPrice) || 0;
    if (active !== undefined) patch.active = !!active;

    const updated = await ExtraCatalogItem.findByIdAndUpdate(req.params.itemId, patch, { new: true });
    if (!updated) return res.status(404).json({ error: 'غير موجود' });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// DELETE /admin/extra-catalog/:itemId
// ✅ ملاحظة: الأفضل استخدام { active: false } عبر PUT بدل الحذف الفعلي إن كان العنصر
// مرتبط بإضافات قديمة (LandExtra.catalogItemId) — بس بنسيب زر الحذف الفعلي متاح لعناصر
// أُضيفت بالغلط ومالها أي استخدام.
const deleteExtraCatalogItem = async (req, res) => {
  try {
    await ExtraCatalogItem.findByIdAndDelete(req.params.itemId);
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

module.exports = { getExtraCatalog, createExtraCatalogItem, updateExtraCatalogItem, deleteExtraCatalogItem };