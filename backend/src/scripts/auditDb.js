const { connectDB, disconnectDB } = require('../config/db');
const mongoose = require('mongoose');

async function auditDatabase() {
  console.log('Connecting to database for Phase 8.0 Audit...');
  await connectDB();
  
  const targetCollections = [
    'hospitals',
    'hospitalcapacities',
    'users',
    'referrals',
    'consents',
    'patientrecords',
    'schemes',
    'auditlogs',
    'conditionspecialtymaps'
  ];

  const dbCollections = await mongoose.connection.db.listCollections().toArray();
  const dbCollectionNames = dbCollections.map(c => c.name);
  console.log('Existing collections in MongoDB:', dbCollectionNames);

  const results = {};

  for (const name of targetCollections) {
    if (!dbCollectionNames.includes(name)) {
      results[name] = {
        exists: false,
        count: 0,
        sampleKeys: [],
        sample: null,
      };
      continue;
    }

    const col = mongoose.connection.db.collection(name);
    const count = await col.countDocuments();
    const sample = await col.findOne();

    results[name] = {
      exists: true,
      count,
      sampleKeys: sample ? Object.keys(sample) : [],
      sample: sample ? JSON.parse(JSON.stringify(sample)) : null,
    };
  }

  console.log('\n--- AUDIT RESULTS SUMMARY ---');
  for (const [colName, data] of Object.entries(results)) {
    console.log(`Collection: ${colName} | Exists: ${data.exists} | Count: ${data.count} | Keys: ${data.sampleKeys.join(', ')}`);
  }

  await disconnectDB();
  return results;
}

if (require.main === module) {
  auditDatabase()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = auditDatabase;
