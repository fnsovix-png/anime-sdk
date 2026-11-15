#!/usr/bin/env node
import { AnikotoProvider, HttpClient } from './dist/index.js';
import { DOMParser } from 'linkedom';

// Register linkedom as the DOM parser before creating providers
globalThis.DOMParser = DOMParser;

async function main() {
  try {
    console.log('Testing AnikotoProvider directly...\n');

    const httpClient = new HttpClient({ timeoutMs: 25000 });
    const provider = new AnikotoProvider(httpClient);

    const query = 'Solo Leveling';
    console.log(`Searching for "${query}"...`);
    const results = await provider.search(query);

    console.log(`Found ${results.length} results\n`);

    if (results.length > 0) {
      console.log('First 3 results:');
      for (let i = 0; i < Math.min(3, results.length); i++) {
        const r = results[i];
        console.log(`  ${i + 1}. ${r.title} (${r.id})`);
      }

      // Try to get episodes for the first result
      console.log(`\nFetching episodes for "${results[0].title}"...`);
      const episodes = await provider.fetchContentUnits(results[0].id);
      console.log(`Got ${episodes.length} episodes`);

      if (episodes.length > 0) {
        console.log('First episode:');
        const ep = episodes[0];
        console.log(`  Number: ${ep.number}`);
        console.log(`  Title: ${ep.title}`);
        console.log(`  ID: ${ep.id}`);
        console.log(`  Languages: ${ep.availableLanguages?.join(', ')}`);

        // Try to resolve a stream
        console.log(`\nResolving stream for episode ${ep.number}...`);
        const stream = await provider.resolveStream(ep.id, ep.availableLanguages?.[0] || 'sub');
        console.log(`Stream type: ${stream.type}`);
        console.log(`Stream sources: ${stream.streams?.length || 0}`);
        if (stream.streams?.length > 0) {
          console.log(`First source URL: ${stream.streams[0].sourceUrl.substring(0, 100)}...`);
        }
      }
    } else {
      console.log('✗ No results found!');
    }
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  }
}

main();
