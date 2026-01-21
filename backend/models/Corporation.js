const mongoose = require('mongoose');

const corporationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Corporation name is required'],
    unique: true,
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Corporation code is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  location: {
    type: String,
    trim: true
  },
  hasRegions: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Corporation', corporationSchema);
