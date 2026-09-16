import { createClient } from '@libsql/client';
import { writeFileSync } from 'node:fs';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const out = process.argv[2];

const rows = [];
let offset = 0;
for (;;) {
  const res = await db.execute({
    sql: `select id, source_id, title, lifecycle, flat_share, group_id, payload
          from occurrences order by id limit 500 offset ?`,
    args: [offset],
  });
  if (res.rows.length === 0) break;
  for (const r of res.rows) {
    let p = {};
    try {
      p = JSON.parse(r.payload ?? '{}');
    } catch {
      p = {};
    }
    rows.push({
      id: r.id,
      sourceId: r.source_id,
      lifecycle: r.lifecycle,
      groupId: r.group_id,
      flatShareDb: r.flat_share,
      title: r.title ?? p.title ?? null,
      description: p.description ?? null,
      features: p.features ?? [],
      propertyType: p.propertyType ?? null,
    });
  }
  offset += res.rows.length;
}

// Les fiches agrégées : drapeaux stockés + critères du compte.
const listings = await db.execute(
  `select id, lifecycle, flat_share, student_only, matches_criteria, archived, rented
   from listings`,
);

writeFileSync(
  out,
  JSON.stringify({ occurrences: rows, listings: listings.rows.map((r) => ({ ...r })) }, null, 0),
);
console.log('occurrences:', rows.length, '| listings:', listings.rows.length);
