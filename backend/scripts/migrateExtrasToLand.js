// ✅ نحدد مسار .env بالنسبة لمكان هذا الملف (backend/.env) صراحة — مش بالنسبة لمجلد
// التشغيل الحالي (cwd). هيك السكربت بيشتغل صح سواء شغّلته من جوا backend أو من جذر
// المشروع (مثلاً: node backend/scripts/migrateExtrasToLand.js من المجلد الرئيسي)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs        = require('fs');
const path      = require('path');
const mongoose  = require('mongoose');
const Reading   = require('../src/models/Reading');
const LandExtra = require('../src/models/LandExtra');
const Land      = require('../src/models/Land');
const Farmer    = require('../src/models/Farmer');

// ════════════════════════════════════════════════════════════
//  migrateExtrasToLand.js
//  ينقل كل الإضافات الموجودة حالياً جوا مستندات Reading (extras[]
//  الجديدة + الحقول القديمة extra/extraPaid/extraNote) إلى كولكشن
//  LandExtra المستقل الجديد، مربوطة بالأرض (landId) فقط.
//
//  ⚠️ وضع افتراضي = "معاينة فقط" (dry-run): يطبع تقرير بكل شي رح
//  يُنقل بدون ما يكتب أي شي بقاعدة البيانات. شغّله عادي أول مرة
//  وراجع التقرير، وبالذات سطر "⚠️ تكرار محتمل" (نفس السبب+المبلغ
//  مكرر على نفس الأرض عبر أكثر من سنة — ممكن يكون كان طريقة المستخدم
//  القديمة لإعادة تسجيل نفس الاشتراك كل سنة، ونقلها زي ما هي بيضاعف
//  المبلغ المطلوب فعلياً).
//
//  بعد ما تتأكد التقرير سليم:
//    node scripts/migrateExtrasToLand.js --apply
//  هيك بينفّذ فعلياً: بينشئ سجلات LandExtra، وبعدين يفرّغ extras
//  (وextra/extraPaid/extraNote) من كل قراءة نُقلت بنجاح.
// ════════════════════════════════════════════════════════════

const APPLY = process.argv.includes('--apply');

(async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ ما لقيت MONGODB_URI. تأكد إنه موجود بملف backend/.env');
      process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ متصل بقاعدة البيانات — الوضع: ${APPLY ? 'تنفيذ فعلي (--apply)' : 'معاينة فقط (dry-run)'}`);

    const readings = await Reading.find({}).sort({ landId: 1, year: 1 });

    // ✅ نجيب كل الأراضي والمزارعين مرة وحدة، ونبني خرائط بحث سريعة — عشان نقدر
    // نعرض بالتقرير رقم المحطة واسم المزارع بدل الـ landId المجرّد (أسهل بكتير
    // للمستخدم يروح يتأكد بالتطبيق إذا التكرار صحيح ولا لأ)
    const [allLands, allFarmers] = await Promise.all([Land.find({}).lean(), Farmer.find({}).lean()]);
    const landById   = {};   allLands.forEach(l => { landById[l._id.toString()] = l; });
    const farmerById = {};   allFarmers.forEach(f => { farmerById[f._id.toString()] = f; });
    const landInfo = (landId) => {
      const land = landById[landId];
      if (!land) return { stationNumber: '—', landLabel: '—', farmerName: '—' };
      const farmer = land.farmerId ? farmerById[land.farmerId.toString()] : null;
      return {
        stationNumber: land.stationNumber || '—',
        landLabel:     land.nameHeb || land.name || land.stationNumber || '—',
        farmerName:    farmer ? (farmer.nameHeb || farmer.name || '—') : 'بدون مزارع مرتبط',
      };
    };

    // ✅ نجمع كل الإضافات المرشّحة للنقل حسب الأرض، لنكتشف التكرار المحتمل قبل الكتابة
    const byLand = {}; // landId -> [{ note, amount, paid, fromReadingId, year }]
    let scannedReadings = 0, readingsWithExtras = 0;

    for (const r of readings) {
      scannedReadings++;
      const items = [];

      (r.extras || []).forEach(e => {
        if ((e.note && e.note.trim()) || (parseFloat(e.amount) || 0) > 0) {
          items.push({ note: e.note || '', amount: parseFloat(e.amount) || 0, paid: parseFloat(e.paid) || 0 });
        }
      });

      // الحقل القديم — فقط لو ما في extras[] جديدة أصلاً (نفس منطق getExtrasList بالفرونت)
      if ((r.extras || []).length === 0) {
        const legacyAmount = parseFloat(r.extra) || 0;
        if (legacyAmount > 0) {
          items.push({ note: r.extraNote || '', amount: legacyAmount, paid: parseFloat(r.extraPaid) || 0 });
        }
      }

      if (items.length === 0) continue;
      readingsWithExtras++;

      const key = r.landId.toString();
      if (!byLand[key]) byLand[key] = [];
      items.forEach(it => byLand[key].push({ ...it, fromReadingId: r._id.toString(), year: r.year }));
    }

    // ✅ تقرير التكرار المحتمل: نفس (سبب+مبلغ) موجود أكثر من مرة على نفس الأرض
    // (بالإضافة للطباعة بالتيرمينال، منبني نفس التقرير كـ JSON ونكتبه لملف — لأن
    // كتير تيرمينالات ويندوز (git-bash/MINGW64) بتخربط ترتيب النص العربي RTL،
    // فبيصير أوضح تفتح الملف بمحرر متل VS Code)
    let duplicateGroups = 0, duplicateItems = 0;
    const duplicatesReport = []; // [{ landId, years, groups: [{note, amount, count}] }]
    console.log('\n──── تقرير المعاينة ────');
    for (const [landId, items] of Object.entries(byLand)) {
      const dupKey = {};
      items.forEach(it => {
        const k = `${it.note.trim().toLowerCase()}__${it.amount}`;
        dupKey[k] = (dupKey[k] || 0) + 1;
      });
      const dups = Object.entries(dupKey).filter(([, c]) => c > 1);
      if (dups.length > 0) {
        duplicateGroups += dups.length;
        dups.forEach(([k, c]) => { duplicateItems += c; });
        const yearsList = items.map(it => it.year).join(', ');
        const info = landInfo(landId);
        console.log(`⚠️  تكرار محتمل — المحطة ${info.stationNumber} (${info.landLabel}) — المزارع: ${info.farmerName} — سنوات القراءات: [${yearsList}]`);
        const groups = dups.map(([k, c]) => {
          const [note, amount] = k.split('__');
          console.log(`    "${note || '(بدون سبب)'}" — ₪${amount} — مكرر ${c} مرات`);
          return { note: note || '', amount: parseFloat(amount) || 0, count: c };
        });
        duplicatesReport.push({
          landId, stationNumber: info.stationNumber, landLabel: info.landLabel, farmerName: info.farmerName,
          years: items.map(it => it.year), groups,
        });
      }
    }
    if (duplicateGroups === 0) console.log('✅ ما في أي تكرار محتمل واضح — كل الإضافات فريدة على مستوى الأرض.');

    // ✅ جدول ملخّص مختصر مرتّب حسب رقم المحطة — سطر واحد لكل حالة تكرار، أسهل
    // للمسح السريع والذهاب تتأكد بالتطبيق (متل ما طلب المستخدم)
    if (duplicatesReport.length > 0) {
      console.log('\n──── ملخص سريع (مرتّب حسب رقم المحطة) ────');
      const sorted = [...duplicatesReport].sort((a,b) => (a.stationNumber||'').localeCompare(b.stationNumber||''));
      sorted.forEach(d => {
        d.groups.forEach(g => {
          console.log(`  📍 ${d.stationNumber}  |  👤 ${d.farmerName}  |  "${g.note || '(بدون سبب)'}"  |  ₪${g.amount}  ×${g.count}`);
        });
      });
    }

    const totalItems = Object.values(byLand).reduce((s, arr) => s + arr.length, 0);
    const landsCount  = Object.keys(byLand).length;
    console.log(`\nملخص: ${scannedReadings} قراءة مفحوصة — ${readingsWithExtras} فيها إضافات — ${totalItems} إضافة رح تُنقل لـ ${landsCount} أرض.`);
    if (duplicateGroups > 0) {
      console.log(`⚠️  ${duplicateGroups} حالة تكرار محتمل (${duplicateItems} سجل) — راجعها قبل --apply. النقل هلق (dry-run) ما لمس أي شي.`);
    }

    // ✅ نكتب نفس التقرير كملف JSON — أسهل بكتير للمراجعة من التيرمينال (خصوصاً مع
    // مشاكل عرض النص العربي بـ git-bash على ويندوز)
    const reportPath = path.resolve(__dirname, 'migration-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      scannedReadings, readingsWithExtras, totalItems, landsCount,
      duplicateGroups, duplicateItems,
      duplicates: duplicatesReport,
      allItemsByLand: byLand, // كل الإضافات المرشّحة للنقل، مجمّعة حسب الأرض (للمراجعة الكاملة إذا حبيت)
    }, null, 2), 'utf8');
    console.log(`\n📄 نفس التقرير محفوظ كملف (أوضح للقراءة): ${reportPath}`);

    if (!APPLY) {
      console.log('\nℹ️  هذا كان تشغيل معاينة فقط. ما تغيّر أي شي بقاعدة البيانات.');
      console.log('    لما تتأكد التقرير سليم: node scripts/migrateExtrasToLand.js --apply');
      process.exit(0);
    }

    // ════════ تنفيذ فعلي ════════
    let created = 0, migratedReadings = 0;
    for (const r of readings) {
      const items = [];
      (r.extras || []).forEach(e => {
        if ((e.note && e.note.trim()) || (parseFloat(e.amount) || 0) > 0) {
          items.push({ note: e.note || '', amount: parseFloat(e.amount) || 0, paid: parseFloat(e.paid) || 0 });
        }
      });
      if ((r.extras || []).length === 0) {
        const legacyAmount = parseFloat(r.extra) || 0;
        if (legacyAmount > 0) {
          items.push({ note: r.extraNote || '', amount: legacyAmount, paid: parseFloat(r.extraPaid) || 0 });
        }
      }
      if (items.length === 0) continue;

      for (const item of items) {
        await LandExtra.create({ landId: r.landId, note: item.note, amount: item.amount, paid: item.paid });
        created++;
      }

      // ✅ نفرّغ الإضافات من القراءة بعد نقلها بنجاح — الواجهة ما عادت تقرأها من هون
      r.extras = [];
      r.extra = 0; r.extraPaid = 0; r.extraNote = '';
      r.markModified('extras');
      await r.save();
      migratedReadings++;
    }

    console.log(`\n✅ تم النقل فعلياً: ${created} إضافة من ${migratedReadings} قراءة.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ خطأ:', err.message);
    process.exit(1);
  }
})();