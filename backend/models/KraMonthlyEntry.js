const mongoose = require('mongoose');

const kraMonthlyEntrySchema = new mongoose.Schema({
  // Organization Hierarchy
  corporation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Corporation',
    required: [true, 'Corporation is required']
  },
  region: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Region',
    default: null
  },
  circle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Circle',
    default: null
  },
  
  // KRA Information
  kraYear: {
    type: String,
    required: [true, 'KRA Year is required'],
    trim: true
  },
  kra: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Kra',
    required: [true, 'KRA is required']
  },
  annualTarget: {
    type: Number,
    required: [true, 'Annual Target is required'],
    min: [0, 'Annual Target cannot be negative']
  },
  
  // Monthly Achievement
  achievementDate: {
    type: Date,
    required: [true, 'Achievement Date is required']
  },
  achievementMonth: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  achievementYear: {
    type: Number,
    required: true
  },
  kraAchievement: {
    type: Number,
    required: [true, 'KRA Achievement is required'],
    min: [0, 'KRA Achievement cannot be negative']
  },
  
  // Additional Info
  remarks: {
    type: String,
    trim: true,
    default: ''
  },
  contactNumber: {
    type: String,
    required: [true, 'Contact Number is required'],
    validate: {
      validator: function(v) {
        return /^[6-9]\d{9}$/.test(v);
      },
      message: 'Please enter a valid 10-digit Indian mobile number'
    }
  },
  
  // Metadata
  submittedBy: {
    type: String,
    trim: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound unique index to prevent duplicate monthly entries
kraMonthlyEntrySchema.index(
  {
    corporation: 1,
    region: 1,
    circle: 1,
    kra: 1,
    achievementMonth: 1,
    achievementYear: 1
  },
  { unique: true }
);

// Derive month/year early so required validation passes
kraMonthlyEntrySchema.pre('validate', function (next) {
  if (this.achievementDate) {
    const date = new Date(this.achievementDate);
    if (!Number.isNaN(date.getTime())) {
      this.achievementMonth = date.getMonth() + 1;
      this.achievementYear = date.getFullYear();
    }
  }
  next();
});

// Static method to check for duplicate entry
kraMonthlyEntrySchema.statics.checkDuplicate = async function(entryData) {
  const date = new Date(entryData.achievementDate);
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  
  const existing = await this.findOne({
    corporation: entryData.corporation,
    region: entryData.region || null,
    circle: entryData.circle || null,
    kra: entryData.kra,
    achievementMonth: month,
    achievementYear: year
  });
  
  return existing;
};

module.exports = mongoose.model('KraMonthlyEntry', kraMonthlyEntrySchema);
