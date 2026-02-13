const mongoose = require('mongoose');

const financialYearSchema = new mongoose.Schema({
  year: {
    type: String,
    required: [true, 'Financial Year is required'],
    unique: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\d{4}[-–]\d{2}$/.test(v);
      },
      message: 'Financial Year must be in format YYYY-YY (e.g., 2024-25)'
    }
  },
  displayName: {
    type: String,
    required: [true, 'Display Name is required'],
    trim: true
  },
  startDate: {
    type: Date,
    required: [true, 'Start Date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End Date is required']
  },
  isActive: {
    type: Boolean,
    default: false
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Ensure only one active financial year at a time
financialYearSchema.pre('save', async function(next) {
  if (this.isActive && this.isModified('isActive')) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id } },
      { isActive: false }
    );
  }
  next();
});

// Static method to get active financial year
financialYearSchema.statics.getActive = async function() {
  return await this.findOne({ isActive: true });
};

// Static method to generate year data from year string
financialYearSchema.statics.generateFromYear = function(yearStr) {
  const match = yearStr.match(/^(\d{4})[-–](\d{2})$/);
  if (!match) return null;
  
  const startYear = parseInt(match[1], 10);
  const endYearShort = parseInt(match[2], 10);
  const endYear = startYear + 1;
  
  // Validate end year matches
  if (endYear % 100 !== endYearShort) return null;
  
  return {
    year: `${startYear}-${endYearShort}`,
    displayName: `आर्थिक वर्ष ${startYear}-${endYearShort} | FY ${startYear}-${endYearShort}`,
    startDate: new Date(startYear, 3, 1), // April 1st
    endDate: new Date(endYear, 2, 31, 23, 59, 59) // March 31st
  };
};

module.exports = mongoose.model('FinancialYear', financialYearSchema);
