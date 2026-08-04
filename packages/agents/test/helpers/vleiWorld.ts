import {
  bootstrapEcosystem,
  type Ecosystem,
  type VleiPresentation,
  type VleiTrustContext,
} from '@eas/vlei';
import { createVleiIssuer, type VleiIssuer } from '@eas/issuer';

export const AGENT_DID = 'did:key:zBankAgent';

export interface VleiTestWorld {
  readonly eco: Ecosystem;
  readonly bank: VleiIssuer;
  readonly agentVlei: VleiPresentation;
  readonly trust: VleiTrustContext;
}

export async function setupVleiWorld(): Promise<VleiTestWorld> {
  const eco = bootstrapEcosystem();
  const bank = await createVleiIssuer({
    didWeb: 'did:web:bank.example',
    legalName: '國泰世華銀行',
    leiTag: 'BANKEXAMPLE',
    ecosystem: eco,
  });

  return { eco, bank, agentVlei: bank.grantAgentEcr(AGENT_DID), trust: eco.trust };
}
