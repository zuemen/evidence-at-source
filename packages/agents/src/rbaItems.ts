/**
 * RBA item classification — 題06 Q3.
 *
 * "Which RBA audit items can be answered by a yes/no verifiable credential, and
 * which must stay a human on-site inspection?" Making the split explicit lets an
 * agent answer "this one needs an on-site audit" specifically, instead of a
 * generic refusal. It is also an honesty claim in code: the system states what
 * it cannot replace, and an unlisted item is UNKNOWN rather than answerable.
 */

export type RbaItemClass = 'CREDENTIAL_ANSWERABLE' | 'REQUIRES_ON_SITE';

export const RBA_ITEM_CLASSIFICATION: Readonly<Record<string, RbaItemClass>> = {
  // Answerable: a signed, counter-signed conclusion carries the whole fact.
  workingHoursWithinLimit: 'CREDENTIAL_ANSWERABLE',
  passportHeldByWorker: 'CREDENTIAL_ANSWERABLE',
  recruitmentFeeWithinLegalCap: 'CREDENTIAL_ANSWERABLE',
  contractNativeLanguageProvided: 'CREDENTIAL_ANSWERABLE',
  // On-site only: no boolean can honestly stand in for walking the floor.
  fireSafetyConditions: 'REQUIRES_ON_SITE',
  dormitoryLivingConditions: 'REQUIRES_ON_SITE',
  machineGuardingSafety: 'REQUIRES_ON_SITE',
  hazardousChemicalHandling: 'REQUIRES_ON_SITE',
  grievanceMechanismEffectiveness: 'REQUIRES_ON_SITE',
};

export function classifyRbaItem(item: string): RbaItemClass | 'UNKNOWN' {
  return RBA_ITEM_CLASSIFICATION[item] ?? 'UNKNOWN';
}
