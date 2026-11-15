#!/usr/bin/env node
/**
 * Debug AllManga extractors to understand why they're failing
 * Trace the flow: API response → extractor → result
 */
import { AllmangaProvider, HttpClient } from './dist/index.js';

async function debugAllManga() {
  console.log('═══════════════════════════════════════════════');
  console.log('DEBUGGING ALLMANGA EXTRACTOR FAILURE');
  console.log('═══════════════════════════════════════════════\n');

  try {
    const http = new HttpClient({ timeoutMs: 25000 });
    const provider = new AllmangaProvider(http);

    // Get search results
    console.log('1. Searching for "Death Note"...');
    const searchResults = await provider.search('Death Note');

    if (searchResults.length === 0) {
      console.log('✗ No results\n');
      return;
    }

    const anime = searchResults[0];
    console.log(`✓ Found: ${anime.title} (${anime.id})\n`);

    // Get episodes
    console.log('2. Fetching episodes...');
    const episodes = await provider.fetchContentUnits(anime.id);

    if (episodes.length === 0) {
      console.log('✗ No episodes\n');
      return;
    }

    const ep = episodes[0];
    console.log(`✓ Got ${episodes.length} episodes`);
    console.log(`   First: EP ${ep.number} (ID: ${ep.id})`);
    console.log(`   Languages: ${ep.availableLanguages?.join(', ')}\n`);

    // Try to resolve stream with detailed error handling
    console.log('3. Attempting stream resolution...');
    console.log(`   Calling provider.resolveStream("${ep.id}", "sub")\n`);

    try {
      const stream = await provider.resolveStream(ep.id, 'sub');
      console.log('✓ Got stream object');
      console.log(`  Type: ${stream.type}`);
      console.log(`  Streams: ${stream.streams?.length || 0}`);
      console.log(`  Subtitles: ${stream.subtitles?.length || 0}`);

      if (stream.streams?.length > 0) {
        console.log(`\n  First source URL: ${stream.streams[0].sourceUrl}`);
      }
    } catch (e) {
      console.log(`✗ Resolution failed: ${e.message}`);
      console.log(`\nError details:`);
      console.log(`  Name: ${e.name}`);
      console.log(`  Stack: ${e.stack.split('\n').slice(0, 5).join('\n')}`);

      // The error message will tell us what went wrong
      // If it's "returned no source URLs", the extractors failed
      // If it's something else, there's a different issue
    }
  } catch (e) {
    console.log(`✗ Unexpected error: ${e.message}\n`);
    console.error(e);
  }

  console.log('\n' + '═'.repeat(50));
  console.log('INTERPRETATION');
  console.log('═'.repeat(50));
  console.log(`
If the error is "AllManga returned no source URLs":
  → The extractors (Mp4UploadExtractor, GenericHlsExtractor) found no matches
  → Likely: Embed URL structure has changed, or patterns don't match current HTML

If the error is something else:
  → There's a different issue in the provider code

Next step: Check what embed URLs look like and what patterns the extractors use.
  `);
}

debugAllManga().catch(console.error);
