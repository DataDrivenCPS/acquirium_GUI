/**
 * A glyph for each kind of thing in the plant, drawn into the graph nodes.
 *
 * These are SVG strings turned into data URIs, because Cytoscape draws node
 * images from a URL and the app has to work with no network at all. Nothing
 * is fetched, nothing is bundled as a file: the markup is right here.
 *
 * **How a node gets its icon is a guess, deliberately.** The backend says
 * only whether a node is equipment, a measurement or a system -- which is
 * the right amount for an API to say, since an icon is presentation. So the
 * match is made here, on the label, and falls back to a generic equipment
 * box whenever it does not recognise a word. A plant whose classes are named
 * differently loses the icons and loses nothing else.
 */

import type { GraphNode } from '../api/types'

/** Drawn on a 24x24 grid, stroked in one colour by the caller. */
const GLYPHS: Record<string, string> = {
  // A centrifugal pump: volute with a shaft.
  pump: '<circle cx="11" cy="13" r="6"/><path d="M11 7V3h6"/><path d="M17 13h4"/>',
  // A tank: cylinder with a fill line.
  tank: '<rect x="5" y="4" width="14" height="16" rx="3"/><path d="M5 14h14"/>',
  // A filter: a funnel of media.
  filter: '<path d="M4 4h16l-6 7v8l-4 2v-10z"/>',
  // A membrane / RO vessel: pressure tube with an element inside.
  membrane:
    '<rect x="3" y="7" width="18" height="10" rx="5"/><path d="M9 7v10M15 7v10"/>',
  // A valve: two triangles meeting at the stem.
  valve: '<path d="M5 7l7 5-7 5zM19 7l-7 5 7 5z"/><path d="M12 12V4"/>',
  // An exchanger: two passes crossing.
  exchanger:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h10M11 14h10"/>',
  // A system: the boundary everything sits inside.
  system: '<rect x="3" y="5" width="18" height="14" rx="2" stroke-dasharray="3 2"/>',
  // A measurement: a gauge.
  measurement: '<circle cx="12" cy="12" r="8"/><path d="M12 12l4-3"/>',
  // Anything unrecognised.
  equipment: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M4 12h16"/>',
}

/**
 * Label words that pick a glyph, longest-first so "membrane filter" lands on
 * the membrane rather than the funnel.
 */
const KEYWORDS: [string, keyof typeof GLYPHS][] = [
  ['membrane', 'membrane'],
  ['osmosis', 'membrane'],
  ['cartridge', 'filter'],
  ['filter', 'filter'],
  ['strainer', 'filter'],
  ['exchanger', 'exchanger'],
  ['pump', 'pump'],
  ['tank', 'tank'],
  ['vessel', 'tank'],
  ['basin', 'tank'],
  ['valve', 'valve'],
  ['sensor', 'measurement'],
  ['meter', 'measurement'],
]

export function glyphNameFor(node: Pick<GraphNode, 'label' | 'kind'>): keyof typeof GLYPHS {
  if (node.kind === 'system') return 'system'
  if (node.kind === 'measurement') return 'measurement'

  const label = node.label.toLowerCase()
  for (const [word, glyph] of KEYWORDS) {
    if (label.includes(word)) return glyph
  }
  return 'equipment'
}

/**
 * One glyph as a data URI.
 *
 * Three details, each of which silently produces *no icon at all* if missed:
 *
 *   - **`width` and `height` on the root.** An SVG with only a viewBox has
 *     no intrinsic size, and a renderer drawing it as an image has nothing
 *     to scale from -- it draws nothing rather than guessing.
 *   - **`charset=utf-8`.** The `;utf8,` form seen in a lot of examples is
 *     not a real media-type parameter.
 *   - **`encodeURIComponent`.** `#` in a colour would end the URI early.
 *     It also keeps the markup legible in the debugger, unlike base64.
 */
export function iconDataUri(glyph: keyof typeof GLYPHS, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" ` +
    `stroke-linejoin="round">${GLYPHS[glyph]}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function iconFor(node: Pick<GraphNode, 'label' | 'kind'>, color: string): string {
  return iconDataUri(glyphNameFor(node), color)
}
