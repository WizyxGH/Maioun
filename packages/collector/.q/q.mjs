import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
for (const line of readFileSync('../../.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '');
}
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
console.log(JSON.stringify((await db.execute(process.argv[2])).rows, null, 1));
