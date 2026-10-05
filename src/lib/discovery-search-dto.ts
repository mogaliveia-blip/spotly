import { Timestamp } from 'firebase/firestore';
import { hasOnlyKeys, isRecord, isDiscoveryResultDto } from '../../functions/src/discovery-search-contract';
import type { DiscoveryResultDto, SearchDiscoveryResponse } from '../../functions/src/discovery-search-contract';

export type { TimestampDto, DiscoveryResultDto, SearchDiscoveryRequest, SearchDiscoveryResponse } from '../../functions/src/discovery-search-contract';
type DecodedResult<T extends DiscoveryResultDto> = T extends DiscoveryResultDto ?
  Omit<T, 'windowStartAt' | 'windowEndAt'> & { windowStartAt: Timestamp; windowEndAt: Timestamp } : never;
export type DiscoveryResult = DecodedResult<DiscoveryResultDto>;
export type DiscoverySearchResult = { results: DiscoveryResult[]; meta: SearchDiscoveryResponse['meta'] };

/** No Firebase app initialization, network access or React state in this decoder. */
export function decodeDiscoverySearchResponse(value: unknown): DiscoverySearchResult {
  const fail = (): never => { throw new Error('INVALID_DISCOVERY_RESPONSE'); };
  if (!isRecord(value) || !hasOnlyKeys(value, ['results', 'meta']) || !Array.isArray(value.results) ||
      value.results.length > 100 || !value.results.every(isDiscoveryResultDto) || !isRecord(value.meta) ||
      !hasOnlyKeys(value.meta, ['complete', 'truncated', 'partialFailure', 'returnedCount'])) return fail();
  const { complete, truncated, partialFailure, returnedCount } = value.meta;
  if (typeof complete !== 'boolean' || typeof truncated !== 'boolean' || typeof partialFailure !== 'boolean' ||
      returnedCount !== value.results.length || complete !== (!truncated && !partialFailure) ||
      new Set(value.results.map((result) => result.id)).size !== value.results.length) return fail();
  return {
    results: value.results.map((result) => ({
      ...result,
      position: { ...result.position },
      ...(result.tags === undefined ? {} : { tags: [...result.tags] }),
      windowStartAt: new Timestamp(result.windowStartAt.seconds, result.windowStartAt.nanoseconds),
      windowEndAt: new Timestamp(result.windowEndAt.seconds, result.windowEndAt.nanoseconds),
    })),
    meta: { complete, truncated, partialFailure, returnedCount: value.results.length },
  };
}
