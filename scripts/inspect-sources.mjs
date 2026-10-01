import fs from 'node:fs';

async function inspectRentola() {
  const url = 'https://rentola.com/for-rent/nice';
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    },
  });
  console.log('Rentola status:', res.status);
  const html = await res.text();
  fs.writeFileSync('rentola-nice.html', html);
  console.log('Saved rentola-nice.html length:', html.length);
}

async function inspectLocamoi() {
  // Let's test search URLs on locamoi
  const testUrls = [
    'https://locamoi.fr/',
    'https://locamoi.fr/annonces-immobilieres?city=Nice',
    'https://locamoi.fr/locations/nice',
    'https://locamoi.fr/recherche',
  ];
  for (const url of testUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        },
      });
      console.log('Locamoi', url, res.status);
      if (res.status === 200 && url.includes('locamoi.fr/')) {
        const html = await res.text();
        fs.writeFileSync('locamoi-sample.html', html);
      }
    } catch (e) {
      console.log('Locamoi error:', e.message);
    }
  }
}

async function run() {
  await inspectRentola();
  await inspectLocamoi();
}

run();
