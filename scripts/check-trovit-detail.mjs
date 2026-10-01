import fs from 'node:fs';

async function checkDetailPage() {
  const url =
    'https://immo.trovit.fr/detail/trovit-FR-9000001789470530195?trovit_type=2&search_terms=nice';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('Detail status:', res.status);
  const html = await res.text();
  fs.writeFileSync('trovit-detail.html', html);
  console.log('Detail length:', html.length);
  const outMatches = [
    ...html.matchAll(/href="([^"]*(?:thribee|redirect|origin|source)[^"]*)"/gi),
  ].map((m) => m[1]);
  console.log('Detail out matches:', outMatches);
  const mentions = [
    ...html.matchAll(/(?:sur|source|partenaire|annonceur)\s*[:]?\s*<[^>]+>([^<]+)</gi),
  ].map((m) => m[1]);
  console.log('Detail mentions:', mentions);
}

checkDetailPage();
