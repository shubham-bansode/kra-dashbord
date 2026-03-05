const mongoose = require('mongoose');

const kraSchema = new mongoose.Schema({
  // KRA number used for ordering/identity in master KRA list.
  // Optional for backward compatibility with existing DBs, but should be set.
  kraNumber: {
    type: Number,
    min: 1,
    unique: true,
    sparse: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'KRA name is required'],
    unique: true,
    trim: true
  },
  nameEnglish: {
    type: String,
    trim: true
  },
  unit: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Kra', kraSchema);
