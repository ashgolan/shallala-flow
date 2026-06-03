const mongoose = require('mongoose');

const farmerNoteSchema = new mongoose.Schema({
  farmerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true, index: true },
  landId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Land',   required: true },
  date:        { type: String, required: true },
  type:        { type: String, default: 'أخرى' },
  description: { type: String, required: true, trim: true },
  amount:      { type: String, default: '' },
  unit:        { type: String, default: '' },
}, {
  timestamps: true,
  collection: 'farmer_notes',
});

module.exports = mongoose.model('FarmerNote', farmerNoteSchema);
