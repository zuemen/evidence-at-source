/**
 * Judge-facing runnable evidence for the vLEI trust layer.
 *
 * Pure function: builds a synthetic ecosystem, walks every claim the project
 * makes about it — chain verification, tamper detection, role enforcement,
 * single revocation, QVI cascade, foreign-root rejection — and returns a
 * structured report. The CLI wrapper prints; this file only proves.
 */

import {
  bootstrapEcosystem,
  exportChainArtifacts,
  importVerifierContext,
  isValidLei,
  verifyEcrChain,
  verifyLeChain,
  type SignedAcdc,
  type VleiPresentation,
} from '../src/index.js';

export interface DemoStep {
  readonly label: string;
  readonly expected: string;
  readonly actual: string;
  readonly pass: boolean;
}

export interface DemoReport {
  readonly steps: readonly DemoStep[];
  readonly allPass: boolean;
}

const JWK = { kty: 'EC', crv: 'P-256', x: 'synthetic-x', y: 'synthetic-y' };

function step(label: string, expected: string, actual: string): DemoStep {
  return { label, expected, actual, pass: expected === actual };
}

function outcome(verdict: { ok: boolean; failure?: string }): string {
  return verdict.ok ? 'ok' : (verdict.failure ?? 'unknown');
}

export function runVleiDemo(): DemoReport {
  const steps: DemoStep[] = [];

  // 1 — GLEIF root of trust and a qualified QVI come up together.
  const eco = bootstrapEcosystem();
  steps.push(step('GLEIF 信任根為自我定址 AID（SAID）', 'E', eco.gleifAid.slice(0, 1)));

  // 2 — Two legal entities receive LE vLEI credentials from the QVI.
  const factory = eco.createLegalEntity({
    legalName: '工廠打卡系統',
    didWeb: 'did:web:factory.example',
    leiTag: 'FACTORYEXAMPLE',
    signingJwk: JWK,
  });
  const bank = eco.createLegalEntity({
    legalName: '國泰世華銀行',
    didWeb: 'did:web:bank.example',
    leiTag: 'BANKEXAMPLE',
    signingJwk: JWK,
  });
  steps.push(
    step(
      '法人 LEI 檢查碼合法（ISO 17442 mod 97-10）',
      'true',
      String(isValidLei(factory.lei) && isValidLei(bank.lei)),
    ),
  );

  // 3 — Chain verification walks every hop back to the GLEIF root.
  const agentChain = bank.grantEcr('did:key:zBankAgent');
  steps.push(
    step('LE 鏈驗證通過（工廠）', 'ok', outcome(verifyLeChain(factory.presentation(), eco.trust))),
  );
  steps.push(
    step('ECR 鏈驗證通過（銀行 Agent）', 'ok', outcome(verifyEcrChain(agentChain, eco.trust))),
  );

  // 3b — The root itself is threshold multisig, like GLEIF's council-held root.
  steps.push(
    step(
      '信任根為門檻多簽',
      '2-of-3',
      `${eco.gleifKeyState.threshold}-of-${eco.gleifKeyState.keys.length}`,
    ),
  );

  // 3c — The presentation travels as one self-contained bundle; the verifier
  // rebuilds stores from the wire and only pins the root out-of-band.
  const wire = exportChainArtifacts(agentChain, eco.trust);
  const far = importVerifierContext(wire, eco.trust.trustedRoots);
  steps.push(
    step('可攜出示包跨驗證方驗證', 'ok', outcome(verifyEcrChain(far.presentation, far.trust))),
  );

  const wireTampered = JSON.parse(wire) as {
    presentation: {
      focus: string;
      credentials: Record<string, { acdc: { a: Record<string, unknown> } }>;
    };
  };
  wireTampered.presentation.credentials[wireTampered.presentation.focus]!.acdc.a['agentDid'] =
    'did:key:zEvilAgent';
  const farTampered = importVerifierContext(JSON.stringify(wireTampered), eco.trust.trustedRoots);
  steps.push(
    step(
      '可攜出示包線上竄改被攔截',
      'SAID_MISMATCH',
      outcome(verifyEcrChain(farTampered.presentation, farTampered.trust)),
    ),
  );

  // 4 — Tampering with one attribute breaks the SAID and is caught.
  const focus = agentChain.credentials[agentChain.focus] as SignedAcdc;
  const forged: VleiPresentation = {
    focus: agentChain.focus,
    credentials: {
      ...agentChain.credentials,
      [agentChain.focus]: {
        ...focus,
        acdc: { ...focus.acdc, a: { ...focus.acdc.a, agentDid: 'did:key:zEvilAgent' } },
      },
    },
  };
  steps.push(
    step('竄改 ECR 內容被攔截', 'SAID_MISMATCH', outcome(verifyEcrChain(forged, eco.trust))),
  );

  // 5 — A role the verifier did not ask for is refused.
  const wrongRole = bank.grantEcr('did:key:zCoffeeAgent', 'coffee-runner');
  steps.push(
    step('非查驗角色被攔截', 'ROLE_MISMATCH', outcome(verifyEcrChain(wrongRole, eco.trust))),
  );

  // 6 — Revoking one ECR kills that agent only; the legal entity survives.
  const doomed = bank.grantEcr('did:key:zTempAgent');
  bank.revokeEcr('did:key:zTempAgent');
  steps.push(
    step('單一 ECR 撤銷即失效', 'REGISTRY_REVOKED', outcome(verifyEcrChain(doomed, eco.trust))),
  );
  steps.push(
    step('ECR 撤銷不影響法人本身', 'true', String(verifyLeChain(bank.presentation(), eco.trust).ok)),
  );

  // 7 — GLEIF revokes the QVI: everything downstream collapses at once.
  eco.revokeQviCredential();
  steps.push(
    step(
      'QVI 撤銷 → 法人鏈級聯失效',
      'REGISTRY_REVOKED',
      outcome(verifyLeChain(factory.presentation(), eco.trust)),
    ),
  );
  steps.push(
    step(
      'QVI 撤銷 → Agent 鏈級聯失效',
      'REGISTRY_REVOKED',
      outcome(verifyEcrChain(agentChain, eco.trust)),
    ),
  );

  // 8 — A chain anchored in someone else's root is worthless here.
  const foreign = bootstrapEcosystem();
  const foreignBank = foreign.createLegalEntity({
    legalName: '外來生態系銀行',
    didWeb: 'did:web:bank.example',
    leiTag: 'FOREIGNEXAMPLE',
    signingJwk: JWK,
  });
  steps.push(
    step(
      '外來信任根被拒（非我方 GLEIF）',
      'false',
      String(verifyEcrChain(foreignBank.grantEcr('did:key:zBankAgent'), eco.trust).ok),
    ),
  );

  return { steps, allPass: steps.every((entry) => entry.pass) };
}
