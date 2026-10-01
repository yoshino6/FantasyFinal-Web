import type { AdvancedProfessionPreview } from './advanced-profession-api';

export function selectAdvancedCandidateCode(
  candidateCodes: readonly string[],
  preferredCodes: readonly (string | null | undefined)[]
): string {
  const available = new Set(candidateCodes);
  return preferredCodes.find((code): code is string => Boolean(code && available.has(code)))
    ?? candidateCodes[0] ?? '';
}

export function advancedQuoteRemainingMs(
  quote: Pick<AdvancedProfessionPreview, 'expiresAt' | 'serverTime'>,
  elapsedSinceReceivedMs: number
): number {
  const expiresAt = Date.parse(quote.expiresAt);
  const serverTime = Date.parse(quote.serverTime);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(serverTime)) return 0;
  return Math.max(0, expiresAt - serverTime - Math.max(0, elapsedSinceReceivedMs));
}
