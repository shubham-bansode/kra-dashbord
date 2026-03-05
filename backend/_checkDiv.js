const mongoose = require('mongoose');
require('dotenv').config();
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/kra-dashboard';

mongoose.connect(uri).then(async () => {
  const db = mongoose.connection.db;
  const total = await db.collection('kramonthlyentries').countDocuments();
  const withDiv = await db.collection('kramonthlyentries').countDocuments({ division: { $ne: null } });
  const withoutDiv = await db.collection('kramonthlyentries').countDocuments({ division: null });
  console.log('Total:', total, '| With division:', withDiv, '| Without division:', withoutDiv);

  const sample = await db.collection('kramonthlyentries').findOne({ division: { $ne: null } });
  if (sample) {
    console.log('Sample division id:', sample.division);
  } else {
    console.log('NO entries have division set!');
  }
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
