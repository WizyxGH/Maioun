async function testRentolaFR() {
  const url = 'https://rentola.fr/location/nice';
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  console.log('Status:', res.status);
  const html = await res.text();
  const jsonLd = [
    ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((m) => m[1]);
  for (const raw of jsonLd) {
    try {
      const data = JSON.parse(raw);
      if (data['@type'] === 'SearchResultsPage' && data.mainEntity?.itemListElement) {
        console.log('Rentola FR items count:', data.mainEntity.itemListElement.length);
        console.log('Sample item:');
        console.log(JSON.stringify(data.mainEntity.itemListElement[0], null, 2));
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
}

testRentolaFR();
