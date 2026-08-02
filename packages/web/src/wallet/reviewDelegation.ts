/**
 * The worker's side of the double authorization.
 *
 * The institution sets the upper bound (an agent may only do what its delegation
 * grants). This is where the lower bound lives: the worker's wallet independently
 * verifies the agent's delegation and shows the worker its scope, so the worker
 * can decide whether to disclose at all. If the delegation is invalid, expired or
 * revoked, there is nothing to decide — the wallet offers no disclosure.
 */

import { verifyDelegationValidity, type DelegationValidityInput } from '@eas/agents';
import type { AllowedQueryType, ReasonCode } from '@eas/shared';

export interface CredentialScopeFlag {
  readonly type: string;
  readonly inScope: boolean;
}

export type WalletDelegationView =
  | {
      readonly status: 'authorized';
      readonly canDisclose: true;
      readonly principal: string;
      readonly principalName: string;
      readonly purpose: string;
      readonly allowedQueryTypes: readonly AllowedQueryType[];
      readonly scope: readonly string[];
      readonly expiresAt: number;
      readonly remainingSeconds: number;
      readonly credentialsInScope: readonly CredentialScopeFlag[];
    }
  | { readonly status: 'refused'; readonly canDisclose: false; readonly reason: ReasonCode };

export interface WalletReviewOptions {
  readonly knownInstitutions: DelegationValidityInput['knownInstitutions'];
  readonly revocations?: DelegationValidityInput['revocations'];
  /** Credential types the worker holds and might disclose. */
  readonly heldCredentialTypes: readonly string[];
}

export async function reviewDelegationForWallet(
  signedDelegation: string | null,
  options: WalletReviewOptions,
): Promise<WalletDelegationView> {
  const validity = await verifyDelegationValidity({
    signedDelegation,
    knownInstitutions: options.knownInstitutions,
    ...(options.revocations === undefined ? {} : { revocations: options.revocations }),
  });

  if (!validity.ok) {
    return { status: 'refused', canDisclose: false, reason: validity.reason };
  }

  const { claims } = validity;
  const nowSeconds = Math.floor(Date.now() / 1000);

  return {
    status: 'authorized',
    canDisclose: true,
    principal: claims.principal,
    principalName: claims.principalName,
    purpose: claims.purpose,
    allowedQueryTypes: claims.allowedQueryTypes,
    scope: claims.scope,
    expiresAt: claims.exp,
    remainingSeconds: Math.max(0, claims.exp - nowSeconds),
    credentialsInScope: options.heldCredentialTypes.map((type) => ({
      type,
      inScope: claims.scope.includes(type),
    })),
  };
}
