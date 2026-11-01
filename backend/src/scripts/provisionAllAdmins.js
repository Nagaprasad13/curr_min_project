/**
 * provisionAllAdmins.js
 * Creates a hospital_admin user for every synthetic hospital that doesn't have one.
 * Email pattern: admin.<sanitized-code>@carebridge.tn.gov.in
 * Password: AdminPassword123! (same as existing demo admins)
 * Run: node backend/src/scripts/provisionAllAdmins.js
 */

const mongoose = require('mongoose');
const path = require('path');
require(path.join(__dirname, '../../node_modules/dotenv')).config({ path: path.join(__dirname, '../../.env') });

const Hospital = require('../models/Hospital');
const User = require('../models/User');

function codeToSlug(code) {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '.');
}

async function provisionAllAdmins() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('This script must never run in production.');
  }

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/carebridge');
  console.log('Connected to MongoDB.');

  const allHospitals = await Hospital.find({ isSynthetic: true }).sort({ code: 1 });
  const allAdmins = await User.find({ role: 'hospital_admin' }).select('hospitalId email').lean();
  const adminHospitalIds = new Set(allAdmins.map(a => String(a.hospitalId)));

  const missing = allHospitals.filter(h => !adminHospitalIds.has(String(h._id)));
  console.log(`Found ${allHospitals.length} hospitals total. ${allAdmins.length} already have admins. Creating accounts for ${missing.length} hospitals...\n`);

  let created = 0;
  const summary = [];

  for (const hospital of missing) {
    const slug = codeToSlug(hospital.code);
    const email = `admin.${slug}@carebridge.tn.gov.in`;
    const name = `Admin - ${hospital.name.replace('Synthetic - ', '')}`;

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        name,
        email,
        password: 'AdminPassword123!',
        role: 'hospital_admin',
        hospitalId: hospital._id,
        district: hospital.district,
        phone: '+91 94400 00000',
        isSynthetic: true,
      });
      await user.save();
      created++;
    } else {
      // Update hospitalId if somehow email exists without proper link
      user.hospitalId = hospital._id;
      await user.save();
    }

    hospital.adminUserId = user._id;
    await hospital.save();

    summary.push({ code: hospital.code, name: hospital.name.replace('Synthetic - ', ''), email });
    console.log(`✓ [${hospital.code}] ${email}`);
  }

  console.log(`\nDone. Created ${created} new admin accounts.`);
  console.log('\n=== ALL HOSPITAL ADMIN ACCOUNTS ===');

  // Print full final list
  const allFinal = await User.find({ role: 'hospital_admin', isSynthetic: true })
    .populate('hospitalId', 'name code district')
    .sort({ email: 1 })
    .lean();

  allFinal.forEach(u => {
    console.log(`  ${u.email}`);
    console.log(`    Hospital: ${u.hospitalId?.name || 'N/A'} (${u.hospitalId?.code || '?'})`);
    console.log(`    District: ${u.hospitalId?.district || u.district}`);
    console.log(`    Password: AdminPassword123!`);
    console.log('');
  });

  await mongoose.disconnect();
  console.log('Disconnected. Done.');
}

provisionAllAdmins().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

