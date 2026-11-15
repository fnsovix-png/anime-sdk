#!/usr/bin/env node
/**
 * Investigate MegaPlay's current API response format
 * Document the structure and look for clues on how to decrypt enc field
 */
import https from 'https';

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            ...options.headers,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            resolve({ status: res.statusCode, body: data });
          });
        },
      )
      .on('error', reject);
  });
}

async function investigateMegaPlay() {
  console.log('═══════════════════════════════════════════════');
  console.log('INVESTIGATING MEGAPLAY API FORMAT');
  console.log('═══════════════════════════════════════════════\n');

  // Use multiple test cases
  const testCases = [
    { id: '16498', ep: '1', lang: 'sub', title: 'Attack on Titan' },
    { id: '154587', ep: '1', lang: 'sub', title: 'Frieren' },
    { id: '21', ep: '1', lang: 'sub', title: 'MAL ID test' },
  ];

  for (const test of testCases) {
    console.log(`\nTest: ${test.title} (AniList ${test.id})`);
    console.log('─'.repeat(50));

    try {
      // Get embed page
      const embedUrl = `https://megaplay.buzz/stream/ani/${test.id}/${test.ep}/${test.lang}`;
      const embedResult = await fetchUrl(embedUrl, {
        headers: { Referer: 'https://megaplay.buzz' },
      });

      if (embedResult.body.includes('<title>Error - MegaPlay</title>')) {
        console.log('Result: ERROR PAGE (MegaPlay has no mapping)');
        continue;
      }

      const fileIdMatch = embedResult.body.match(/File\s+(\d+)\s+-/);
      if (!fileIdMatch) {
        console.log('Result: Could not extract file ID');
        console.log('Page snippet:', embedResult.body.substring(0, 200));
        continue;
      }

      const fileId = fileIdMatch[1];
      console.log(`File ID: ${fileId}`);

      // Get sources
      const sourcesUrl = `https://megaplay.buzz/stream/getSources?id=${fileId}`;
      const sourcesResult = await fetchUrl(sourcesUrl, {
        headers: {
          Referer: embedUrl,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      const json = JSON.parse(sourcesResult.body);

      // Document the response structure
      console.log('\nResponse structure:');
      console.log(`  ✓ Has "tracks": ${!!json.tracks}`);
      console.log(`  ✓ Has "sources": ${!!json.sources}`);
      console.log(`  ✓ Has "enc": ${!!json.enc}`);
      console.log(`  ✓ Has "image": ${!!json.image}`);
      console.log(`  ✓ Has "server": ${!!json.server}`);
      console.log(`  ✓ Has "intro": ${!!json.intro}`);
      console.log(`  ✓ Has "outro": ${!!json.outro}`);
      console.log(`  ✓ Has "t": ${!!json.t}`);

      // If enc exists, document it
      if (json.enc) {
        console.log(`\nENC field found:`);
        console.log(`  Type: ${typeof json.enc}`);
        console.log(`  Length: ${json.enc.length} characters`);
        console.log(`  First 100 chars: ${json.enc.substring(0, 100)}`);
        console.log(`  Pattern: ${json.enc.match(/^[a-zA-Z0-9_-]+$/) ? 'Base64-like' : 'Other'}`);
      }

      // If sources exists, document it
      if (json.sources) {
        console.log(`\nSources object:`);
        console.log(`  Keys: ${Object.keys(json.sources).join(', ')}`);
        for (const [key, value] of Object.entries(json.sources)) {
          console.log(`    ${key}: ${typeof value} (${String(value).substring(0, 80)}...)`);
        }
      } else {
        console.log('\nSources object: NOT PRESENT (this breaks the SDK!)');
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('ANALYSIS SUMMARY');
  console.log('═'.repeat(50));
  console.log(`
MegaPlay's API has changed. The old format expected:
  { sources: { file: "https://..." } }

The new format returns:
  { tracks: [...], enc: "...", image: "...", server: N, intro: {...}, outro: {...} }

The "enc" field appears to be:
  - An encrypted or obfuscated video reference
  - Not directly usable as a playable URL
  - Requires decryption/decoding client-side

OPTIONS TO FIX:
1. Reverse-engineer the enc decryption (complex, may violate ToS)
2. Check if MegaPlay has public JavaScript that decodes enc
3. Look for alternative providers that still work
4. Request official documentation from MegaPlay
5. Use a different streaming approach entirely
  `);
}

investigateMegaPlay().catch(console.error);
