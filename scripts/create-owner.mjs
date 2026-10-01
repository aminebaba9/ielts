// node scripts/create-owner.mjs owner@example.com "Owner Name" --remote
// Creates a random 256-bit access code. The database only receives its digest.
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const args=process.argv.slice(2);
const email=(args[0]||'').trim().toLowerCase();
const name=(args[1]||'Owner').trim();
const mode=args.includes('--remote')?'--remote':args.includes('--local')?'--local':null;
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<2||name.length>120||!mode){
  console.error('Usage: node scripts/create-owner.mjs owner@example.com "Your Name" --remote');
  process.exit(2);
}
const code=randomBytes(32).toString('base64url');
const hash=createHash('sha256').update(code).digest('hex');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const sql=`INSERT INTO users(email,name,role,access_hash,active) VALUES(${quote(email)},${quote(name)},'owner',${quote(hash)},1);`;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const wrangler=path.join(root,'node_modules','wrangler','bin','wrangler.js');
// Call Wrangler's JavaScript entry through this Node executable; npm's
// .bin/wrangler shim is not directly executable with spawnSync on Windows.
const result=spawnSync(process.execPath,[wrangler,'d1','execute','ielts-members',mode,'--command',sql],{cwd:root,encoding:'utf8'});
if(result.error||result.status!==0){
 console.error(result.stderr||result.error?.message||'Could not create owner. Did you apply migrations and set the real D1 database ID?');
 process.exit(1);
}
console.log(`Owner email: ${email}\nYour private access code: ${code}\n\nSave this code in a secure place. It will not be shown again. Do NOT send it to customers or paste it into chat.`);
