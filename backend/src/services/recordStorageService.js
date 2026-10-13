const fs = require('fs');
const path = require('path');

const storageDir = path.join(__dirname, '..', '..', 'storage', 'records');

// Ensure directory exists
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

/**
 * Persists record payload into protected filesystem storage.
 * In a production architecture this would point to S3/Blob store with KMS encryption.
 * In this research prototype, records are written to protected local storage outside MongoDB.
 * 
 * @param {string} recordId
 * @param {object|string} payload
 * @returns {string} Relative storage reference
 */
function saveRecordContent(recordId, payload) {
  const filename = `${recordId}.json`;
  const filePath = path.join(storageDir, filename);
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  fs.writeFileSync(filePath, data, 'utf-8');
  return `storage/records/${filename}`;
}

/**
 * Retrieves record payload from protected filesystem storage.
 * Direct filesystem read is blocked by authorization checks.
 * 
 * @param {string} contentRef
 * @returns {object|null}
 */
function readRecordContent(contentRef) {
  try {
    const filename = path.basename(contentRef);
    const filePath = path.join(storageDir, filename);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[Record Storage Service] Error reading content for ${contentRef}:`, err.message);
    return null;
  }
}

module.exports = {
  saveRecordContent,
  readRecordContent,
  storageDir,
};
