const mongoose = require('mongoose');

const pricesSchema = new mongoose.Schema({
  key:         { type: String, default: 'prices', unique: true },
  globalPrice: { type: Number, default: 0 },
  yearPrices:  { type: mongoose.Schema.Types.Mixed, default: {} },
  landPrices:  { type: mongoose.Schema.Types.Mixed, default: {} },
  vatRate:     { type: Number, default: 18 }, // ✅ نسبة الضريبة (מע"מ) %
}, { collection: 'settings_prices', timestamps: true });

const announcementSchema = new mongoose.Schema({
  key:  { type: String, default: 'announcement', unique: true },
  text: { type: String, default: '' },
}, { collection: 'settings_announcement', timestamps: true });

const gallerySchema = new mongoose.Schema({
  key:    { type: String, default: 'gallery', unique: true },
  images: [{
    url:        String,
    caption:    { type: String, default: '' },
    path:       String,
    uploadedAt: String,
  }],
}, { collection: 'settings_gallery', timestamps: true });

const videoSchema = new mongoose.Schema({
  key:     { type: String, default: 'video', unique: true },
  url:     { type: String, default: '' },
  title:   { type: String, default: '' },    // عنوان عربي
  titleHe: { type: String, default: '' },    // عنوان عبري ✅ جديد
}, { collection: 'settings_video', timestamps: true });

const adminSchema = new mongoose.Schema({
  key:      { type: String, default: 'admin', unique: true },
  password: { type: String, required: true },
}, { collection: 'settings_admin', timestamps: true });

const regionSchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true },
  nameHeb: { type: String, default: '', trim: true },
  notes:   { type: String, default: '' },
}, { collection: 'regions', timestamps: true });

const privilegedSchema = new mongoose.Schema({
  key:      { type: String, default: 'privileged', unique: true },
  users: [{
    idNumber: { type: String, required: true },
    role:     { type: String, enum: ['admin', 'viewer'], required: true },
    label:    { type: String, default: '' },
    password: { type: String, required: true },
    // ✅ للمراقبين فقط: قائمة IDs المشاريع المسموح له بإدارة مشتركيها ودفعاتها بالكامل
    allowedProjectIds: { type: [String], default: [] },
  }],
}, { collection: 'settings_privileged', timestamps: true });

module.exports = {
  Prices:       mongoose.model('Prices',       pricesSchema),
  Announcement: mongoose.model('Announcement', announcementSchema),
  Gallery:      mongoose.model('Gallery',      gallerySchema),
  Video:        mongoose.model('Video',        videoSchema),
  Admin:        mongoose.model('Admin',        adminSchema),
  Region:       mongoose.model('Region',       regionSchema),
  Privileged:   mongoose.model('Privileged',   privilegedSchema),
};