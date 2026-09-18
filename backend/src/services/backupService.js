const fs       = require('fs');
const path     = require('path');
const archiver   = require('archiver');
const nodemailer = require('nodemailer');
const mongoose    = require('mongoose');

// ✅ (2026-09-18) — النسخة الاحتياطية صارت ديناميكية بالكامل: بدل لائحة موديلز
// ثابتة كنا لازم نحدّثها يدوياً كل ما نضيف/نمسح موديل (وهاد بالضبط سبب نسيان
// LandExtra و ExtraCatalogItem و Task من النسخ الاحتياطية السابقة رغم إنهم
// موديلز فعلية بقاعدة البيانات)، هلأ منحمّل كل ملفات مجلد models/ تلقائياً،
// وبعدين مناخد كل الموديلز المسجّلة فعلياً بـmongoose. أي موديل جديد بالمستقبل
// (أو أي موديل نمسحه) بينعكس هون أوتوماتيكياً بدون ما نلمس هالملف نهائياً.
const MODELS_DIR = path.join(__dirname, '..', 'models');
fs.readdirSync(MODELS_DIR)
  .filter(f => f.endsWith('.js'))
  .forEach(f => require(path.join(MODELS_DIR, f)));

// ✅ بعض الملفات (زي Settings.js) بتصدّر أكتر من موديل بملف واحد (Prices,
// Announcement, Gallery, Video, Admin, Region, Privileged) — بما إنو كل واحد
// فيهم مسجَّل بـmongoose.model() لحاله، بيطلع هون تلقائياً بدون أي معاملة خاصة.
// اسم الملف جوا الـZIP = اسم الـcollection الفعلي بقاعدة البيانات (زي
// settings_prices, settings_admin, regions...) — نفس الأسماء المعتادة تماماً.
function getAllCollections() {
  return mongoose.modelNames()
    .map(name => {
      const Model = mongoose.model(name);
      return { name: Model.collection.name, Model };
    })
    // ترتيب أبجدي بس حتى تبقى لائحة الملفات جوا الـZIP ثابتة ومرتبة
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function createBackupZip() {
  return new Promise(async (resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks  = [];
    archive.on('data',  c => chunks.push(c));
    archive.on('end',   () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    const collections = getAllCollections();

    // ملف meta
    archive.append(JSON.stringify({
      createdAt: new Date().toISOString(),
      version: '3.0',
      app: 'الشلالة — מערכת ניהול מים',
      // ✅ لائحة كل الـcollections يلي انأخذلها نسخة هالمرة — مفيدة للتأكد
      // لاحقاً إنه ما في موديل ناقص، بدل ما نتفاجئ زي المرة السابقة.
      collections: collections.map(c => c.name),
    }, null, 2), { name: 'meta.json' });

    // ✅ كل الموديلز المسجّلة — تلقائياً، بدون لائحة يدوية
    for (const { name, Model } of collections) {
      try {
        const data = await Model.find().lean();
        archive.append(JSON.stringify(data, null, 2), { name: `${name}.json` });
      } catch (e) {
        archive.append(JSON.stringify({ error: e.message }), { name: `${name}.json` });
      }
    }

    archive.finalize();
  });
}

async function sendBackupEmail() {
  try {
    if (!process.env.BACKUP_EMAIL_USER || !process.env.BACKUP_EMAIL_PASS) {
      console.log('⚠️  Backup email not configured — skipping');
      return false;
    }

    console.log('📦 Creating backup ZIP...');
    const collections = getAllCollections();
    const zipBuffer = await createBackupZip();

    const date = new Date().toLocaleDateString('he-IL', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Jerusalem',
    });

    // إحصائيات لكل موديل — نفس اللائحة الديناميكية
    const counts = {};
    for (const { name, Model } of collections) {
      try { counts[name] = await Model.countDocuments(); }
      catch { counts[name] = '—'; }
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.BACKUP_EMAIL_USER,
        pass: process.env.BACKUP_EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from:    `"🌿 אלשללאלה — גיבוי" <${process.env.BACKUP_EMAIL_USER}>`,
      to:      process.env.BACKUP_EMAIL_TO || process.env.BACKUP_EMAIL_USER,
      subject: `💾 גיבוי אוטומטי — אלשללאלה | ${date}`,
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
          <div style="text-align:center;background:linear-gradient(135deg,#14532d,#166534);border-radius:12px;padding:20px;margin-bottom:20px;">
            <h1 style="color:#fff;margin:0;font-size:24px;">🌿 אלשללאלה</h1>
            <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:4px 0 0;">מערכת ניהול מים חקלאיים</p>
          </div>
          <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:16px;">
            <h2 style="color:#14532d;margin:0 0 12px;">💾 גיבוי אוטומטי לילי</h2>
            <p style="color:#374151;margin:0;font-size:14px;">📅 תאריך: <strong>${date}</strong></p>
          </div>
          <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:16px;">
            <h3 style="color:#374151;margin:0 0 12px;font-size:15px;">📊 סיכום הנתונים</h3>
            <table style="width:100%;border-collapse:collapse;">
              ${Object.entries(counts).map(([name, count]) => `
                <tr style="border-bottom:1px solid #f3f4f6;">
                  <td style="padding:8px 4px;color:#6b7280;font-size:13px;">${name}</td>
                  <td style="padding:8px 4px;text-align:left;font-weight:700;color:#14532d;">${count}</td>
                </tr>
              `).join('')}
            </table>
            <p style="color:#9ca3af;font-size:12px;margin:12px 0 0;text-align:center;">
              גודל הגיבוי: ${(zipBuffer.length / 1024).toFixed(1)} KB
            </p>
          </div>
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;margin-bottom:16px;">
            <p style="color:#c2410c;font-size:12px;margin:0;">
              📁 הגיבוי כולל את כל ${collections.length} האוספים (collections) במערכת — מתעדכן אוטומטית בכל שינוי במודלים, בלי צורך לגעת בקוד הגיבוי
            </p>
          </div>
          <p style="color:#9ca3af;font-size:11px;text-align:center;">
            גיבוי אוטומטי יומי — אלשללאלה 🌿
          </p>
        </div>
      `,
      attachments: [{
        filename:    `alshallala-backup-${new Date().toISOString().split('T')[0]}.zip`,
        content:     zipBuffer,
        contentType: 'application/zip',
      }],
    });

    console.log(`✅ Backup email sent → ${process.env.BACKUP_EMAIL_TO || process.env.BACKUP_EMAIL_USER}`);
    return true;
  } catch (err) {
    console.error('❌ Backup failed:', err.message);
    return false;
  }
}

module.exports = { createBackupZip, sendBackupEmail, getAllCollections };