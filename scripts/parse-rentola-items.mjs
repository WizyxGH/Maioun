import fs from 'node:fs';

const html = fs.readFileSync('rentola-nice.html', 'utf8');
const jsonLd = [
  ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
].map((m) => m[1]);

console.log('Rentola jsonLd count:', jsonLd.length);
for (let i = 0; i < jsonLd.length; i++) {
  try {
    const data = JSON.parse(jsonLd[i]);
    console.log(`Script ${i} type:`, data['@type']);
    if (data['@type'] === 'SearchResultsPage' && data.mainEntity?.itemListElement) {
      const items = data.mainEntity.itemListElement;
      console.log('Found Rentola items count:', items.length);
      console.log('First Rentola item:');
      console.log(JSON.stringify(items[0], null, 2));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}
