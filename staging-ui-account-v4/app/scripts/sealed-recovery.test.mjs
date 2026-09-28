import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync} from 'node:crypto';
import {sealRecovery,unsealRecovery} from './sealed-recovery.mjs';
test('supervised ambiguous archive preserves original bytes without plaintext exposure',()=>{
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const original=Buffer.from('{ "id":"unattributed-fictional", "revision":3, "syncRetryContext":null }');
 const packet=sealRecovery(original,publicKey);
 assert.ok(!JSON.stringify(packet).includes('unattributed-fictional'));
 assert.deepEqual(unsealRecovery(packet,privateKey),original);
 const bad={...packet,ciphertext:Buffer.from('corrupted').toString('base64')};
 assert.throws(()=>unsealRecovery(bad,privateKey));
 const other=generateKeyPairSync('rsa',{modulusLength:2048});assert.throws(()=>unsealRecovery(packet,other.privateKey));
});
