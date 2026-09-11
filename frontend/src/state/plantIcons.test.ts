import { describe, expect, it } from 'vitest'

import { glyphNameFor, iconDataUri, iconFor } from './plantIcons'

const equipment = (label: string) => ({ label, kind: 'equipment' as const })

describe('choosing a glyph', () => {
  it('recognises the plant vocabulary', () => {
    expect(glyphNameFor(equipment('Pump'))).toBe('pump')
    expect(glyphNameFor(equipment('Tank'))).toBe('tank')
    expect(glyphNameFor(equipment('Valve'))).toBe('valve')
    expect(glyphNameFor(equipment('Pressure Exchanger'))).toBe('exchanger')
  })

  it('prefers the more specific word in a compound name', () => {
    // Both "membrane" and "filter" appear; a membrane vessel is not a funnel.
    expect(glyphNameFor(equipment('Membrane Filter'))).toBe('membrane')
    expect(glyphNameFor(equipment('Reverse Osmosis Unit'))).toBe('membrane')
    expect(glyphNameFor(equipment('Cartridge Filter'))).toBe('filter')
  })

  it('is case-insensitive', () => {
    expect(glyphNameFor(equipment('MEDIA FILTER'))).toBe('filter')
  })

  it('falls back rather than guessing wildly', () => {
    expect(glyphNameFor(equipment('Clarifier'))).toBe('equipment')
    expect(glyphNameFor(equipment(''))).toBe('equipment')
  })

  it('lets the backend’s own kinds win over the label', () => {
    expect(glyphNameFor({ label: 'Treatment System', kind: 'system' })).toBe('system')
    // A measurement is a measurement even if it is called a pump reading.
    expect(glyphNameFor({ label: 'Pump Pressure', kind: 'measurement' })).toBe('measurement')
  })
})

describe('the data URI', () => {
  it('is an inline SVG, with nothing to fetch', () => {
    const uri = iconDataUri('pump', '#35618f')
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)

    // The offline rule is about *fetching*. The one http:// in an SVG is the
    // XML namespace, which is an identifier and is never requested; what
    // would break the rule is a reference out to another resource.
    const markup = decodeURIComponent(uri)
    expect(markup).not.toMatch(/<image|xlink:href|url\(/)
    expect(markup.match(/http/g)).toHaveLength(1)
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('escapes the colour, so a hex code cannot truncate the URI', () => {
    const uri = iconDataUri('tank', '#35618f')
    expect(uri).not.toContain('#')
    expect(uri).toContain('%23')
  })

  it('carries the glyph it was asked for', () => {
    const pump = decodeURIComponent(iconFor(equipment('Pump'), 'black'))
    const tank = decodeURIComponent(iconFor(equipment('Tank'), 'black'))
    expect(pump).not.toEqual(tank)
    expect(pump).toContain('<svg')
    expect(pump).toContain('viewBox="0 0 24 24"')
    // Without an intrinsic size an SVG drawn as an image renders as nothing.
    expect(pump).toContain('width="24" height="24"')
  })
})
