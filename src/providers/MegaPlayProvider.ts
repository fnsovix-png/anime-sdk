import { BaseProvider, CallOptions } from './BaseProvider.js';
import { HttpClient } from '../transport/http.js';
import { DomRegistry } from '../transport/dom.js';
import {
  IMediaSearchResult,
  IContentUnit,
  IMediaMappings,
  ResolvedMediaStream,
  MediaCatalogType,
  ContentLanguage,
  IVideoPayload,
  ISubtitleTrack,
} from '../types/index.js';

export function megaPlayEmbed(embedUrl: string, language: ContentLanguage): ResolvedMediaStream {
  return {
    type: 'video',
    streams: [{ sourceUrl: embedUrl, isHLS: false, isEmbed: true, quality: 'auto', language }],
  };
}

function isErrorPage(page: string): boolean {
  return page.includes('<title>Error - MegaPlay</title>');
}

export interface MegaPlayOptions {
  baseUrl?: string;
}

export class MegaPlayProvider extends BaseProvider {
  public override readonly id = 'megaplay';
  public readonly name = 'MegaPlay';
  public override readonly supportedTypes: MediaCatalogType[] = ['ANIME'];

  /**
   * MegaPlay indexes its catalogue by AniList ID directly — its internal
   * `mediaId` IS the AniList ID. Surface that to `MappingClient` so it
   * can skip MALSync/Anify/fuzzy entirely when the meta record knows the
   * AniList ID.
   */
  public override async lookupByMapping(mappings: IMediaMappings): Promise<string | null> {
    return mappings.anilist != null ? String(mappings.anilist) : null;
  }

  private readonly baseUrl: string;
  private readonly anilistApi = 'https://graphql.anilist.co';

  constructor(http: HttpClient, options: MegaPlayOptions = {}) {
    super(http);
    this.baseUrl = options.baseUrl || 'https://megaplay.buzz';
    if (!this.http.getDefaultHeaders()['User-Agent']) {
      this.http.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );
    }
  }

  protected override async searchRaw(
    query: string,
    options: CallOptions = {},
  ): Promise<IMediaSearchResult[]> {
    const graphqlQuery = `
      query ($search: String) {
        Page (page: 1, perPage: 15) {
          media (search: $search, type: ANIME) {
            id
            title {
              romaji
              english
            }
            coverImage {
              large
            }
            episodes
            isAdult
          }
        }
      }
    `;

    const response = await this.http.post(
      this.anilistApi,
      {
        query: graphqlQuery,
        variables: { search: query },
      },
      { signal: options.signal },
    );

    const json = (await response.json()) as any;
    if (!json.data || !json.data.Page || !json.data.Page.media) {
      return [];
    }

    return json.data.Page.media.map(
      (media: any): IMediaSearchResult => ({
        id: String(media.id),
        title: media.title.english || media.title.romaji,
        thumbnailUrl: media.coverImage.large,
        catalogType: 'ANIME',
        providerId: this.id,
        isAdult: !!media.isAdult,
      }),
    );
  }

  protected override async fetchContentUnitsRaw(
    mediaId: string,
    options: CallOptions = {},
  ): Promise<IContentUnit[]> {
    const graphqlQuery = `
      query ($id: Int) {
        Media (id: $id) {
          episodes
          nextAiringEpisode { episode }
        }
      }
    `;

    const response = await this.http.post(
      this.anilistApi,
      {
        query: graphqlQuery,
        variables: { id: parseInt(mediaId) },
      },
      { signal: options.signal },
    );

    const json = (await response.json()) as any;
    const media = json.data?.Media;
    // Airing shows have no total yet; list what has aired so far.
    const aired = media?.nextAiringEpisode?.episode ? media.nextAiringEpisode.episode - 1 : 0;
    const episodesCount = media?.episodes || aired || 1;

    const units: IContentUnit[] = [];
    for (let i = 1; i <= episodesCount; i++) {
      units.push({
        id: `${mediaId}:${i}`,
        title: `Episode ${i}`,
        number: i,
        availableLanguages: ['sub', 'dub'],
      });
    }

    return units;
  }

  private async fetchEmbed(url: string, options: CallOptions): Promise<string> {
    const res = await this.http.get(url, {
      signal: options.signal,
      headers: { Referer: this.baseUrl },
    });
    return res.text();
  }

  private async malIdFor(aniId: string, options: CallOptions): Promise<number | null> {
    const res = await this.http.post(
      this.anilistApi,
      {
        query: 'query ($id: Int) { Media (id: $id) { idMal } }',
        variables: { id: parseInt(aniId) },
      },
      { signal: options.signal },
    );
    const json = (await res.json()) as any;
    return json.data?.Media?.idMal ?? null;
  }

  protected override async resolveStreamRaw(
    unitId: string,
    language: ContentLanguage = 'sub',
    options: CallOptions = {},
  ): Promise<ResolvedMediaStream> {
    const [aniId, epNum] = unitId.split(':');
    let embedUrl = `${this.baseUrl}/stream/ani/${aniId}/${epNum}/${language}`;
    let embedPage = await this.fetchEmbed(embedUrl, options);

    // MegaPlay's AniList mapping is incomplete; its MAL mapping covers shows it misses.
    if (isErrorPage(embedPage)) {
      const malId = await this.malIdFor(aniId, options);
      if (malId) {
        embedUrl = `${this.baseUrl}/stream/mal/${malId}/${epNum}/${language}`;
        embedPage = await this.fetchEmbed(embedUrl, options);
      }
    }
    if (isErrorPage(embedPage)) {
      throw new Error(
        `MegaPlay doesn't have episode ${epNum} of this show ${language === 'dub' ? 'dubbed' : 'subtitled'}`,
      );
    }

    // The file ID is in the title: <title>File 174608 - MegaPlay</title>
    const fileIdMatch = embedPage.match(/File\s+(\d+)\s+-/);
    if (!fileIdMatch) {
      throw new Error('Could not find file ID on megaplay embed page');
    }
    const fileId = fileIdMatch[1];

    // Step 2: Fetch the sources using the file ID
    const sourcesResponse = await this.http.get(`${this.baseUrl}/stream/getSources?id=${fileId}`, {
      signal: options.signal,
      headers: {
        Referer: embedUrl,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    const sourcesJson = (await sourcesResponse.json()) as any;
    if (!sourcesJson.sources?.file) {
      // MegaPlay now encrypts the direct URL (`enc`) and only supports playback
      // through its embed player, so hand back the official embed page.
      if (sourcesJson.enc) return megaPlayEmbed(embedUrl, language);
      throw new Error('No video sources found in megaplay response');
    }

    const streams: IVideoPayload[] = [
      {
        sourceUrl: sourcesJson.sources.file,
        isHLS: sourcesJson.sources.file.includes('.m3u8'),
        quality: 'auto',
        language,
        headers: {
          Referer: `${this.baseUrl}/`,
        },
      },
    ];

    const subtitles: ISubtitleTrack[] = (sourcesJson.tracks || [])
      .filter((t: any) => t.kind === 'captions')
      .map((t: any) => ({
        url: t.file,
        label: t.label,
        language: t.label.toLowerCase(),
        format: t.file.endsWith('.vtt') ? 'vtt' : 'srt',
      }));

    if (subtitles.length > 0) {
      streams[0].subtitles = subtitles;
    }

    return {
      type: 'video',
      streams,
    };
  }
}
