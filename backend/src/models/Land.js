const mongoose = require('mongoose');

const landSchema = new mongoose.Schema({
  farmerId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', default: null, index: true },
  regionId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Region', default: null, index: true },
  name:          { type: String, required: true, trim: true },
  nameHeb:       { type: String, default: '', trim: true },
  area:          { type: String, default: '' },
  // ── موقع المحطة — يُدخل مرة واحدة هنا ──────────────────
  stationNumber: { type: String, default: '' },
  stationLat:    { type: Number, default: null },
  stationLng:    { type: Number, default: null },
}, {
  timestamps: true,
  collection: 'lands',
});

module.exports = mongoose.model('Land', landSchema);
