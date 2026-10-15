const mongoose = require('mongoose');
const {
  connectStrictDemoDatabase,
  runDemoCheck,
} = require('./demoData');

async function checkDemo() {
  try {
    await connectStrictDemoDatabase({ requireMarker: true });
    return await runDemoCheck();
  } catch (error) {
    console.error('Demo check failed:', error.message);
    process.exitCode = 1;
    throw error;
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

if (require.main === module) {
  checkDemo().catch(() => {});
}

module.exports = checkDemo;
