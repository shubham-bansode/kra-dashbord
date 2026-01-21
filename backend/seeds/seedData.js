const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const Corporation = require('../models/Corporation');
const Region = require('../models/Region');
const Circle = require('../models/Circle');
const Kra = require('../models/Kra');

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kra_monitoring';

// Seed Data
const corporations = [
  { name: 'MKVDC, Pune', code: 'MKVDC', location: 'Pune', hasRegions: true },
  { name: 'VIDC, Nagpur', code: 'VIDC', location: 'Nagpur', hasRegions: true },
  { name: 'KIDC, Thane', code: 'KIDC', location: 'Thane', hasRegions: true },
  { name: 'TIDC, Jalgaon', code: 'TIDC', location: 'Jalgaon', hasRegions: true },
  { name: 'GMIDC, Ch. Sambhaji Nagar', code: 'GMIDC', location: 'Ch. Sambhaji Nagar', hasRegions: true }
];

const regions = [
  // MKVDC Regions
  { name: 'CE WRD, Pune', code: 'CEWRD', corporationCode: 'MKVDC' },
  { name: 'CE SP, Pune', code: 'CESP', corporationCode: 'MKVDC' },
  
  // VIDC Regions
  { name: 'CE WRD, Amaravati', code: 'CEWRDAMR', corporationCode: 'VIDC' },
  { name: 'CE SP, WRD, Amravati', code: 'CESPAMR', corporationCode: 'VIDC' },
  { name: 'CE WRD, Nagpur', code: 'CEWRDNGP', corporationCode: 'VIDC' },
  { name: 'CE Gosikhurd, Nagpur', code: 'CEGOSNGP', corporationCode: 'VIDC' },
  
  // KIDC Region
  { name: 'CE WRD, Kokan Region, Mumbai', code: 'CEWRDMUM', corporationCode: 'KIDC' },
  
  // TIDC Region
  { name: 'CE TIDC, Jalgaon', code: 'CETIDCJAL', corporationCode: 'TIDC' },
  
  // GMIDC Regions
  { name: 'CE CADA, Chh Sambhajinagar', code: 'CECADASBJ', corporationCode: 'GMIDC' },
  { name: 'CE NMR, Nashik', code: 'CENMRNAS', corporationCode: 'GMIDC' },
  { name: 'CE WRD, Chh Sambhajinagar', code: 'CEWRDSBJ', corporationCode: 'GMIDC' }
];

const circles = [
  // CE WRD, Pune circles (MKVDC)
  { name: 'SIC, Sangli', code: 'SICS', regionCode: 'CEWRD', corporationCode: 'MKVDC' },
  { name: 'PIC, Pune', code: 'PICP', regionCode: 'CEWRD', corporationCode: 'MKVDC' },
  { name: 'SIC, Satara', code: 'SICST', regionCode: 'CEWRD', corporationCode: 'MKVDC' },
  { name: 'KIC, Kolhapur', code: 'KICK', regionCode: 'CEWRD', corporationCode: 'MKVDC' },
  { name: 'PIPC,Pune', code: 'PIPCP1', regionCode: 'CEWRD', corporationCode: 'MKVDC' },
  
  // CE SP, Pune circles (MKVDC)
  { name: 'CADA, Solapur', code: 'CADASOL', regionCode: 'CESP', corporationCode: 'MKVDC' },
  { name: 'KIC, Pune', code: 'KICPUNE', regionCode: 'CESP', corporationCode: 'MKVDC' },
  { name: 'OIC, Osmanabad', code: 'OICOSM', regionCode: 'CESP', corporationCode: 'MKVDC' },
  { name: 'SIPC, Satara', code: 'SIPCSAT', regionCode: 'CESP', corporationCode: 'MKVDC' },
  { name: 'BCC, Solapur', code: 'BCCSOL', regionCode: 'CESP', corporationCode: 'MKVDC' },
  
  // CE WRD, Amaravati circles (VIDC)
  { name: 'YIC, Yavatmal', code: 'YICYAV', regionCode: 'CEWRDAMR', corporationCode: 'VIDC' },
  { name: 'YIPC, Yavatmal', code: 'YIPCYAV', regionCode: 'CEWRDAMR', corporationCode: 'VIDC' },
  { name: 'UWIC, Amravati', code: 'UWICAMR', regionCode: 'CEWRDAMR', corporationCode: 'VIDC' },
  { name: 'JPIC, Shegaon', code: 'JPICSHE', regionCode: 'CEWRDAMR', corporationCode: 'VIDC' },
  
  // CE SP, WRD, Amravati circles (VIDC)
  { name: 'AIPC, Amravati', code: 'AIPCAMR', regionCode: 'CESPAMR', corporationCode: 'VIDC' },
  { name: 'AIC, Akola', code: 'AICAKO', regionCode: 'CESPAMR', corporationCode: 'VIDC' },
  { name: 'BIPC, Buldhana', code: 'BIPCBUL', regionCode: 'CESPAMR', corporationCode: 'VIDC' },
  
  // CE WRD, Nagpur circles (VIDC)
  { name: 'CADA, Nagpur', code: 'CADANGP', regionCode: 'CEWRDNGP', corporationCode: 'VIDC' },
  { name: 'BIC, Bhandara', code: 'BICBHA', regionCode: 'CEWRDNGP', corporationCode: 'VIDC' },
  { name: 'CIPC, Chandrapur', code: 'CIPCCHA', regionCode: 'CEWRDNGP', corporationCode: 'VIDC' },
  { name: 'IPIC,Nagpur', code: 'IPICNGP', regionCode: 'CEWRDNGP', corporationCode: 'VIDC' },
  
  // CE Gosikhurd, Nagpur circles (VIDC)
  { name: 'NIC, Nagpur', code: 'NICNGP', regionCode: 'CEGOSNGP', corporationCode: 'VIDC' },
  { name: 'GLIC Ambadi', code: 'GLICAMB', regionCode: 'CEGOSNGP', corporationCode: 'VIDC' },
  { name: 'GPC, Nagpur', code: 'GPCNGP', regionCode: 'CEGOSNGP', corporationCode: 'VIDC' },
  
  // CE WRD, Kokan Region, Mumbai circles (KIDC)
  { name: 'RIC, Kuwarbav, Ratnagiri', code: 'RICKUW', regionCode: 'CEWRDMUM', corporationCode: 'KIDC' },
  { name: 'TIC, Thane', code: 'TICTHN', regionCode: 'CEWRDMUM', corporationCode: 'KIDC' },
  { name: 'SKIPC, Oras', code: 'SKIPCORA', regionCode: 'CEWRDMUM', corporationCode: 'KIDC' },
  { name: 'NKIPC, Thane', code: 'NKIPCTHN', regionCode: 'CEWRDMUM', corporationCode: 'KIDC' },
  
  // CE TIDC, Jalgaon circles (TIDC)
  { name: 'DIPC, Dhule', code: 'DIPCDHU', regionCode: 'CETIDCJAL', corporationCode: 'TIDC' },
  { name: 'CADA, Jalgaon', code: 'CADAJAL', regionCode: 'CETIDCJAL', corporationCode: 'TIDC' },
  { name: 'JIPC,Jalgaon', code: 'JIPCJAL', regionCode: 'CETIDCJAL', corporationCode: 'TIDC' },
  
  // CE CADA, Chh Sambhajinagar circles (GMIDC)
  { name: 'CADA, Chh Sambhajinagar', code: 'CADASBJ', regionCode: 'CECADASBJ', corporationCode: 'GMIDC' },
  { name: 'CADA, Latur', code: 'CADALAT', regionCode: 'CECADASBJ', corporationCode: 'GMIDC' },
  { name: 'CADA, Bid', code: 'CADABID', regionCode: 'CECADASBJ', corporationCode: 'GMIDC' },
  { name: 'UPPC Nanded', code: 'UPPNAN', regionCode: 'CECADASBJ', corporationCode: 'GMIDC' },
  
  // CE NMR, Nashik circles (GMIDC)
  { name: 'CADA, Nashik', code: 'CADANAS', regionCode: 'CENMRNAS', corporationCode: 'GMIDC' },
  { name: 'CADA, Ahilyanagar', code: 'CADAAHI', regionCode: 'CENMRNAS', corporationCode: 'GMIDC' },
  
  // CE WRD, Chh Sambhajinagar circles (GMIDC)
  { name: 'DIC, Dharashiv', code: 'DICDHA', regionCode: 'CEWRDSBJ', corporationCode: 'GMIDC' },
  { name: 'NIC, Nanded', code: 'NICNAN', regionCode: 'CEWRDSBJ', corporationCode: 'GMIDC' },
  { name: 'CIC, Chh Sambhajinagar', code: 'CICSBJ', regionCode: 'CEWRDSBJ', corporationCode: 'GMIDC' },
  { name: 'BIPC, Parli', code: 'BIPCPAR', regionCode: 'CEWRDSBJ', corporationCode: 'GMIDC' }
];

const kras = [
  {
    name: 'प्रकल्पाचे लाभक्षेत्रात प्रत्यक्ष सिंचन करणे (लक्ष हेक्टर)',
    nameEnglish: 'Actual Irrigation in Project Benefit Area (Lakh Hectares)',
    unit: 'लक्ष हेक्टर',
    sortOrder: 1
  },
  {
    name: 'सिंचन व बिगर सिंचन पाणीपट्टी वसुली करणे (रुपये लक्ष)',
    nameEnglish: 'Collection of Irrigation and Non-Irrigation Water Cess (Rs. Lakh)',
    unit: 'रुपये लक्ष',
    sortOrder: 2
  },
  {
    name: 'सन २०२४-२५ मध्ये पूर्ण करावयाचे प्रकल्प (संख्या)',
    nameEnglish: 'Projects to be completed in 2024-25 (Count)',
    unit: 'संख्या',
    sortOrder: 3
  },
  {
    name: 'सिंचन निर्मिती (हेक्टर)',
    nameEnglish: 'Irrigation Creation (Hectares)',
    unit: 'हेक्टर',
    sortOrder: 4
  },
  {
    name: 'पाणीसाठा निर्मिती (दलघमी)',
    nameEnglish: 'Water Storage Creation (MCM)',
    unit: 'दलघमी',
    sortOrder: 5
  },
  {
    name: 'पाणी वापर संस्थांना लाभक्षेत्र हस्तांतरण करणे (हेक्टर)',
    nameEnglish: 'Transfer of Benefit Area to Water User Organizations (Hectares)',
    unit: 'हेक्टर',
    sortOrder: 6
  },
  {
    name: 'अवशिष्ट मधील प्रकल्प पूर्ण करणे (संख्या)',
    nameEnglish: 'Completion of Pending Projects (Count)',
    unit: 'संख्या',
    sortOrder: 7
  },
  {
    name: 'सन २०२५-२६ मध्ये पूर्ण करावयाचे प्रकल्प (संख्या)',
    nameEnglish: 'Projects to be completed in 2025-26 (Count)',
    unit: 'संख्या',
    sortOrder: 8
  }
];

async function seedDatabase() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await Corporation.deleteMany({});
    await Region.deleteMany({});
    await Circle.deleteMany({});
    await Kra.deleteMany({});

    // Seed Corporations
    console.log('📦 Seeding Corporations...');
    const createdCorporations = await Corporation.insertMany(corporations);
    console.log(`   ✅ Created ${createdCorporations.length} corporations`);

    // Create a map of corporation codes to IDs
    const corporationMap = {};
    createdCorporations.forEach(corp => {
      corporationMap[corp.code] = corp._id;
    });

    // Seed Regions with corporation references
    console.log('📦 Seeding Regions...');
    const regionsWithRefs = regions.map(region => ({
      name: region.name,
      code: region.code,
      corporation: corporationMap[region.corporationCode]
    }));
    const createdRegions = await Region.insertMany(regionsWithRefs);
    console.log(`   ✅ Created ${createdRegions.length} regions`);

    // Create a map of region codes to IDs
    const regionMap = {};
    createdRegions.forEach(region => {
      regionMap[region.code] = region._id;
    });

    // Seed Circles with region and corporation references
    console.log('📦 Seeding Circles...');
    const circlesWithRefs = circles.map(circle => ({
      name: circle.name,
      code: circle.code,
      region: regionMap[circle.regionCode],
      corporation: corporationMap[circle.corporationCode]
    }));
    const createdCircles = await Circle.insertMany(circlesWithRefs);
    console.log(`   ✅ Created ${createdCircles.length} circles`);

    // Seed KRAs
    console.log('📦 Seeding KRAs...');
    const createdKras = await Kra.insertMany(kras);
    console.log(`   ✅ Created ${createdKras.length} KRAs`);

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   • Corporations: ${createdCorporations.length}`);
    console.log(`   • Regions: ${createdRegions.length}`);
    console.log(`   • Circles: ${createdCircles.length}`);
    console.log(`   • KRAs: ${createdKras.length}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();
