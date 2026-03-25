import test from 'node:test';
import assert from 'node:assert';
import { Utils } from '../utils.ts';

test('Utils.parseQueryString', async (t) => {
  await t.test('parses basic query parameters', () => {
    assert.deepStrictEqual(Utils.parseQueryString('https://example.com?a=1&b=2'), { a: '1', b: '2' });
  });

  await t.test('handles empty query string', () => {
    assert.deepStrictEqual(Utils.parseQueryString('https://example.com'), {});
    assert.deepStrictEqual(Utils.parseQueryString('https://example.com?'), {});
  });

  await t.test('handles URL-encoded values', () => {
    assert.deepStrictEqual(Utils.parseQueryString('https://example.com?message=Hello%20World&symbol=%24'), { message: 'Hello World', symbol: '$' });
  });

  await t.test('handles parameters without values', () => {
    assert.deepStrictEqual(Utils.parseQueryString('https://example.com?flag=&another'), { flag: '', another: '' });
  });

  await t.test('handles duplicate parameters by overwriting with the last value', () => {
    assert.deepStrictEqual(Utils.parseQueryString('https://example.com?a=1&a=2'), { a: '2' });
  });

  await t.test('handles string starting with ? instead of full URL', () => {
    assert.deepStrictEqual(Utils.parseQueryString('?a=1&b=2'), { a: '1', b: '2' });
  });
});
