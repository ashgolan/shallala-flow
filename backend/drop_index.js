require('dotenv').config();
const mongoose = require('mongoose');

// نضيف اسم الـ database في الرابط
const uri = process.env.MONGODB_URI.replace(
  '/?appName=',
  '/alshallala?appName='
);

mongoose.connect(uri).then(async () => {
  console.log('Connected to:', mongoose.connection.db.databaseName);
  try {
    await mongoose.connection.db.collection('readings').dropIndex('landId_1_year_1');
    console.log('✅ Index dropped!');
  } catch(e) {
    console.log('Index not found or already dropped:', e.message);
  }
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
