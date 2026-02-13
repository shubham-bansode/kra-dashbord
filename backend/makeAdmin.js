const mongoose = require('mongoose');
require('dotenv').config();

async function makeAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Update user to superadmin
    const result = await mongoose.connection.db.collection('users').updateOne(
      { mobileNumber: '9673146801' },
      { $set: { role: 'superadmin' } }
    );
    
    console.log('Updated:', result.modifiedCount, 'user');
    
    // Verify
    const user = await mongoose.connection.db.collection('users').findOne({ mobileNumber: '9673146801' });
    console.log('User now:', user.fullName, '| Role:', user.role);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

makeAdmin();
