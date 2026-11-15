#!/usr/bin/env node

import {
  startServer,
  AnikotoProvider,
  AllmangaProvider,
  AnimeParadiseProvider,
  GogoanimeProvider,
  GoyabuProvider,
  MegaPlayProvider,
  AnilistMeta,
  MappingClient,
  HttpClient,
} from '../dist/index.js';
import { DOMParser } from 'linkedom';

// Explicitly register linkedom as the DOM parser
if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = DOMParser;
}

const port = process.env.PORT || 3000;
const apiToken = process.env.API_TOKEN || 'vortex-anime-default-token';

// In-memory cache with per-kind lifetimes. Stream links are never cached:
// they can expire, and a stale one would fail playback.
function ttlFor(key) {
  if (key.includes('stream:') || key.startsWith('tracks:')) return 0;
  if (key.startsWith('mapping:')) return 24 * 3600e3;
  if (key.startsWith('meta:info:') || key.startsWith('meta:browse:')) return 6 * 3600e3;
  if (key.startsWith('search:') || key.startsWith('meta:search:')) return 15 * 60e3;
  return 30 * 60e3;
}
const store = new Map();
const cache = {
  get(key) {
    const e = store.get(key);
    if (!e) return undefined;
    if (e.expires < Date.now()) {
      store.delete(key);
      return undefined;
    }
    return e.value;
  },
  set(key, value) {
    const ttl = ttlFor(key);
    if (ttl === 0) return;
    if (store.size >= 5000) store.delete(store.keys().next().value);
    store.set(key, { value, expires: Date.now() + ttl });
  },
};

const httpClient = new HttpClient({
  timeoutMs: 30000,
});

console.log('🚀 Starting Vortex Anime Backend...');
console.log(`📍 Server will run on http://localhost:${port}`);
console.log('🔌 Initializing anime providers...');

try {
  const server = await startServer({
    providers: [
      new AnikotoProvider(httpClient),
      new AllmangaProvider(httpClient),
      new AnimeParadiseProvider(httpClient),
      new GogoanimeProvider(httpClient),
      new GoyabuProvider(httpClient),
      new MegaPlayProvider(httpClient),
    ],
    metaProviders: [
      new AnilistMeta(httpClient, {
        // api.anify.tv redirects to itself, so every lookup through it times out.
        mappingClient: new MappingClient(httpClient, {
          cache,
          disableAnify: true,
          externalTimeoutMs: 1500,
        }),
      }),
    ],
    port: parseInt(port, 10),
    cache,
    auth: {
      token: apiToken,
    },
  });

  console.log('✅ Server started successfully!');
  console.log(`📺 Content Providers:`);
  console.log(`   • Anikoto`);
  console.log(`   • AllManga (with dub support)`);
  console.log(`   • Anime Paradise`);
  console.log(`   • GoGoAnime`);
  console.log(`   • Goyabu`);
  console.log(`   • MegaPlay`);
  console.log(`📱 Flutter app should connect to: http://localhost:${port}`);
  console.log('🔑 API Token:', apiToken);
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}
