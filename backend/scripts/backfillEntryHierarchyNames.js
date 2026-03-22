require('dotenv').config();
const mongoose = require('mongoose');

const KraMonthlyEntry = require('../models/KraMonthlyEntry');
const Corporation = require('../models/Corporation');
const Region = require('../models/Region');
const Circle = require('../models/Circle');
const Division = require('../models/Division');

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const entries = await KraMonthlyEntry.find(
    {},
    {
      corporation: 1,
      region: 1,
      circle: 1,
      division: 1,
      corporationName: 1,
      regionName: 1,
      circleName: 1,
      divisionName: 1,
    },
  ).lean();

  let scanned = 0;
  let updated = 0;

  for (const entry of entries) {
    scanned += 1;

    const [corp, region, circle, division] = await Promise.all([
      entry.corporation ? Corporation.findById(entry.corporation).select('name').lean() : null,
      entry.region ? Region.findById(entry.region).select('name').lean() : null,
      entry.circle ? Circle.findById(entry.circle).select('name').lean() : null,
      entry.division ? Division.findById(entry.division).select('name').lean() : null,
    ]);

    const next = {
      corporationName: corp?.name || entry.corporationName || '',
      regionName: region?.name || entry.regionName || '',
      circleName: circle?.name || entry.circleName || '',
      divisionName: division?.name || entry.divisionName || '',
    };

    const changed =
      (entry.corporationName || '') !== next.corporationName ||
      (entry.regionName || '') !== next.regionName ||
      (entry.circleName || '') !== next.circleName ||
      (entry.divisionName || '') !== next.divisionName;

    if (!changed) continue;

    await KraMonthlyEntry.updateOne({ _id: entry._id }, { $set: next });
    updated += 1;
  }

  const unresolved = await KraMonthlyEntry.countDocuments({
    $or: [
      { corporationName: { $in: [null, ''] } },
      { region: { $ne: null }, regionName: { $in: [null, ''] } },
      { circle: { $ne: null }, circleName: { $in: [null, ''] } },
      { division: { $ne: null }, divisionName: { $in: [null, ''] } },
    ],
  });

  console.log(JSON.stringify({ scanned, updated, unresolved }, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
