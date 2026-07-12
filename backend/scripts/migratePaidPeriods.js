require('dotenv').config();
const mongoose = require('mongoose');
const Reading  = require('../src/models/Reading');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ متصل بقاعدة البيانات');

    const readings = await Reading.find({});
    let updated = 0, skipped = 0;

    for (const r of readings) {
      const periodsCount = Math.max(0, (r.readings?.length || 1) - 1);

      // إذا already مهيّأة بنفس الطول الصحيح، تخطّاها
      if (Array.isArray(r.paidPeriods) && r.paidPeriods.length === periodsCount) {
        skipped++;
        continue;
      }

      // كل الفترات تاخذ نفس حالة paid القديمة كنقطة بداية منطقية
      const paidPeriods = new Array(periodsCount).fill(!!r.paid);
      r.paidPeriods = paidPeriods;
      r.markModified('paidPeriods');
      await r.save();
      updated++;
    }

    console.log(`✅ تم تحديث ${updated} قراءة — تم تجاوز ${skipped} (مهيّأة مسبقاً)`);
    process.exit(0);
  } catch (err) {
    console.error('❌ خطأ:', err.message);
    process.exit(1);
  }
})();