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
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters']
    },
    mobileNumber: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      trim: true,
      validate: {
        validator: function (v) {
          if (typeof v === 'undefined' || v === null || String(v).trim() === '') {
            return true;
          }
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
