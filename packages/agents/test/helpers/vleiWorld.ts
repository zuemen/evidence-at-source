import {
  bootstrapEcosystem,
  type Ecosystem,
  type VleiPresentation,
  type VleiTrustContext,
} from '@eas/vlei';
import { createVleiIssuer, type IssuerOptions, type VleiIssuer } from '@eas/issuer';
import { requireIssuerSigningKey, type IssuerSigningKey } from '@eas/agents';

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

export interface IssuerPairWorld {
  readonly eco: Ecosystem;
  readonly factory: VleiIssuer;
  readonly factoryKey: IssuerSigningKey;
  readonly bank: VleiIssuer;
  readonly bankKey: IssuerSigningKey;
}

/**
 * Two legal entities under one root, for the cross-issuer scenarios: the whole
 * point of reconciliation is that the factory cannot alter what the bank signed,
 * so they must be distinct entities whose chains both verify to the same GLEIF
 * root.
 */
export async function setupIssuerPairWorld(): Promise<IssuerPairWorld> {
  const eco = bootstrapEcosystem();
  const factory = await createVleiIssuer({
    didWeb: 'did:web:factory.example',
    legalName: '工廠打卡系統',
    leiTag: 'FACTORYEXAMPLE',
    ecosystem: eco,
  });
  const bank = await createVleiIssuer({
    didWeb: 'did:web:bank.example',
    legalName: '國泰世華銀行',
    leiTag: 'BANKEXAMPLE',
    ecosystem: eco,
  });

  return {
    eco,
    factory,
    factoryKey: requireIssuerSigningKey(factory.legalEntityPresentation(), eco.trust),
    bank,
    bankKey: requireIssuerSigningKey(bank.legalEntityPresentation(), eco.trust),
  };
}

export interface IssuerWorld {
  readonly eco: Ecosystem;
  readonly issuer: VleiIssuer;
  /** The issuer's signing key, admitted through its Legal Entity chain. */
  readonly issuerKey: IssuerSigningKey;
}

/**
 * A factory issuer with a real vLEI chain behind it. Tests that only care about
 * expiry, revocation or tier still have to go through the chain, because layer 1
 * has no other way in — which is the point.
 */
export async function setupIssuerWorld(options?: IssuerOptions): Promise<IssuerWorld> {
  const eco = bootstrapEcosystem();
  const issuer = await createVleiIssuer({
    didWeb: 'did:web:factory.example',
    legalName: '工廠打卡系統',
    leiTag: 'FACTORYEXAMPLE',
    ecosystem: eco,
    ...(options === undefined ? {} : { options }),
  });

  return {
    eco,
    issuer,
    issuerKey: requireIssuerSigningKey(issuer.legalEntityPresentation(), eco.trust),
  };
}
