/**
 * I2I（Issuer-to-Issuee）：權限是「指向」的，不是「宣稱」的。
 *
 * 林淦鈞在工作坊講的這個運算子是 vLEI 假冒不成立的核心：**一張憑證的核發者，必須就是
 * 它所指向的那張授權憑證的收受者。** 沒有這一條，任何人都可以在自己簽的憑證上掛一條
 * 邊，指向別人拿到的授權，然後宣稱自己有那個授權。
 *
 * 這個檔案要證明的是一件容易被誤解的事：**下面這個攻擊裡，每一張憑證的簽章都是真的。**
 * 攻擊者的 KEL 是真的、他的 TEL 是真的、他簽的 ECR 驗得過、他指向的那張法人憑證也是真的
 * 由 QVI 簽發、未撤銷。逐張驗證，每一張都成立；整條鏈仍然必須被拒絕。
 *
 * `@eas/vlei` 的實作叫 `CHAIN_ISSUER_MISMATCH`，語意就是 I2I，只是沒有用規格的名字。
 */
import { describe, expect, test } from 'vitest';
import {
  AI_AGENT_ROLE,
  CredentialRegistry,
  bootstrapEcosystem,
  createAid,
  issueAcdc,
  verifyAcdc,
  verifyEcrChain,
} from '@eas/vlei';

const AGENT_DID = 'did:key:zRogueAgent';

/**
 * A legal entity that really exists, and a second signer who really exists and
 * was never granted anything — the shape of every impersonation attempt.
 */
function world() {
  const eco = bootstrapEcosystem();
  const victim = eco.createLegalEntity({
    legalName: '正牌工廠',
    didWeb: 'did:web:factory.example',
    leiTag: 'FACTORYEXAMPLE',
    signingJwk: { kty: 'EC', crv: 'P-256', x: 'synthetic', y: 'synthetic' },
  });

  // A signer with a genuine KEL and registry in the same ecosystem. Nothing
  // about it is forged; it simply holds no authority.
  const rogue = createAid();
  eco.trust.kels.register(rogue.kel);
  const rogueRegistry = new CredentialRegistry(rogue);
  eco.trust.tels.register(rogueRegistry);

  return { eco, victim, rogue, rogueRegistry };
}

describe('I2I：核發者必須就是被指向那張授權的收受者', () => {
  test('an ECR whose le edge points at someone else’s credential is refused', () => {
    const { eco, victim, rogue, rogueRegistry } = world();

    // The rogue signs an ECR for its own agent and hangs it off the victim's
    // Legal Entity credential — claiming an authority it was never issued.
    const forged = issueAcdc({
      issuer: rogue,
      registry: rogueRegistry,
      schema: 'ecr',
      subject: AGENT_DID,
      claims: { LEI: victim.lei, agentDid: AGENT_DID, engagementContextRole: AI_AGENT_ROLE },
      edges: { le: { n: victim.credential.acdc.d, s: victim.credential.acdc.s } },
    });

    const verdict = verifyEcrChain(
      {
        focus: forged.acdc.d,
        credentials: { ...victim.presentation().credentials, [forged.acdc.d]: forged },
      },
      eco.trust,
    );

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failure).toBe('CHAIN_ISSUER_MISMATCH');
  });

  test('每一張憑證單獨看都是有效的——這才是重點', () => {
    const { eco, victim, rogue, rogueRegistry } = world();

    const forged = issueAcdc({
      issuer: rogue,
      registry: rogueRegistry,
      schema: 'ecr',
      subject: AGENT_DID,
      claims: { LEI: victim.lei, agentDid: AGENT_DID, engagementContextRole: AI_AGENT_ROLE },
      edges: { le: { n: victim.credential.acdc.d, s: victim.credential.acdc.s } },
    });

    // The forged ECR verifies on its own: real signature, real KEL, real TEL,
    // not revoked. So does the credential it points at. Signature checking
    // alone would admit this chain — the directionality is what rejects it.
    expect(verifyAcdc(forged, eco.trust).ok).toBe(true);
    expect(verifyAcdc(victim.credential, eco.trust).ok).toBe(true);
  });

  test('the same shape verifies when the issuer really is the issuee', () => {
    // Proves the refusal above is about direction and not about the fixture.
    const { eco, victim } = world();

    const verdict = verifyEcrChain(victim.grantEcr(AGENT_DID), eco.trust);

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.facts.agentDid).toBe(AGENT_DID);
  });

  test('the operator holds one hop further up, at the QVI edge', () => {
    // The workshop's example was QVI-B claiming QVI-A's authorization. Same
    // operator, one level higher: a Legal Entity credential must be issued by
    // the AID the QVI credential was issued *to*.
    const { eco, victim } = world();
    const chain = victim.presentation();
    const le = chain.credentials[chain.focus];

    expect(le).toBeDefined();
    const qviEdge = le!.acdc.e?.['qvi'] as { n: string };
    const qviCredential = chain.credentials[qviEdge.n];

    // The LE credential's issuer is exactly the QVI credential's subject.
    expect(le!.acdc.i).toBe(qviCredential!.acdc.a['i']);
  });
});
