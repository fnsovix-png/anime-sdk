#!/usr/bin/env node
/**
 * Test AllManga's source fetching API directly
 * Check if the API returns source URLs
 */
import { HttpClient } from './dist/index.js';

async function testAllMangaAPI() {
  console.log('═══════════════════════════════════════════════');
  console.log('TESTING ALLMANGA SOURCE API');
  console.log('═══════════════════════════════════════════════\n');

  const http = new HttpClient({ timeoutMs: 25000 });
  const apiBase = 'https://api.allanime.day/api';
  const apiHost = 'https://allanime.day';

  const ALLANIME_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';

  const apiHeaders = {
    'Content-Type': 'application/json',
    Referer: 'https://allmanga.to',
    Origin: 'https://allmanga.to',
    'User-Agent': ALLANIME_USER_AGENT,
  };

  // Test case: Death Note Rewrite EP1
  const showId = 'XuYhavYftLYbaqizA';
  const episodeString = '1';
  const lang = 'sub';

  console.log(`Testing: AllManga show "${showId}" episode "${episodeString}" (${lang})`);
  console.log('─'.repeat(50) + '\n');

  try {
    // Try persisted GraphQL query first (like the SDK does)
    console.log('1. Trying persisted GraphQL query...');

    const variables = { showId, translationType: lang, episodeString };
    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: 'd405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec',
      },
    };

    const url = `${apiBase}?variables=${encodeURIComponent(
      JSON.stringify(variables),
    )}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;

    console.log(`   URL: ${url.substring(0, 100)}...\n`);

    const res = await http.get(url, { headers: apiHeaders });
    console.log(`   Status: ${res.status}`);

    const json = await res.json();
    console.log(`   Response keys: ${Object.keys(json).join(', ')}`);

    if (json.data) {
      console.log(`   Data keys: ${Object.keys(json.data).join(', ')}`);
      console.log(`   Data: ${JSON.stringify(json.data, null, 2).substring(0, 500)}...\n`);

      if (json.data.tobeparsed) {
        console.log(`   ✓ tobeparsed field found (encrypted)`);
        console.log(`   Length: ${json.data.tobeparsed.length} chars\n`);
      } else if (json.data.episode?.sourceUrls) {
        console.log(`   ✓ episode.sourceUrls found`);
        console.log(`   Sources: ${json.data.episode.sourceUrls}`);
      } else {
        console.log(`   ✗ No sourceUrls or tobeparsed found\n`);
      }
    }

    if (json.errors) {
      console.log(`   API Errors: ${JSON.stringify(json.errors)}\n`);
    }

    // Try fallback GraphQL POST request
    console.log('\n2. Trying fallback GraphQL POST...');

    const fallbackQuery = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode(showId: $showId translationType: $translationType episodeString: $episodeString) { episodeString sourceUrls } }`;

    const fbRes = await http.post(
      apiBase,
      { variables, query: fallbackQuery },
      { headers: apiHeaders },
    );

    console.log(`   Status: ${fbRes.status}`);
    const fbJson = await fbRes.json();
    console.log(`   Response: ${JSON.stringify(fbJson, null, 2).substring(0, 500)}...\n`);

    if (fbJson.data?.episode?.sourceUrls) {
      console.log(`   ✓ Sources found via fallback!`);
      console.log(`   Count: ${fbJson.data.episode.sourceUrls.length}`);
    }
  } catch (e) {
    console.log(`✗ Error: ${e.message}\n`);
  }
}

testAllMangaAPI().catch(console.error);
