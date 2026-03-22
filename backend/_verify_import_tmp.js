require('dotenv').config();
const mongoose = require('mongoose');
const KraMonthlyEntry = require('./models/KraMonthlyEntry');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const docs = await KraMonthlyEntry.find({ submittedBy: 'Excel Import (English Heading)' })
    .select('corporationName regionName circleName achievementMonth achievementYear kraYear kras')
    .limit(2)
    .lean();

  console.log('IMPORTED_DOCS', docs.length);
  for (const doc of docs) {
    console.log('GROUP', {
      corporationName: doc.corporationName,
      regionName: doc.regionName,
      circleName: doc.circleName,
      month: doc.achievementMonth,
      year: doc.achievementYear,
      kraYear: doc.kraYear
    });
    console.log('KRA_NAMES', (doc.kras || []).map((k) => k.kraName));
  }

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
