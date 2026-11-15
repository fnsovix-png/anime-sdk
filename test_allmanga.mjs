#!/usr/bin/env node
/**
 * Test AllManga provider independently
 * Checks: search → episodes → stream resolution
 */
import { AllmangaProvider, HttpClient } from './dist/index.js';
import { DOMParser } from 'linkedom';

globalThis.DOMParser = DOMParser;

async function test() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('TESTING ALLMANGA PROVIDER');
  console.log('═══════════════════════════════════════════════\n');

  try {
    const http = new HttpClient({ timeoutMs: 25000 });
    const provider = new AllmangaProvider(http);

    // Test search
    console.log('1. SEARCH for "Death Note"...');
    const searchResults = await provider.search('Death Note');
    console.log(`   Result: ${searchResults.length} items found`);
    if (searchResults.length === 0) {
      console.log('   ✗ FAIL: No results');
      return;
    }

    const anime = searchResults[0];
    console.log(`   ✓ First result: "${anime.title}" (${anime.id})\n`);

    // Test episodes
    console.log('2. FETCH EPISODES...');
    const episodes = await provider.fetchContentUnits(anime.id);
    console.log(`   Result: ${episodes.length} episodes found`);
    if (episodes.length === 0) {
      console.log('   ✗ FAIL: No episodes');
      return;
    }

    const ep = episodes[0];
    console.log(`   ✓ First episode: EP ${ep.number} - "${ep.title}" (${ep.id})`);
    console.log(`   Languages: ${ep.availableLanguages?.join(', ')}\n`);

    // Test stream
    console.log('3. RESOLVE STREAM...');
    const language = ep.availableLanguages?.[0] || 'sub';
    try {
      const stream = await provider.resolveStream(ep.id, language);
      console.log(`   Stream type: ${stream.type}`);

      if (stream.type === 'video') {
        console.log(`   Video sources: ${stream.streams?.length || 0}`);
        if (stream.streams?.length > 0) {
          console.log(`   ✓ First URL: ${stream.streams[0].sourceUrl.substring(0, 100)}...`);
          console.log(`   ✓ SUCCESS: AllManga can resolve streams!\n`);
        } else {
          console.log('   ✗ FAIL: No video streams returned\n');
        }
      } else {
        console.log(`   ✗ FAIL: Stream type is ${stream.type}, expected video\n`);
      }
    } catch (e) {
      console.log(`   ✗ FAIL: ${e.message}\n`);
    }
  } catch (e) {
    console.log(`✗ Error: ${e.message}\n`);
    console.error(e.stack);
  }
}

test();
