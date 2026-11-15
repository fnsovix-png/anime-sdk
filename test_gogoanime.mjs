#!/usr/bin/env node
/**
 * Test GoGoAnime provider independently
 */
import { GogoanimeProvider, HttpClient } from './dist/index.js';
import { DOMParser } from 'linkedom';

globalThis.DOMParser = DOMParser;

async function test() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('TESTING GOGOANIME PROVIDER');
  console.log('═══════════════════════════════════════════════\n');

  try {
    const http = new HttpClient({ timeoutMs: 25000 });
    const provider = new GogoanimeProvider(http);

    console.log('1. SEARCH for "Bleach"...');
    const searchResults = await provider.search('Bleach');
    console.log(`   Result: ${searchResults.length} items found`);

    if (searchResults.length === 0) {
      console.log('   ✗ FAIL: No search results\n');
      return;
    }

    const anime = searchResults[0];
    console.log(`   ✓ First result: "${anime.title}" (${anime.id})\n`);

    console.log('2. FETCH EPISODES...');
    const episodes = await provider.fetchContentUnits(anime.id);
    console.log(`   Result: ${episodes.length} episodes found`);

    if (episodes.length === 0) {
      console.log('   ✗ FAIL: No episodes\n');
      return;
    }

    const ep = episodes[0];
    console.log(`   ✓ First episode: EP ${ep.number} (${ep.id})\n`);

    console.log('3. RESOLVE STREAM...');
    try {
      const stream = await provider.resolveStream(ep.id);
      console.log(`   ✓ Stream type: ${stream.type}`);
      console.log(`   Video sources: ${stream.streams?.length || 0}`);
      if (stream.streams?.length > 0) {
        console.log(`   ✓ SUCCESS: GoGoAnime can resolve streams!\n`);
      } else {
        console.log('   ✗ FAIL: No sources returned\n');
      }
    } catch (e) {
      console.log(`   ✗ FAIL: ${e.message}\n`);
    }
  } catch (e) {
    console.log(`✗ Error: ${e.message}\n`);
  }
}

test();
