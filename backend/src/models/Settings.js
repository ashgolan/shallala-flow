const mongoose = require('mongoose');

const pricesSchema = new mongoose.Schema({
  key:         { type: String, default: 'prices', unique: true },
  globalPrice: { type: Number, default: 0 },
  yearPrices:  { type: mongoose.Schema.Types.Mixed, default: {} },
  landPrices:  { type: mongoose.Schema.Types.Mixed, default: {} },
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
  key:   { type: String, default: 'video', unique: true },
  url:   { type: String, default: '' },
  title: { type: String, default: '' },
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

module.exports = {
  Prices:       mongoose.model('Prices',       pricesSchema),
  Announcement: mongoose.model('Announcement', announcementSchema),
  Gallery:      mongoose.model('Gallery',      gallerySchema),
  Video:        mongoose.model('Video',        videoSchema),
  Admin:        mongoose.model('Admin',        adminSchema),
  Region:       mongoose.model('Region',       regionSchema),
};
