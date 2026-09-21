'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { csvRows } = require('../src/parsers/ucdpParser');

/** Feed a string through the parser in fixed-size chunks. */
function parse(csv, chunkSize = csv.length) {
  const rows = [];
  const p = csvRows(r => rows.push([...r]));
  for (let i = 0; i < csv.length; i += chunkSize) p.write(csv.slice(i, i + chunkSize));
  p.end();
  return rows;
}

test('parses plain rows', () => {
  assert.deepStrictEqual(parse('a,b,c\n1,2,3\n'), [['a', 'b', 'c'], ['1', '2', '3']]);
});

test('quoted fields may contain commas and newlines', () => {
  const rows = parse('id,note\n1,"line one\nline two, with comma"\n');
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[1][1], 'line one\nline two, with comma');
});

test('doubled quotes are unescaped', () => {
  assert.strictEqual(parse('a\n"he said ""hi"""\n')[1][0], 'he said "hi"');
});

test('state survives chunk boundaries at every offset', () => {
  const csv = 'id,country,best,note\r\n'
            + '1,"DR Congo (Zaire)",12,"line one\nline two, with comma"\n'
            + '2,Mali,3,"he said ""hi"""\n';
  const whole = parse(csv);
  for (let size = 1; size <= 12; size++) {
    assert.deepStrictEqual(parse(csv, size), whole, `chunk size ${size} changed the result`);
  }
  assert.strictEqual(whole.length, 3);
  assert.strictEqual(whole[1][1], 'DR Congo (Zaire)');
});

test('CRLF line endings are handled', () => {
  assert.deepStrictEqual(parse('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});

test('a final row without a trailing newline is emitted', () => {
  assert.deepStrictEqual(parse('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('empty fields are preserved, not skipped', () => {
  assert.deepStrictEqual(parse('a,,c\n')[0], ['a', '', 'c']);
});
