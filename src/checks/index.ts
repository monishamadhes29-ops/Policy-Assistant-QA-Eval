import { citEligible, citQuote, citRequired } from './citations';
import { ctxEligible } from './context';
import { httpOutcome, shapeBody } from './contract';
import { factProhibited, factRequired } from './facts';
import { errProviderMap, genBudget, genNotCalled, latencyTimeout } from './resilience';
import type { Check } from './types';

export * from './types';

/** The single registry of checks. Adding or changing a check is a one-file change. */
export const ALL_CHECKS: Check[] = [
  httpOutcome,
  shapeBody,
  citEligible,
  citQuote,
  citRequired,
  ctxEligible,
  factRequired,
  factProhibited,
  errProviderMap,
  genBudget,
  genNotCalled,
  latencyTimeout,
];
