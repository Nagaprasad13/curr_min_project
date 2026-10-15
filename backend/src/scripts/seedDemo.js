const mongoose = require('mongoose');
const {
  connectStrictDemoDatabase,
  seedDemoData,
  runDemoCheck,
} = require('./demoData');

async function seedDemo() {
  try {
    await connectStrictDemoDatabase();
    const result = await seedDemoData();
    console.log(result.skipped
      ? `Demo seed skipped: ${result.message}`
      : `Demo seed complete: ${result.hospitals} hospitals, ${result.patients} patients, ${result.referrals} referrals, ${result.consents} consents.`);
    await runDemoCheck();
    return result;
  } catch (error) {
    console.error('Demo seed failed:', error.message);
    process.exitCode = 1;
    throw error;
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

if (require.main === module) {
  seedDemo().catch(() => {});
}

module.exports = seedDemo;
