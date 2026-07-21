import { SDJwtVcInstance } from '@sd-jwt/sd-jwt-vc';
import { ES256, digest, generateSalt } from '@sd-jwt/crypto-nodejs';

const { privateKey, publicKey } = await ES256.generateKeyPair();

const sdjwt = new SDJwtVcInstance({
  signer: await ES256.getSigner(privateKey),
  verifier: await ES256.getVerifier(publicKey),
  signAlg: ES256.alg,
  hasher: digest,
  hashAlg: 'sha-256',
  saltGenerator: generateSalt,
});

const claims = {
  workerDID: 'did:key:zWorker',
  totalHours: 186,
  overtimeHours: 42,
  withinRBALimit: true,
  periodStart: '2026-08-01',
};

const credential = await sdjwt.issue(
  { iss: 'did:web:factory.example', iat: Math.floor(Date.now()/1000), vct: 'WorkingHoursCredential', ...claims },
  { _sd: ['totalHours', 'overtimeHours'] }
);
console.log('CREDENTIAL (truncated):', credential.slice(0,120), '...\n');

const presentation = await sdjwt.present(credential, { withinRBALimit: true, periodStart: true });
console.log('PRESENTATION discloses only selected claims\n');

const verified = await sdjwt.verify(presentation);
console.log('VERIFIED payload keys:', Object.keys(verified.payload));
console.log('totalHours present?', 'totalHours' in verified.payload);
console.log('withinRBALimit =', verified.payload.withinRBALimit);
