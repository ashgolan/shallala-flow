const archiver   = require('archiver');
const nodemailer = require('nodemailer');

const Farmer   = require('../models/Farmer');
const Land     = require('../models/Land');
const Reading  = require('../models/Reading');
const Payment  = require('../models/Payment');
const { Prices, Region } = require('../models/Settings');

const COLLECTIONS = [
  { name: 'farmers',  Model: Farmer  },
  { name: 'lands',    Model: Land    },
  { name: 'readings', Model: Reading },
  { name: 'payments', Model: Payment },
  { name: 'regions',  Model: Region  },
];

async function createBackupZip() {
  return new Promise(async (resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks  = [];
    archive.on('data',  c => chunks.push(c));
    archive.on('end',   () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    archive.append(JSON.stringify({
      createdAt: new Date().toISOString(),
      version: '1.0',
      app: 'الشلالة — נظام ניהול מים',
    }, null, 2), { name: 'meta.json' });

    for (const { name, Model } of COLLECTIONS) {
      const data = await Model.find().lean();
      archive.append(JSON.stringify(data, null, 2), { name: `${name}.json` });
    }

    const prices = await Prices.findOne({ key: 'prices' }).lean();
    archive.append(JSON.stringify(prices || {}, null, 2), { name: 'prices.json' });

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
    const zipBuffer = await createBackupZip();

    const date = new Date().toLocaleDateString('he-IL', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Jerusalem',
    });

    const counts = {};
    for (const { name, Model } of COLLECTIONS) {
      counts[name] = await Model.countDocuments();
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.BACKUP_EMAIL_USER,
        pass: process.env.BACKUP_EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"🌿 אלשללאלה — גיבוי" <${process.env.BACKUP_EMAIL_USER}>`,
      to:   process.env.BACKUP_EMAIL_TO || process.env.BACKUP_EMAIL_USER,
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
                  <td style="padding:8px 4px;text-align:right;font-weight:700;color:#14532d;">${count}</td>
                </tr>
              `).join('')}
            </table>
            <p style="color:#9ca3af;font-size:12px;margin:12px 0 0;text-align:center;">
              גודל הגיבוי: ${(zipBuffer.length / 1024).toFixed(1)} KB
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

module.exports = { createBackupZip, sendBackupEmail };
