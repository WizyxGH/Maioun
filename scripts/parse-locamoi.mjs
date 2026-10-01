import fs from 'node:fs';

const html = fs.readFileSync('locamoi-nice.html', 'utf8');

// Search for listing links, titles, prices in locamoi
const links = [...html.matchAll(/href="(\/location\/[^"]+)"/gi)].map((m) => m[1]);
console.log('Locamoi location links count:', links.length);
console.log('Sample links:', [...new Set(links)].slice(0, 10));

// Check cards
const cards = [
  ...html.matchAll(
    /class="[^"]*(?:card|listing|property|item)[^"]*"[\s\S]*?(?=<div class="[^"]*(?:card|listing|property|item)|<\/section|<\/main)/gi,
  ),
];
console.log('Card snippets:', cards.length);

// Check if any json data exists
const jsonLd = [
  ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
].map((m) => m[1]);
console.log('JSON-LD scripts:', jsonLd.length);
if (jsonLd.length > 0) {
  console.log('JSON-LD sample:', jsonLd[0].slice(0, 500));
}
