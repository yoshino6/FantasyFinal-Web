import assert from 'node:assert/strict';
import test from 'node:test';
import { advancedQuoteRemainingMs, selectAdvancedCandidateCode } from '../src/advanced-profession-ui.ts';

test('world tree selection skips legacy and hidden professions absent from public candidates', () => {
  const candidates = ['bulwark_guard', 'war_lord'];
  assert.equal(selectAdvancedCandidateCode(candidates,
    ['', 'spirit_summoner', 'sword_shadow']), 'bulwark_guard');
  assert.equal(selectAdvancedCandidateCode(candidates,
    ['war_lord', 'spirit_summoner']), 'war_lord');
  assert.equal(selectAdvancedCandidateCode([], ['sword_shadow']), '');
});

test('quote lifetime follows server time and elapsed duration, regardless of device wall clock', () => {
  const quote = {
    serverTime: '2026-09-29T00:00:00.000Z',
    expiresAt: '2026-09-29T00:02:00.000Z'
  };
  assert.equal(advancedQuoteRemainingMs(quote, 0), 120_000);
  assert.equal(advancedQuoteRemainingMs(quote, 90_000), 30_000);
  assert.equal(advancedQuoteRemainingMs(quote, 120_000), 0);
  assert.equal(advancedQuoteRemainingMs(quote, 150_000), 0);
});
