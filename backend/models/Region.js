const mongoose = require('mongoose');

const regionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Region name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Region code is required'],
    uppercase: true,
    trim: true
  },
  corporation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Corporation',
    required: [true, 'Corporation reference is required']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for unique region per corporation
regionSchema.index({ name: 1, corporation: 1 }, { unique: true });
regionSchema.index({ code: 1, corporation: 1 }, { unique: true });

module.exports = mongoose.model('Region', regionSchema);
