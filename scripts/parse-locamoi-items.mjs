import fs from 'node:fs';

const html = fs.readFileSync('locamoi-nice.html', 'utf8');
const jsonLd = [
  ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
].map((m) => m[1]);

for (const raw of jsonLd) {
  try {
    const data = JSON.parse(raw);
    if (data['@type'] === 'SearchResultsPage' && data.mainEntity?.itemListElement) {
      const items = data.mainEntity.itemListElement;
      console.log('Found Locamoi items count:', items.length);
      console.log('First 2 items:');
      console.log(JSON.stringify(items.slice(0, 2), null, 2));
    }
  } catch (e) {
    console.log('Error parsing JSON-LD:', e.message);
  }
}
