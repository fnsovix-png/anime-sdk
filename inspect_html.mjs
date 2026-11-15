#!/usr/bin/env node
import https from 'https';
import { DOMParser } from 'linkedom';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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

async function main() {
  try {
    console.log('Fetching Anikoto search results...\n');
    const result = await fetchUrl('https://anikototv.to/filter?keyword=Solo%20Leveling');

    if (result.status !== 200) {
      console.error(`Error: Status ${result.status}`);
      return;
    }

    // Parse HTML with linkedom to find the structure
    const parser = new DOMParser();
    const doc = parser.parseFromString(result.body, 'text/html');

    // Find items using the selector the provider uses
    const items = doc.querySelectorAll('.main .item');
    console.log(`Found ${items.length} items using .main .item selector\n`);

    if (items.length === 0) {
      // Try different selectors to debug
      console.log('Trying alternative selectors:');
      console.log(`  .main: ${doc.querySelectorAll('.main').length} elements`);
      console.log(`  .item: ${doc.querySelectorAll('.item').length} elements`);
      console.log(`  [class*="item"]: ${doc.querySelectorAll('[class*="item"]').length} elements`);

      // Show the first few elements with class="item"
      const itemElements = doc.querySelectorAll('[class*="item"]');
      if (itemElements.length > 0) {
        console.log('\nFirst element with "item" in class:');
        console.log(itemElements[0].outerHTML.substring(0, 300));
      }
    } else {
      console.log('✓ Found items with expected selector\n');
      console.log('First 3 items:');
      for (let i = 0; i < Math.min(3, items.length); i++) {
        const item = items[i];
        const titleEl = item.querySelector('.name');
        const posterEl = item.querySelector('.poster');
        const id = posterEl?.getAttribute('data-tip');
        const title = titleEl?.textContent?.trim();
        console.log(`  ${i + 1}. Title: "${title}", ID: "${id}"`);
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

main();
