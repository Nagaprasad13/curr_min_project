import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';
import { safeSchemeText } from '../schemeCopy';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forbiddenTerms = ['elig' + 'ible', 'cov' + 'ered', 'fr' + 'ee', 'appr' + 'oved'];
const inputFiles = [];

function collectFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('__')) collectFiles(file);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
      inputFiles.push(file);
    }
  }
}

function getUserFacingLiterals(node, values = []) {
  if (!node || typeof node !== 'object') return values;
  if (node.type === 'StringLiteral') values.push(node.value);
  if (node.type === 'TemplateLiteral') node.quasis.forEach((part) => values.push(part.value.cooked || ''));
  if (node.type === 'JSXText') values.push(node.value);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'comments') continue;
    if (Array.isArray(value)) value.forEach((item) => getUserFacingLiterals(item, values));
    else if (value && typeof value === 'object') getUserFacingLiterals(value, values);
  }
  return values;
}

describe('scheme wording policy', () => {
  it('sanitizes scheme data returned from the API before display', () => {
    const restrictedWords = [
      ['elig', 'ible'].join(''),
      ['cov', 'ered'].join(''),
      ['fr', 'ee'].join(''),
      ['appr', 'oved'].join(''),
    ];
    expect(safeSchemeText(restrictedWords.join(' '))).toBe('programme detail programme detail programme detail programme detail');
  });

  it('scans all frontend component and resource strings for prohibited claims', () => {
    inputFiles.length = 0;
    collectFiles(root);
    const violations = [];
    for (const file of inputFiles) {
      if (file.includes(`${path.sep}__tests__${path.sep}`)) continue;
      const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
      for (const text of getUserFacingLiterals(ast)) {
        for (const term of forbiddenTerms) {
          if (new RegExp(`\\b${term}\\b`, 'i').test(text)) violations.push({ file: path.relative(root, file), text, term });
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
