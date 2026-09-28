// Offline custody tool for a supervisor who already has lawful access to a source
// archive. Never extracts browser storage, assigns a company or writes to a DB.
import { createCipheriv, createDecipheriv, createHash, randomBytes, publicEncrypt, privateDecrypt } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function sealRecovery(bytes, recipientPublicKey) {
  const key=randomBytes(32), iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
  return {format:'marginflow-sealed-custody-v1',algorithm:'RSA-OAEP-SHA256/AES-256-GCM',
    key:publicEncrypt({key:recipientPublicKey,oaepHash:'sha256'},key).toString('base64'),
    iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')};
}
export function unsealRecovery(packet, supervisorPrivateKey) {
  if(packet.format!=='marginflow-sealed-custody-v1')throw new Error('Unknown sealed archive');
  const key=privateDecrypt({key:supervisorPrivateKey,oaepHash:'sha256'},Buffer.from(packet.key,'base64'));
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(packet.iv,'base64'));
  decipher.setAuthTag(Buffer.from(packet.tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(packet.ciphertext,'base64')),decipher.final()]);
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [mode,input,keyFile,output]=process.argv.slice(2);
  if(!['seal','unseal'].includes(mode)||!output)throw new Error('Usage: node scripts/sealed-recovery.mjs seal|unseal INPUT SUPERVISOR_KEY OUTPUT_NEW_FILE');
  const original=readFileSync(input), key=readFileSync(keyFile);
  const result=mode==='seal'?Buffer.from(JSON.stringify(sealRecovery(original,key))):unsealRecovery(JSON.parse(original),key);
  writeFileSync(output,result,{flag:'wx',mode:0o600});
  console.log(`Created new custody archive; input unchanged. Output SHA-256: ${createHash('sha256').update(result).digest('hex')}`);
}
