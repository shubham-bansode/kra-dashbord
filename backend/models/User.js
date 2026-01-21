const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    corporation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Corporation',
      required: [true, 'Corporation is required']
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required'],
      unique: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^[6-9]\d{9}$/.test(v);
        },
        message: 'Please enter a valid 10-digit Indian mobile number'
      }
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required']
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

module.exports = mongoose.model('User', userSchema);
