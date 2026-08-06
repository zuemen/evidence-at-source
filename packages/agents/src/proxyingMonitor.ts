/**
 * Shared-device detection — the observable half of 題05 Q2.
 *
 * The prompt asks whether a system can verify "this is the worker's own will,
 * not coerced and not done for them by an agent". The coercion half is not
 * answerable: a threat does not stop a fingerprint from working, and any
 * system claiming to detect it is lying. The 代辦 half is answerable, because
 * it leaves a trace — one phone in a broker's hand counter-signing for worker
 * after worker.
 *
 * Every attestation already carries a device fingerprint. Counting distinct
 * workers per device turns that into a signal at no privacy cost: the verifier
 * learns "this device signed for more people than a personal device should",
 * never who they were. Like the application monitor, the output is a flag for
 * a human reviewer and decides nothing on its own.
 */

export interface ProxyingRisk {
  /** How many distinct workers this device has counter-signed for. */
  readonly workerCount: number;
  readonly flagged: boolean;
}

export interface ProxyingMonitor {
  record(deviceFingerprint: string, workerDid: string): void;
  risk(deviceFingerprint: string): ProxyingRisk;
}

/**
 * A shared family phone is ordinary; a device signing for four unrelated
 * workers is not. Set deliberately above household plausibility so that the
 * flag means something when it fires.
 */
export const DEFAULT_SHARED_DEVICE_THRESHOLD = 3;

export function createProxyingMonitor(
  options: { readonly threshold?: number } = {},
): ProxyingMonitor {
  const threshold = options.threshold ?? DEFAULT_SHARED_DEVICE_THRESHOLD;
  const workersByDevice = new Map<string, Set<string>>();

  return {
    record(deviceFingerprint, workerDid) {
      const workers = workersByDevice.get(deviceFingerprint) ?? new Set<string>();
      workers.add(workerDid);
      workersByDevice.set(deviceFingerprint, workers);
    },

    risk(deviceFingerprint) {
      const workerCount = workersByDevice.get(deviceFingerprint)?.size ?? 0;

      return { workerCount, flagged: workerCount > threshold };
    },
  };
}
