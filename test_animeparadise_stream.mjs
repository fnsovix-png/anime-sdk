#!/usr/bin/env node
/**
 * Test AnimeParadise stream endpoint to verify it returns valid M3U8
 * This tests whether the actual stream URL is playable (not blocked, etc)
 */
import { AnimeParadiseProvider, HttpClient } from './dist/index.js';
import { DOMParser } from 'linkedom';

globalThis.DOMParser = DOMParser;

async function testAnimeParadiseStream() {
  console.log('═══════════════════════════════════════════════');
  console.log('TESTING ANIMEPARADISE ACTUAL STREAM PLAYABILITY');
  console.log('═══════════════════════════════════════════════\n');

  try {
    const http = new HttpClient({ timeoutMs: 25000 });
    const provider = new AnimeParadiseProvider(http);

    // Search
    console.log('1. Searching for "Jujutsu Kaisen"...');
    const searchResults = await provider.search('Jujutsu Kaisen');
    if (searchResults.length === 0) {
      console.log('✗ No results\n');
      return;
    }

    const anime = searchResults[0];
    console.log(`✓ Found: ${anime.title}\n`);

    // Get episodes
    console.log('2. Fetching episodes...');
    const episodes = await provider.fetchContentUnits(anime.id);
    if (episodes.length === 0) {
      console.log('✗ No episodes\n');
      return;
    }

    const ep = episodes[0];
    console.log(`✓ Got ${episodes.length} episodes\n`);

    // Resolve stream
    console.log('3. Resolving stream...');
    const stream = await provider.resolveStream(ep.id, 'sub');

    console.log(`✓ Got stream object`);
    console.log(`  Type: ${stream.type}`);
    console.log(`  Sources: ${stream.streams?.length || 0}`);

    if (!stream.streams?.length) {
      console.log('✗ No sources\n');
      return;
    }

    // Test the actual stream URL
    console.log(`\n4. Inspecting stream source object...`);
    console.log(`  Stream object keys: ${Object.keys(stream).join(', ')}`);
    console.log(`  Source keys: ${Object.keys(stream.streams[0]).join(', ')}`);
    console.log(`  Full source: ${JSON.stringify(stream.streams[0], null, 2)}\n`);

    const streamUrl = stream.streams[0].sourceUrl || stream.streams[0].url;
    console.log(`5. Testing stream URL playability...`);
    console.log(`  Full URL: ${streamUrl}\n`);

    // Try to fetch the M3U8 playlist
    console.log('6. Fetching M3U8 playlist...');
    const response = await fetch(streamUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    console.log(`  Status: ${response.status}`);

    if (response.status === 200) {
      const content = await response.text();
      console.log(`  Content length: ${content.length} bytes`);

      // Check if it's a valid M3U8
      if (content.includes('#EXTM3U')) {
        console.log(`  ✓ Valid M3U8 playlist found!`);
        console.log(`  First 200 chars:`);
        console.log(`  ${content.substring(0, 200)}`);
        console.log(`\n✓ SUCCESS: AnimeParadise stream is PLAYABLE`);
      } else if (content.includes('<!DOCTYPE') || content.includes('<html')) {
        console.log(`  ✗ Got HTML instead of M3U8 (might be redirect or error page)`);
        console.log(`  First 200 chars:`);
        console.log(`  ${content.substring(0, 200)}`);
      } else {
        console.log(`  ? Unknown content type`);
        console.log(`  First 200 chars:`);
        console.log(`  ${content.substring(0, 200)}`);
      }
    } else if (response.status === 403 || response.status === 401) {
      console.log(`  ✗ Access denied (${response.status}) - might need specific headers`);
    } else {
      console.log(`  ✗ Error: HTTP ${response.status}`);
    }
  } catch (e) {
    console.log(`✗ Error: ${e.message}`);
    console.error(e);
  }
}

testAnimeParadiseStream().catch(console.error);
