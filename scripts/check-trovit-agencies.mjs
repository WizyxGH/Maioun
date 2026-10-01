async function scanMore() {
  const urls = [
    'https://immo.trovit.fr/index.php/cod.search_homes/what_d.alpes-maritimes/type.2/order_by.date',
    'https://immo.trovit.fr/index.php/cod.search_homes/what_d.cagnes-sur-mer/type.2',
    'https://immo.trovit.fr/index.php/cod.search_homes/what_d.antibes/type.2',
    'https://immo.trovit.fr/index.php/cod.search_homes/what_d.cannes/type.2',
  ];

  const allAgencies = new Set();
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      const matches = [
        ...html.matchAll(/class="date-publisher-wrapper-agency"[^>]*>\s*<small>([^<]+)<\/small>/gi),
      ].map((m) => m[1].trim());
      matches.forEach((m) => allAgencies.add(m));
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
  console.log('Agencies found across 06:', [...allAgencies]);
}

scanMore();
