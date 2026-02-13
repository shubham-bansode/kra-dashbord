const mongoose = require('mongoose');

const kraItemSchema = new mongoose.Schema(
  {
    kraId: {
      type: Number,
      required: true,
      min: 1,
      max: 7
    },
    kraName: {
      type: String,
      required: true,
      trim: true
    },
    weight: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    annualTarget: {
      type: Number,
      default: 0,
      min: 0
    },
    kraAchievement: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  { _id: false }
);

const kraMonthlyEntrySchema = new mongoose.Schema(
  {
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
    division: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
      default: null
    },

    // KRA year (financial year string, e.g. 2024-2025)
    kraYear: {
      type: String,
      required: [true, 'KRA Year is required'],
      trim: true
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

    // Store ALL 7 KRAs (unselected KRAs must be 0)
    kras: {
      type: [kraItemSchema],
      validate: {
        validator: function (arr) {
          if (!Array.isArray(arr) || arr.length !== 7) return false;
          const ids = arr.map((k) => k.kraId);
          return new Set(ids).size === 7 && ids.every((id) => id >= 1 && id <= 7);
        },
        message: 'kras must include all 7 KRAs (kraId 1..7)'
      },
      required: true
    },

    selectedKraIds: {
      type: [Number],
      default: []
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
        validator: function (v) {
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
  },
  {
    timestamps: true
  }
);

// Unique per org per calendar month/year
kraMonthlyEntrySchema.index(
  {
    corporation: 1,
    region: 1,
    circle: 1,
    division: 1,
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

// Static method to check for duplicate monthly submission
kraMonthlyEntrySchema.statics.checkDuplicate = async function (entryData) {
  const date = new Date(entryData.achievementDate);
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  const query = {
    corporation: entryData.corporation,
    achievementMonth: month,
    achievementYear: year
  };

  // region/circle can be null
  query.region = entryData.region || null;
  query.circle = entryData.circle || null;
  query.division = entryData.division || null;

  return this.findOne(query);
};

module.exports = mongoose.model('KraMonthlyEntry', kraMonthlyEntrySchema);
