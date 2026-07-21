import { SDJwtVcInstance } from '@sd-jwt/sd-jwt-vc';
import { ES256, digest, generateSalt } from '@sd-jwt/crypto-nodejs';
import { SignJWT, jwtVerify, importJWK } from 'jose';
import { createHash } from 'crypto';

const sha256 = s => createHash('sha256').update(s).digest('base64url');

const factory = await ES256.generateKeyPair();
const worker  = await ES256.generateKeyPair();

const sdjwt = new SDJwtVcInstance({
  signer: await ES256.getSigner(factory.privateKey),
  verifier: await ES256.getVerifier(factory.publicKey),
  signAlg: ES256.alg, hasher: digest, hashAlg: 'sha-256', saltGenerator: generateSalt,
});

// 1) Employer issues the credential
const employerCred = await sdjwt.issue(
  { iss:'did:web:factory.example', iat:(Date.now()/1e3|0), vct:'WorkingHoursCredential',
    workerDID:'did:key:zWorker', totalHours:186, overtimeHours:42, withinRBALimit:true },
  { _sd:['totalHours','overtimeHours'] }
);

// 2) Worker counter-signs an attestation pointing at the hash of the employer credential
const credHash = sha256(employerCred);
const wKey = await importJWK(worker.privateKey, 'ES256');
const attestation = await new SignJWT({
    subjectCredentialHash: credHash,
    workerDID: 'did:key:zWorker',
    attestedAt: new Date().toISOString(),
    deviceFingerprint: 'sha256:abc123',
  })
  .setProtectedHeader({ alg:'ES256', typ:'worker-attestation+jwt' })
  .setIssuer('did:key:zWorker')
  .sign(wKey);

// 3) Verifier checks the pairing
const wPub = await importJWK(worker.publicKey, 'ES256');
const { payload: att } = await jwtVerify(attestation, wPub);
const pairingValid = att.subjectCredentialHash === sha256(employerCred);
console.log('勞工簽章有效:', true);
console.log('配對雜湊相符:', pairingValid);

// 4) Tampering test: the factory rewrites the data after the fact
const tampered = await sdjwt.issue(
  { iss:'did:web:factory.example', iat:(Date.now()/1e3|0), vct:'WorkingHoursCredential',
    workerDID:'did:key:zWorker', totalHours:150, overtimeHours:10, withinRBALimit:true },
  { _sd:['totalHours','overtimeHours'] }
);
console.log('篡改後配對是否仍成立:', att.subjectCredentialHash === sha256(tampered), '← 應為 false');
