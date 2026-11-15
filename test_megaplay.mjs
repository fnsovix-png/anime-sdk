#!/usr/bin/env node
/**
 * Test MegaPlay provider independently
 * Tests with titles known to be in MegaPlay's catalog
 */
import { MegaPlayProvider, HttpClient } from './dist/index.js';

async function test() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('TESTING MEGAPLAY PROVIDER');
  console.log('═══════════════════════════════════════════════\n');

  try {
    const http = new HttpClient({ timeoutMs: 25000 });
    const provider = new MegaPlayProvider(http);

    // Test search
    console.log('1. SEARCH for "Attack on Titan"...');
    const searchResults = await provider.search('Attack on Titan');
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
    console.log('   (NOTE: Testing if MegaPlay has enc field in response)\n');
    const language = ep.availableLanguages?.[0] || 'sub';
    try {
      const stream = await provider.resolveStream(ep.id, language);
      console.log(`   Stream type: ${stream.type}`);

      if (stream.type === 'video') {
        console.log(`   Video sources: ${stream.streams?.length || 0}`);
        if (stream.streams?.length > 0) {
          console.log(`   ✓ First URL: ${stream.streams[0].sourceUrl.substring(0, 100)}...`);
          console.log(`   ✓ SUCCESS: MegaPlay can resolve streams!\n`);
        } else {
          console.log('   ✗ FAIL: No video streams returned\n');
        }
      } else {
        console.log(`   ✗ FAIL: Stream type is ${stream.type}, expected video\n`);
      }
    } catch (e) {
      console.log(`   ✗ FAIL: ${e.message}\n`);
      console.log("   This error indicates MegaPlay's API response format");
      console.log('   has changed (likely returning enc field instead of sources.file)\n');
    }
  } catch (e) {
    console.log(`✗ Error: ${e.message}\n`);
  }
}

test();
