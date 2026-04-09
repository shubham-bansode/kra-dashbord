/**
 * Seed script to create a superadmin user and initial financial years
 * Run with: node seeds/adminSeed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Corporation = require('../models/Corporation');
const FinancialYear = require('../models/FinancialYear');

async function seedAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get first corporation for admin
    const corporation = await Corporation.findOne();
    if (!corporation) {
      console.error('❌ No corporation found. Please seed corporations first.');
      process.exit(1);
    }

    // Check if superadmin already exists
    const existingAdmin = await User.findOne({ role: 'superadmin' });
    if (existingAdmin) {
      console.log('ℹ️ Superadmin already exists:', existingAdmin.username);
    } else {
      // Create superadmin user
      const passwordHash = await bcrypt.hash('admin123', 10);
      const adminUser = await User.create({
        corporation: corporation._id,
        fullName: 'Super Admin',
        username: 'superadmin',
        passwordHash,
        role: 'superadmin',
        isActive: true
      });
      console.log('✅ Superadmin created:');
      console.log('   Username: superadmin');
      console.log('   Password: admin123');
    }

    // Create demo admin user
    const existingDemoAdmin = await User.findOne({ username: 'demoadmin' });
    if (!existingDemoAdmin) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await User.create({
        corporation: corporation._id,
        fullName: 'Demo Admin',
        username: 'demoadmin',
        passwordHash,
        role: 'admin',
        isActive: true
      });
      console.log('✅ Demo Admin created:');
      console.log('   Username: demoadmin');
      console.log('   Password: admin123');
    } else {
      // Update existing user to admin role
      existingDemoAdmin.role = 'admin';
      await existingDemoAdmin.save();
      console.log('ℹ️ Updated existing user to admin role:', existingDemoAdmin.username);
    }

    // Seed financial years
    const financialYears = [
      { year: '2023-24', isActive: false },
      { year: '2024-25', isActive: true },
      { year: '2025-26', isActive: false }
    ];

    console.log('\n📅 Seeding Financial Years...');
    for (const fy of financialYears) {
      const existing = await FinancialYear.findOne({ year: fy.year });
      if (!existing) {
        const yearData = FinancialYear.generateFromYear(fy.year);
        if (yearData) {
          await FinancialYear.create({
            ...yearData,
            isActive: fy.isActive
          });
          console.log(`   ✅ Created: ${fy.year}${fy.isActive ? ' (ACTIVE)' : ''}`);
        }
      } else {
        console.log(`   ℹ️ Exists: ${fy.year}`);
        // Update active status if needed
        if (fy.isActive && !existing.isActive) {
          existing.isActive = true;
          await existing.save();
          console.log(`   ✅ Set ${fy.year} as ACTIVE`);
        }
      }
    }

    console.log('\n✅ Admin seed completed successfully!\n');
    console.log('═══════════════════════════════════════════');
    console.log('  LOGIN CREDENTIALS');
    console.log('═══════════════════════════════════════════');
    console.log('  Superadmin:');
    console.log('    Username: superadmin');
    console.log('    Password: admin123');
    console.log('');
    console.log('  Admin:');
    console.log('    Username: demoadmin');
    console.log('    Password: admin123');
    console.log('═══════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

seedAdmin();
