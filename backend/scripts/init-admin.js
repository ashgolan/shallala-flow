/**
 * تشغيل مرة واحدة لإعداد كلمة مرور الإدارة
 * node scripts/init-admin.js YOUR_PASSWORD
 */
require('dotenv').config();
const connectDB = require('../config/database');
const { Admin } = require('../src/models/Settings');

const ADMIN_PASSWORD = process.argv[2];
if (!ADMIN_PASSWORD) { console.error('Usage: node scripts/init-admin.js YOUR_PASSWORD'); process.exit(1); }

async function init() {
  await connectDB();
  await Admin.findOneAndUpdate({ key: 'admin' }, { password: ADMIN_PASSWORD }, { upsert: true });
  console.log('✅ Admin password set successfully!');
  process.exit(0);
}
init().catch(e => { console.error(e); process.exit(1); });
