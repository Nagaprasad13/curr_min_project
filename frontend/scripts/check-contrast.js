import { checkContrastTokens } from '../src/design-system/contrast.js';

const failures = checkContrastTokens();
if (failures.length) {
  console.error('Contrast token check failed:');
  failures.forEach(({ theme, label, ratio, minimum }) => console.error(`- ${theme}: ${label} ${ratio.toFixed(2)}:1 (requires ${minimum}:1)`));
  process.exitCode = 1;
} else {
  console.log('Contrast token check passed: all declared text and UI pairs meet WCAG AA.');
}
