import { BaseProvider, CallOptions } from './BaseProvider.js';
import { HttpClient } from '../transport/http.js';
import {
  IMediaSearchResult,
  IContentUnit,
  ResolvedMediaStream,
  MediaCatalogType,
  ContentLanguage,
  IUnitTracks,
} from '../types/index.js';

const SITE = 'https://hentaihaven.xxx';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** `https://hentaihaven.xxx/watch/some-show/` -> `some-show`. */
function slugOf(id: string): string {
  const clean = id.replace(/^hentaihaven:/, '').replace(/^\/+/, '');
  const withWatch = /(?:^|\/)watch\/([^/?#]+)/.exec(clean);
  if (withWatch) return withWatch[1];
  // `slug/episode-1` -> `slug`; a bare slug stays as it is.
  return clean.split(/[/?#]/)[0];
}

/** The site blocks plain fetch with a Cloudflare challenge; curl gets through. */
function pageHeaders(): Record<string, string> {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `${SITE}/`,
    // Cloudflare answers 403 to fetch; the curl transport gets the real page.
    'x-force-curl': '1',
    // Client hints make curl look like a real browser request, which matters on
    // datacenter IPs where the challenge is strict.
    'sec-ch-ua': '"Chromium";v="125", "Not.A/Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

interface Card {
  slug: string;
  title: string;
  thumbnailUrl?: string;
}

/** Pulls result cards out of a listing page. */
function parseCards(html: string): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  const card =
    /<a[^>]+href="\/watch\/([a-z0-9-]+)\/"[^>]*>\s*<img[^>]*\salt="([^"]*)"[^>]*\ssrc="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = card.exec(html)) !== null) {
    const [, slug, title, src] = m;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, title: decodeEntities(title).trim(), thumbnailUrl: src });
  }
  return out;
}

/** Best quality first, from the master playlist's EXT-X-STREAM-INF list. */
function qualitiesFromMaster(master: string): string[] {
  const out: string[] = [];
  const re = /RESOLUTION=\d+x(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(master)) !== null) {
    const height = m[1];
    if (height === '1080' || height === '720' || height === '480' || height === '360') {
      if (!out.includes(`${height}p`)) out.push(`${height}p`);
    }
  }
  return out;
}

/** English first: the site ships a dozen subtitle languages per episode. */
function subtitlesFromMaster(
  master: string,
  base: string,
): { url: string; language: string; label: string }[] {
  const out: { url: string; language: string; label: string }[] = [];
  const re =
    /#EXT-X-MEDIA:URI="([^"]+)"[^\r\n]*?TYPE=SUBTITLES[^\r\n]*?LANGUAGE="([^"]*)"[^\r\n]*?NAME="([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(master)) !== null) {
    out.push({
      url: new URL(m[1], base).toString(),
      language: m[2].toLowerCase(),
      label: decodeEntities(m[3]),
    });
  }
  out.sort((a, b) => (a.language === 'en' ? -1 : b.language === 'en' ? 1 : 0));
  return out;
}

export class HentaiHavenProvider extends BaseProvider {
  public readonly id = 'hentaihaven';
  public readonly name = 'HentaiHaven';
  public override readonly supportedTypes: MediaCatalogType[] = ['ANIME'];

  constructor(http: HttpClient) {
    super(http);
  }

  protected async searchRaw(
    query: string,
    options: CallOptions = {},
  ): Promise<IMediaSearchResult[]> {
    const html = await this.page(`/?s=${encodeURIComponent(query)}`, options.signal);
    return parseCards(html)
      .slice(0, 20)
      .map((card) => ({
        id: card.slug,
        title: card.title,
        thumbnailUrl: card.thumbnailUrl,
        catalogType: 'ANIME' as const,
        providerId: this.id,
        availableLanguages: ['sub'] as const,
        isAdult: true,
      }));
  }

  protected async fetchContentUnitsRaw(
    mediaId: string,
    options: CallOptions = {},
  ): Promise<IContentUnit[]> {
    const slug = slugOf(mediaId);
    const html = await this.page(`/watch/${slug}/`, options.signal);
    const numbers = new Set<number>();
    const re = new RegExp(`/watch/${slug}/episode-(\\d+)/`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n)) numbers.add(n);
    }
    // Plenty of titles are single-episode, with no episode links on the page.
    if (numbers.size === 0) numbers.add(1);
    return [...numbers]
      .sort((a, b) => a - b)
      .map((n) => ({
        id: `${slug}/episode-${n}`,
        title: `Episode ${n}`,
        number: n,
        availableLanguages: ['sub'] as const,
      }));
  }

  /**
   * Loads a site page. Cloudflare refuses this host's IP with a 403, so the
   * request goes through a text proxy that returns the same HTML, and only
   * falls back to the site directly if that proxy fails.
   */
  private async page(path: string, signal?: AbortSignal): Promise<string> {
    const url = `${SITE}${path}`;
    try {
      const viaProxy = await this.http.get(`https://r.jina.ai/${url}`, {
        headers: { ...pageHeaders(), 'x-respond-with': 'html' },
        signal,
      });
      const html = await viaProxy.text();
      if (viaProxy.ok && html.includes('/watch/')) return html;
    } catch {
      /* fall through to a direct request */
    }
    const direct = await this.http.get(url, { headers: pageHeaders(), signal });
    return direct.text();
  }

  private async masterFor(
    unitId: string,
    options: CallOptions,
  ): Promise<{ master: string; url: string }> {
    const slug = slugOf(unitId);
    const ep = /episode-(\d+)/.exec(unitId);
    const path = ep ? `/watch/${slug}/episode-${ep[1]}/` : `/watch/${slug}/`;
    const html = await this.page(path, options.signal);
    const found = /https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/.exec(html);
    if (!found) throw new Error('HentaiHaven: no playlist on that episode page');
    const url = found[0];
    const playlist = await this.http.get(url, {
      headers: { 'User-Agent': UA, Referer: `${SITE}/` },
      signal: options.signal,
    });
    return { master: await playlist.text(), url };
  }

  protected async resolveStreamRaw(
    unitId: string,
    _language?: ContentLanguage,
    options: CallOptions = {},
  ): Promise<ResolvedMediaStream> {
    const { master, url } = await this.masterFor(unitId, options);
    const subtitles = subtitlesFromMaster(master, url);
    return {
      type: 'video',
      streams: [
        {
          sourceUrl: url,
          isHLS: true,
          quality: 'auto',
          language: 'sub',
          headers: { 'User-Agent': UA, Referer: `${SITE}/` },
          ...(subtitles.length > 0 ? { subtitles } : {}),
        },
      ],
    };
  }

  protected async fetchUnitTracksRaw(
    unitId: string,
    _language?: ContentLanguage,
    options: CallOptions = {},
  ): Promise<IUnitTracks> {
    const { master, url } = await this.masterFor(unitId, options);
    return {
      subtitles: subtitlesFromMaster(master, url),
      qualities: qualitiesFromMaster(master) as IUnitTracks['qualities'],
      headers: { 'User-Agent': UA, Referer: `${SITE}/` },
    };
  }
}
