const mongoose = require('mongoose');

const farmerSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  nameHeb:  { type: String, default: '', trim: true },
  idNumber: { type: String, required: true, unique: true, trim: true },
  code:     { type: String, required: true, minlength: 4, maxlength: 4, match: /^\d{4}$/ },
  phone:    { type: String, default: '', trim: true },
  notes:    { type: String, default: '' },
}, {
  timestamps: true,
  collection: 'farmers',
});

farmerSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.code;
  return obj;
};

module.exports = mongoose.model('Farmer', farmerSchema);
