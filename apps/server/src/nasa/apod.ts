import type { ApodEntry } from '@astrovitals/shared'
import { UpstreamError } from '../lib/errors.ts'

/**
 * NASA APOD. As of 2026-09-10 api.nasa.gov serves APOD from the WordPress API on
 * science.nasa.gov; the legacy https://api.nasa.gov/planetary/apod goes offline 2026-12-01.
 *  - New (keyless):  GET https://science.nasa.gov/wp-json/wp/v2/apod-basic?per_page=1   (newest first)
 *                    GET https://science.nasa.gov/wp-json/wp/v2/apod-basic/{YYMMDD}
 *  - Legacy (key):   GET https://api.nasa.gov/planetary/apod?api_key=KEY[&date=YYYY-MM-DD]
 * `explanation`/`credit`/`copyright` contain HTML on the new API; we convert to plain text so the
 * React app never renders upstream HTML. Credits must be displayed next to the image.
 */

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#039;': "'", '&nbsp;': ' ' }

export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? e)
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/** "2026-10-05" -> "261005" (APOD legacy date code). */
export function apodDateCode(date: string): string {
  return date.slice(2).replace(/-/g, '')
}

interface WpApod {
  date: string
  title: string
  permalink: string
  media_type: string
  explanation?: string
  credit?: string
  copyright?: string
  alt?: string
  url?: string
  hdurl?: string
}

export function parseWpApod(body: unknown): ApodEntry {
  const item = (Array.isArray(body) ? body[0] : body) as WpApod | undefined
  if (!item || typeof item.title !== 'string') throw new Error('APOD: empty response')
  const explanation = htmlToText(item.explanation).replace(/^Explanation:\s*/i, '')
  const credit = htmlToText(item.copyright || item.credit)
  return {
    date: item.date,
    title: htmlToText(item.title),
    mediaType: item.media_type,
    // For videos, hdurl is the poster frame (see docs/research/apod.md)
    ...(item.hdurl ? { imageUrl: item.hdurl } : {}),
    pageUrl: item.permalink,
    explanation,
    ...(credit ? { credit } : {}),
    ...(item.alt ? { altText: htmlToText(item.alt) } : {}),
  }
}

interface LegacyApod {
  date: string
  title: string
  explanation: string
  url?: string
  hdurl?: string
  media_type: string
  copyright?: string
  thumbnail_url?: string
}

export function parseLegacyApod(body: unknown): ApodEntry {
  const a = body as LegacyApod
  if (!a || typeof a.title !== 'string') throw new Error('APOD legacy: unexpected body')
  const image = a.media_type === 'image' ? a.hdurl || a.url : a.thumbnail_url
  // Since the 2026 migration the legacy proxy sometimes answers 200 with a site placeholder (the NASA
  // logo titled "NASA Science") instead of that day's picture. Treat it as an outage, not as an APOD.
  if (/\/nasa-logo[^/]*\.(png|svg)$/i.test(image ?? '') || a.title.trim() === 'NASA Science') {
    throw new UpstreamError('APOD legacy', 200, 'APOD legacy returned a placeholder instead of the picture')
  }
  return {
    date: a.date,
    title: a.title,
    mediaType: a.media_type,
    ...(image ? { imageUrl: image } : {}),
    pageUrl: `https://apod.nasa.gov/apod/ap${apodDateCode(a.date)}.html`,
    explanation: a.explanation,
    ...(a.copyright ? { credit: a.copyright.trim() } : {}),
  }
}
