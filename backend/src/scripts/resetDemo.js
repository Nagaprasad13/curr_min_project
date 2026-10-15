const mongoose = require('mongoose');
const {
  connectStrictDemoDatabase,
  seedDemoData,
  runDemoCheck,
} = require('./demoData');

async function resetDemo() {
  try {
    await connectStrictDemoDatabase({ requireMarker: true });
    console.log('Restoring deterministic synthetic demo fixtures...');
    const result = await seedDemoData({ force: true });
    console.log(`Demo reset complete: restored ${result.hospitals} hospitals, ${result.patients} patients, ${result.referrals} referrals, and ${result.consents} consents.`);
    await runDemoCheck();
    return result;
  } catch (error) {
    console.error('Demo reset failed:', error.message);
    process.exitCode = 1;
    throw error;
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

if (require.main === module) {
  resetDemo().catch(() => {});
}

module.exports = resetDemo;
