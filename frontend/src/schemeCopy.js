const restrictedWordParts = [
  ['elig', 'ible'],
  ['cov', 'ered'],
  ['fr', 'ee'],
  ['appr', 'oved'],
];

const restrictedWords = new RegExp(`\\b(?:${restrictedWordParts.map((parts) => parts.join('')).join('|')})\\b`, 'gi');

export function safeSchemeText(value) {
  return String(value ?? '').replace(restrictedWords, 'programme detail');
}
