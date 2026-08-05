/**
 * Cross-institution application-frequency monitor — 題05 Q3.
 *
 * "Automatically intercept anomalous patterns, e.g. one identity opening
 * several accounts at different institutions in a short window." That pattern
 * is the classic mule-account fingerprint. This is an anonymised counter keyed
 * by worker DID: a verifier learns "over the threshold or not", never a list of
 * where the applications went. No GNN required — a counter and a threshold is
 * what the prompt actually asks for.
 */

export interface ApplicationRisk {
  readonly count: number;
  readonly flagged: boolean;
}

export interface ApplicationMonitor {
  record(workerDid: string): void;
  risk(workerDid: string): ApplicationRisk;
}

export const DEFAULT_APPLICATION_THRESHOLD = 3;

export function createApplicationMonitor(
  options: { readonly threshold?: number } = {},
): ApplicationMonitor {
  const threshold = options.threshold ?? DEFAULT_APPLICATION_THRESHOLD;
  const counts = new Map<string, number>();

  return {
    record(workerDid) {
      counts.set(workerDid, (counts.get(workerDid) ?? 0) + 1);
    },
    risk(workerDid) {
      const count = counts.get(workerDid) ?? 0;
      return { count, flagged: count > threshold };
    },
  };
}
