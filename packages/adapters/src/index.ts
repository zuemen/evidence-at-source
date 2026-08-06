/**
 * The boundary between a real source system and this project's credentials.
 *
 * Nothing here is connected to anything: there is no factory clock, no agency
 * billing system and no immigration feed behind these types. What the module
 * fixes is the *shape* the connection would have to take, because the shape is
 * the argument.
 *
 * An adapter maps one event that already happened into the claims an issuer
 * would sign. It is a pure function. It cannot fetch, and that is deliberate:
 * an adapter that could query would let the factory choose what to hand over
 * and when, which is precisely the failure this project exists to remove. The
 * source pushes the fact at the moment it occurs, or there is no evidence.
 *
 * Three things an adapter still cannot do, by construction:
 *
 *   - **Issue.** It returns claims. Signing needs the issuer's key, and that
 *     key is only obtainable through a verified vLEI chain.
 *   - **Make anything count.** An issued credential is worth nothing until the
 *     worker counter-signs it.
 *   - **Widen a credential.** Any field the disclosure schema does not list is
 *     refused, because an unlisted field is a published field.
 */

import { getCredentialSchema, type CredentialType } from '@eas/shared';

/** Systems that would sit upstream of the four credentials. */
export type SourceSystem = 'factory-clock' | 'agency-billing' | 'immigration-status';

/** An event as the source system already knows it, at the moment it happens. */
export interface SourceEvent {
  readonly source: SourceSystem;
  /** The facility the source system speaks for. */
  readonly facilityId: string;
  /** The source system's own identifier for the worker — never a DID. */
  readonly workerRef: string;
  readonly occurredAt: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface AdapterConfig {
  /** The one facility this deployment may emit evidence for. */
  readonly facilityId: string;
  /**
   * Source reference → worker DID. Injected rather than looked up: an adapter
   * that could resolve arbitrary references would be a directory of workers,
   * and this one is not allowed to learn about anybody but the subject of the
   * event in front of it.
   */
  readonly workerDirectory: Readonly<Record<string, string>>;
  /**
   * The buyer's monthly hour ceiling. Policy, not physics — different RBA
   * programmes draw the line differently, so it belongs in configuration
   * where it can be audited, not in a constant nobody reviews.
   */
  readonly rbaMonthlyHourLimit: number;
  /** Statutory cap on recruitment fees, in the currency the agency bills in. */
  readonly recruitmentFeeLegalCap: number;
}

export type AdapterRejection =
  | 'SOURCE_FACILITY_MISMATCH'
  | 'WORKER_REF_UNMAPPED'
  | 'SOURCE_FIELD_MISSING'
  | 'SOURCE_FIELD_NOT_IN_SCHEMA';

export type AdapterOutcome =
  | {
      readonly kind: 'ISSUE';
      readonly type: CredentialType;
      readonly claims: Readonly<Record<string, unknown>>;
    }
  | { readonly kind: 'REVOKE_SUBJECT'; readonly workerDID: string; readonly reason: string }
  | { readonly kind: 'NO_ACTION' }
  | { readonly kind: 'REJECTED'; readonly reason: AdapterRejection };

/**
 * The issuer adds these at signing time and derives them from the claims. An
 * adapter supplying them could bind a credential to figures it does not carry.
 */
const ISSUER_OWNED = ['valueCommitment', 'commitmentSalt'] as const;

/**
 * `workerDID` is in every credential but in no schema's disclosure lists,
 * because it is neither a conclusion nor a raw figure — it is who the
 * credential is about.
 */
const ALWAYS_ALLOWED = ['workerDID'] as const;

/**
 * Anything the schema does not list as hidden ends up public in the issued
 * credential. So a claim the schema has never heard of is not a harmless
 * extra: it is a leak with no review step. Refusing it here is what keeps a
 * future adapter from publishing a supervisor's free-text note.
 */
export function claimsWithinSchema(
  type: CredentialType,
  claims: Readonly<Record<string, unknown>>,
): 'OK' | 'SOURCE_FIELD_NOT_IN_SCHEMA' {
  const schema = getCredentialSchema(type);
  const allowed = new Set<string>([...schema.public, ...schema.hidden, ...ALWAYS_ALLOWED]);

  for (const owned of ISSUER_OWNED) allowed.delete(owned);

  return Object.keys(claims).every((field) => allowed.has(field))
    ? 'OK'
    : 'SOURCE_FIELD_NOT_IN_SCHEMA';
}

function requireFields(
  fields: Readonly<Record<string, unknown>>,
  required: readonly string[],
): boolean {
  return required.every((field) => fields[field] !== undefined);
}

function issue(
  type: CredentialType,
  claims: Readonly<Record<string, unknown>>,
): AdapterOutcome {
  return claimsWithinSchema(type, claims) === 'OK'
    ? { kind: 'ISSUE', type, claims }
    : { kind: 'REJECTED', reason: 'SOURCE_FIELD_NOT_IN_SCHEMA' };
}

/**
 * Maps one source event to one outcome. Same event in, same outcome out —
 * there is no clock, no network and no state anywhere in this function.
 */
export function adaptSourceEvent(event: SourceEvent, config: AdapterConfig): AdapterOutcome {
  if (event.facilityId !== config.facilityId) {
    return { kind: 'REJECTED', reason: 'SOURCE_FACILITY_MISMATCH' };
  }

  const workerDID = config.workerDirectory[event.workerRef];
  if (workerDID === undefined) return { kind: 'REJECTED', reason: 'WORKER_REF_UNMAPPED' };

  const f = event.fields;

  switch (event.source) {
    case 'factory-clock': {
      if (!requireFields(f, ['totalHours', 'overtimeHours', 'periodStart'])) {
        return { kind: 'REJECTED', reason: 'SOURCE_FIELD_MISSING' };
      }

      return issue('WorkingHoursCredential', {
        workerDID,
        withinRBALimit: Number(f['totalHours']) <= config.rbaMonthlyHourLimit,
        periodStart: f['periodStart'],
        totalHours: f['totalHours'],
        overtimeHours: f['overtimeHours'],
      });
    }

    case 'agency-billing': {
      if (!requireFields(f, ['feeAmount', 'currency', 'contractPeriod'])) {
        return { kind: 'REJECTED', reason: 'SOURCE_FIELD_MISSING' };
      }

      return issue('RecruitmentFeeCredential', {
        workerDID,
        feeWithinLegalCap: Number(f['feeAmount']) <= config.recruitmentFeeLegalCap,
        currency: f['currency'],
        contractPeriod: f['contractPeriod'],
        feeAmount: f['feeAmount'],
        paymentSchedule: f['paymentSchedule'],
        lenderName: f['lenderName'],
      });
    }

    case 'immigration-status': {
      if (!requireFields(f, ['status'])) {
        return { kind: 'REJECTED', reason: 'SOURCE_FIELD_MISSING' };
      }

      const status = String(f['status']);

      // Only the two statuses that end a worker's presence produce an action.
      // Everything else is a status change this system has no business acting
      // on — silence is the correct output, not a credential nobody asked for.
      return status === 'DEPARTED' || status === 'PERMIT_TERMINATED'
        ? { kind: 'REVOKE_SUBJECT', workerDID, reason: status }
        : { kind: 'NO_ACTION' };
    }
  }
}
