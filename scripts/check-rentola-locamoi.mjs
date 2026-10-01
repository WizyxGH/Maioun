import fs from 'node:fs';

async function testLocamoiNice() {
  const url = 'https://locamoi.fr/location?location=Nice';
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    },
  });
  console.log('Locamoi Nice status:', res.status);
  const html = await res.text();
  fs.writeFileSync('locamoi-nice.html', html);
  console.log('Saved locamoi-nice.html length:', html.length);
}

function testRentolaScripts() {
  const html = fs.readFileSync('rentola-nice.html', 'utf8');
  // Check for json or data in script tags
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  console.log('Rentola scripts count:', scripts.length);
  for (let i = 0; i < scripts.length; i++) {
    const s = scripts[i];
    if (
      s.includes('properties') ||
      s.includes('rent') ||
      s.includes('Nice') ||
      s.includes('price')
    ) {
      console.log(
        `Script ${i} length:`,
        s.length,
        'preview:',
        s.slice(0, 200).replace(/\s+/g, ' '),
      );
    }
  }

  // Also search for article or div elements representing listings
  const articles = [...html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi)].map((m) => m[1]);
  console.log('Rentola articles count:', articles.length);
  if (articles.length > 0) {
    console.log('Article 0 preview:', articles[0].slice(0, 400));
  }
}

async function run() {
  await testLocamoiNice();
  testRentolaScripts();
}

run();
