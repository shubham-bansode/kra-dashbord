const mongoose = require('mongoose');
require('dotenv').config();

const KraMonthlyEntry = require('../models/KraMonthlyEntry');
const Corporation = require('../models/Corporation');
const Kra = require('../models/Kra');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kra_monitoring';

async function addSampleEntries() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all corporations and KRAs
    const corporations = await Corporation.find();
    const kras = await Kra.find();

    if (corporations.length === 0 || kras.length === 0) {
      console.log('⚠️  Please run seed data first: npm run seed');
      process.exit(1);
    }

    console.log('📦 Creating sample KRA entries...');

    const currentYear = new Date().getFullYear();
    const sampleEntries = [];

    // Create entries for each corporation and KRA for the last 6 months
    for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
      const date = new Date();
      date.setMonth(date.getMonth() - monthOffset);

      for (const corp of corporations) {
        for (let i = 0; i < Math.min(3, kras.length); i++) {
          const kra = kras[i];
          const annualTarget = Math.floor(Math.random() * 1000) + 500;
          const kraAchievement = Math.floor(annualTarget * (0.6 + Math.random() * 0.4));

          sampleEntries.push({
            corporation: corp._id,
            region: null,
            circle: null,
            kraYear: `${currentYear}-${currentYear + 1}`,
            kra: kra._id,
            annualTarget,
            achievementDate: date,
            achievementMonth: date.getMonth() + 1,
            achievementYear: date.getFullYear(),
            kraAchievement,
            remarks: `Sample entry for ${corp.name}`,
            contactNumber: '9876543210',
            submittedBy: 'Sample User'
          });
        }
      }
    }

    // Insert entries (ignore duplicates)
    let inserted = 0;
    for (const entry of sampleEntries) {
      try {
        await KraMonthlyEntry.create(entry);
        inserted++;
      } catch (error) {
        if (error.code === 11000) {
          // Duplicate, skip
          continue;
        }
        console.error('Error inserting entry:', error.message);
      }
    }

    console.log(`✅ Created ${inserted} sample entries`);
    console.log('\n🎉 Sample data added successfully!');
    console.log('   You can now view the dashboard with data.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addSampleEntries();
