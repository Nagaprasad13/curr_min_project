/**
 * CareBridge Demo Reset Utility
 * Restores database collections to pristine seeded state for reproducible demonstrations.
 * 
 * Usage: npm run demo:reset
 */

const runSeed = require('./seed');

async function resetDemo() {
  console.log('================================================================');
  console.log(' CareBridge: Resetting Demo Environment');
  console.log(' Restoring 40 synthetic hospitals, capacities, 10 patients,');
  console.log(' 83 clinical records, and verified healthcare schemes...');
  console.log('================================================================\n');

  try {
    await runSeed();
    console.log('\n✓ DEMO RESET COMPLETE: Database restored to pristine seeded state.');
  } catch (err) {
    console.error('Demo reset failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  resetDemo();
}

module.exports = resetDemo;
