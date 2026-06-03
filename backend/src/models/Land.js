const mongoose = require('mongoose');

const landSchema = new mongoose.Schema({
  // farmerId أصبح اختيارياً — الأرض مستقلة
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', default: null, index: true },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Region', default: null, index: true },
  name:     { type: String, required: true, trim: true }, // عبري فقط
  nameHeb:  { type: String, default: '', trim: true },
  area:     { type: String, default: '' },
}, {
  timestamps: true,
  collection: 'lands',
});

module.exports = mongoose.model('Land', landSchema);
