#!/usr/bin/env node
import https from 'https';

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...options.headers,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            resolve({ status: res.statusCode, headers: res.headers, body: data });
          });
        },
      )
      .on('error', reject);
  });
}

async function testMegaPlay(aniId, epNum, language) {
  console.log(`\nTesting AniList ID ${aniId}, Episode ${epNum}, ${language}:`);

  try {
    // Step 1: Get embed page
    const embedUrl = `https://megaplay.buzz/stream/ani/${aniId}/${epNum}/${language}`;
    const embedResult = await fetchUrl(embedUrl, {
      headers: { Referer: 'https://megaplay.buzz' },
    });

    if (embedResult.status !== 200) {
      console.log(`  Embed page error: ${embedResult.status}`);
      return;
    }

    if (embedResult.body.includes('<title>Error - MegaPlay</title>')) {
      console.log(`  ✗ MegaPlay error: No mapping for this title`);
      return;
    }

    const fileIdMatch = embedResult.body.match(/File\s+(\d+)\s+-/);
    if (!fileIdMatch) {
      console.log(`  ✗ Could not extract file ID`);
      return;
    }

    const fileId = fileIdMatch[1];
    console.log(`  ✓ File ID: ${fileId}`);

    // Step 2: Get sources
    const sourcesUrl = `https://megaplay.buzz/stream/getSources?id=${fileId}`;
    const sourcesResult = await fetchUrl(sourcesUrl, {
      headers: {
        Referer: embedUrl,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    console.log(`  Sources response status: ${sourcesResult.status}`);
    console.log(`  Sources response body: ${sourcesResult.body}`);

    // Try to parse
    try {
      const json = JSON.parse(sourcesResult.body);
      console.log(`  Parsed sources:`, json);
    } catch (e) {
      console.log(`  (Not valid JSON)`);
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
}

async function main() {
  console.log('Testing MegaPlay getSources endpoint\n');

  // Test Attack on Titan (AniList ID 16498)
  await testMegaPlay('16498', '1', 'sub');

  // Test Solo Leveling (AniList ID 151022) - we know this fails
  await testMegaPlay('151022', '1', 'sub');

  // Test Demon Slayer (AniList ID 101922)
  await testMegaPlay('101922', '1', 'sub');
}

main();
