const mongoose = require('mongoose');

const circleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Circle name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Circle code is required'],
    uppercase: true,
    trim: true
  },
  region: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Region',
    required: [true, 'Region reference is required']
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

// Compound index for unique circle per region
circleSchema.index({ name: 1, region: 1 }, { unique: true });
circleSchema.index({ code: 1, region: 1 }, { unique: true });

module.exports = mongoose.model('Circle', circleSchema);
