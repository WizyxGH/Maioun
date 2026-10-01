import fs from 'node:fs';

const html = fs.readFileSync('trovit-sample.html', 'utf8');

const matches = [
  ...html.matchAll(/class="date-publisher-wrapper-agency"[^>]*>\s*<small>([^<]+)<\/small>/gi),
].map((m) => m[1].trim());
console.log('Agencies/Publishers found in page 1:', [...new Set(matches)]);

async function scanMorePages() {
  const allPublishers = new Set(matches);
  for (let page = 1; page <= 10; page++) {
    const url = `https://immo.trovit.fr/index.php/cod.search_homes/what_d.Nice/type.2/order_by.date/page.${page}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.status === 200) {
        const text = await res.text();
        const pageMatches = [
          ...text.matchAll(
            /class="date-publisher-wrapper-agency"[^>]*>\s*<small>([^<]+)<\/small>/gi,
          ),
        ].map((m) => m[1].trim());
        pageMatches.forEach((p) => allPublishers.add(p));
      }
    } catch (e) {
      console.log(`Page ${page} error:`, e.message);
    }
  }
  console.log('\nTotal unique publishers/sources aggregated by Trovit in Nice:');
  console.log([...allPublishers].sort());
}

scanMorePages();
