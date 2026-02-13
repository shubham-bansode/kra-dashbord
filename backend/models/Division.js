const mongoose = require('mongoose');

const divisionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Division name is required'],
      trim: true
    },
    code: {
      type: String,
      required: [true, 'Division code is required'],
      uppercase: true,
      trim: true
    },
    circle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Circle',
      required: [true, 'Circle reference is required']
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
  },
  {
    timestamps: true
  }
);

// Compound index for unique division per circle
divisionSchema.index({ name: 1, circle: 1 }, { unique: true });
divisionSchema.index({ code: 1, circle: 1 }, { unique: true });

module.exports = mongoose.model('Division', divisionSchema);
