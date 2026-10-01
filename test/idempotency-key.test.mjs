import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { createIdempotencyKey } from '../src/idempotency-key.ts';

test('HTTP fallback produces unique UUIDs without randomUUID', () => {
  const source = { getRandomValues: values => webcrypto.getRandomValues(values) };
  const keys = Array.from({ length: 1000 }, () => createIdempotencyKey(source));
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('native UUID generator retains its Crypto receiver', () => {
  const source = {
    getRandomValues: values => values,
    randomUUID() { assert.equal(this, source); return 'native-key'; }
  };
  assert.equal(createIdempotencyKey(source), 'native-key');
});

test('missing secure random source reports a recoverable browser error', () => {
  assert.throws(() => createIdempotencyKey({}), /浏览器暂不支持安全随机数/);
});
