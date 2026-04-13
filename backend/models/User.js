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
    userId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          if (v == null || v === '') return true;
          return /^[a-z0-9._-]{3,30}$/.test(v);
        },
        message: 'User ID must be 3-30 characters and contain only lowercase letters, numbers, dot, underscore, or hyphen'
      }
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
    role: {
      type: String,
      enum: ['user', 'admin', 'superadmin'],
      default: 'user'
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

// Virtual for checking admin access
userSchema.virtual('isAdmin').get(function() {
  return this.role === 'admin' || this.role === 'superadmin';
});

// Static method to find admins
userSchema.statics.findAdmins = function() {
  return this.find({ role: { $in: ['admin', 'superadmin'] }, isActive: true });
};

module.exports = mongoose.model('User', userSchema);
