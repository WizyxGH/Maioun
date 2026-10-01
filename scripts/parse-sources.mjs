import fs from 'node:fs';

// 1. Inspect Locamoi search form
const locamoiHtml = fs.readFileSync('locamoi-sample.html', 'utf8');
const forms = [...locamoiHtml.matchAll(/<form[\s\S]*?<\/form>/gi)].map((m) => m[0]);
console.log('Locamoi forms count:', forms.length);
for (const form of forms) {
  console.log('Form action:', form.match(/action="([^"]+)"/)?.[1]);
  console.log('Form method:', form.match(/method="([^"]+)"/)?.[1]);
  const inputs = [...form.matchAll(/<input[^>]+name="([^"]+)"/gi)].map((m) => m[1]);
  console.log('Inputs:', inputs);
}

// Check any links with /location or /ville or /annonces on locamoi
const locamoiLinks = [
  ...locamoiHtml.matchAll(/href="([^"]*(?:nice|location|annonces)[^"]*)"/gi),
].map((m) => m[1]);
console.log('Locamoi links:', [...new Set(locamoiLinks)].slice(0, 10));

// 2. Inspect Rentola listings
const rentolaHtml = fs.readFileSync('rentola-nice.html', 'utf8');
console.log('\n--- RENTOLA ---');
const rentolaCards = [
  ...rentolaHtml.matchAll(
    /class="[^"]*(?:property-card|listing-item|property-item)[^"]*"[\s\S]*?(?=<div class="[^"]*(?:property-card|listing-item|property-item)|<\/section|<\/main)/gi,
  ),
];
console.log('Rentola cards count:', rentolaCards.length);
if (rentolaCards.length === 0) {
  // Let's search for json-ld or __NEXT_DATA__ or window.__INITIAL_STATE__
  const nextData = rentolaHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextData) {
    console.log('Rentola has __NEXT_DATA__! JSON length:', nextData[1].length);
    const parsed = JSON.parse(nextData[1]);
    console.log('Next data keys:', Object.keys(parsed));
    if (parsed.props?.pageProps) {
      console.log('pageProps keys:', Object.keys(parsed.props.pageProps));
      const props = parsed.props.pageProps;
      const listings = props.properties || props.listings || props.data || props.results;
      console.log(
        'Listings found in props:',
        Array.isArray(listings) ? listings.length : typeof listings,
      );
      if (Array.isArray(listings) && listings.length > 0) {
        console.log('Listing sample keys:', Object.keys(listings[0]));
        console.log('Listing sample:', JSON.stringify(listings[0], null, 2).slice(0, 500));
      }
    }
  }
}
