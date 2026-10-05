import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadTs } from './load-ts.mjs';

const { browserLocale, translate, pieceTitle, ENGLISH, VIETNAMESE } = await loadTs('../lib/piano-i18n.ts');
const { REPERTOIRE } = await loadTs('../lib/repertoire.ts');

test('Browser preference selects Vietnamese variants; all other or missing languages default to English', () => {
  for (const language of ['vi', 'vi-VN', 'VI', 'vi_vn']) {
    assert.equal(browserLocale([language]), 'vi');
  }
  for (const languages of [[], ['en-US', 'fr-FR'], ['fr-FR'], ['ja-JP'], ['']]) {
    assert.equal(browserLocale(languages), 'en');
  }
  assert.equal(browserLocale(['vi-VN', 'en']), 'vi');
});

test('Every built-in title has English and Vietnamese presentation', () => {
  for (const piece of REPERTOIRE) {
    assert.ok(pieceTitle('en', piece.title).length > 0);
    assert.ok(pieceTitle('vi', piece.title).length > 0);
  }
  assert.equal(pieceTitle('en', 'Canon in D'), 'Canon in D');
  assert.equal(translate('en', 'Volume'), 'Volume');
  assert.equal(translate('vi', 'Volume'), 'Âm lượng');
});

test('All translated UI literals have English and Vietnamese entries', () => {
  const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 't' && ts.isStringLiteral(node.arguments[0])) {
      const key = node.arguments[0].text;
      assert.ok(ENGLISH[key] !== undefined || VIETNAMESE[key] !== undefined, `Missing translation for: ${key}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
});
