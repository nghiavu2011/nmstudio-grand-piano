import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadTs } from './load-ts.mjs';
const { browserLocale, translate, pieceTitle, ENGLISH } = await loadTs('../lib/piano-i18n.ts');
const { REPERTOIRE } = await loadTs('../lib/repertoire.ts');

test('Browser preference selects Chinese variants; all other or missing languages default to English', () => {
  for (const language of ['zh', 'zh-CN', 'zh-TW', 'zh-Hant-HK', 'ZH-sg']) assert.equal(browserLocale([language]), 'zh');
  for (const languages of [[], ['en-US', 'zh-CN'], ['fr-FR'], ['ja-JP'], [''], ['zho']]) assert.equal(browserLocale(languages), 'en');
  assert.equal(browserLocale(['zh-TW', 'en']), 'zh');
});

test('Every built-in title has English and Chinese presentation without modifying MIDI identity', () => {
  for (const piece of REPERTOIRE) {
    assert.ok(!/\p{Script=Han}/u.test(pieceTitle('en', piece.title)));
    assert.ok(/\p{Script=Han}/u.test(pieceTitle('zh', piece.title)));
  }
  assert.equal(pieceTitle('en', 'Kiss the Rain'), 'Kiss the Rain');
  assert.equal(translate('en', 'My own recording.mid'), 'My own recording.mid');
  assert.equal(translate('zh', '音量'), '音量');
});

test('All translated UI literals and MIDI validation messages have English entries', () => {
  const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 't' && ts.isStringLiteral(node.arguments[0])) {
      assert.ok(ENGLISH[node.arguments[0].text], `Missing translation: ${node.arguments[0].text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  const midi = ts.createSourceFile('score.ts', readFileSync(new URL('../lib/piano-score.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const check = node => {
    if (ts.isStringLiteral(node) && /\p{Script=Han}/u.test(node.text)) assert.ok(ENGLISH[node.text], node.text);
    ts.forEachChild(node, check);
  };
  check(midi);
});
