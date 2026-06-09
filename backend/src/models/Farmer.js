const mongoose = require('mongoose');

const farmerSchema = new mongoose.Schema({
  // ✅ الاسم الشخصي والعائلة منفصلان
  firstName: { type: String, default: '', trim: true },  // الاسم الشخصي: غسان
  lastName:  { type: String, default: '', trim: true },  // اسم العائلة:   عمران
  // name و nameHeb يُولَّدان تلقائياً من firstName + lastName
  name:      { type: String, required: true, trim: true },
  nameHeb:   { type: String, default: '', trim: true },
  idNumber:  { type: String, required: true, unique: true, trim: true },
  code:      { type: String, required: true, minlength: 4, maxlength: 4, match: /^\d{4}$/ },
  phone:     { type: String, default: '', trim: true },
  notes:     { type: String, default: '' },
}, {
  timestamps: true,
  collection: 'farmers',
});

// ✅ virtual: هل رقم الهوية مؤقت؟
farmerSchema.virtual('isTemp').get(function () {
  return this.idNumber?.startsWith('TMP-');
});

farmerSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.code;
  return obj;
};

module.exports = mongoose.model('Farmer', farmerSchema);
