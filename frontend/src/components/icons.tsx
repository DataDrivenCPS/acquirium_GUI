/**
 * The icon set, hand-drawn as inline SVG.
 *
 * No icon font and no icon package: the app has to run with no network at
 * all, and a handful of 16px glyphs is not worth a dependency. Everything
 * strokes in `currentColor`, so an icon takes the colour of whatever it sits
 * in and the per-kind card colours work without duplicating them here.
 */

const shared = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const

/** Equipment: a unit on the plant floor. */
export function EquipmentIcon() {
  return (
    <svg {...shared}>
      <rect x="2.5" y="4.5" width="11" height="8" rx="1.5" />
      <path d="M5.5 4.5V3M10.5 4.5V3M2.5 8.5h11" />
    </svg>
  )
}

/** A connection between two units. */
export function ConnectionIcon() {
  return (
    <svg {...shared}>
      <circle cx="3.5" cy="8" r="2" />
      <circle cx="12.5" cy="8" r="2" />
      <path d="M5.5 8h5" />
    </svg>
  )
}

/** A measurement: a trace over time. */
export function MeasurementIcon() {
  return (
    <svg {...shared}>
      <path d="M2 12.5V3" />
      <path d="M2 12.5h12" />
      <path d="M4 10l3-3 2.5 2L14 4.5" />
    </svg>
  )
}

/** A condition narrowing what matches. */
export function ConditionIcon() {
  return (
    <svg {...shared}>
      <path d="M2.5 3.5h11l-4.2 5v4.2L6.7 14V8.5z" />
    </svg>
  )
}

export function PlusIcon() {
  return (
    <svg {...shared}>
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  )
}

export function CloseIcon() {
  return (
    <svg {...shared}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg {...shared}>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8a1 1 0 001 .9h3.8a1 1 0 001-.9l.6-8" />
    </svg>
  )
}

/** Flow running away from this unit. */
export function DownstreamIcon() {
  return (
    <svg {...shared}>
      <path d="M3 8h8M8.5 5l3 3-3 3" />
    </svg>
  )
}

/** Flow running into this unit. */
export function UpstreamIcon() {
  return (
    <svg {...shared}>
      <path d="M13 8H5M7.5 5l-3 3 3 3" />
    </svg>
  )
}

export function EitherWayIcon() {
  return (
    <svg {...shared}>
      <path d="M3 8h10M5 5.5L2.5 8 5 10.5M11 5.5L13.5 8 11 10.5" />
    </svg>
  )
}

export function ListIcon() {
  return (
    <svg {...shared}>
      <path d="M5.5 4.5h8M5.5 8h8M5.5 11.5h8M2.5 4.5h.01M2.5 8h.01M2.5 11.5h.01" />
    </svg>
  )
}

/** The step-building tab. */
export function BuildIcon() {
  return (
    <svg {...shared}>
      <rect x="2.5" y="2.5" width="6" height="5" rx="1.2" />
      <rect x="7.5" y="8.5" width="6" height="5" rx="1.2" />
      <path d="M5.5 7.5v3a1 1 0 001 1h1" />
    </svg>
  )
}

/** A table of rows. */
export function TableIcon() {
  return (
    <svg {...shared}>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1.2" />
      <path d="M2.5 6.5h11M6.5 6.5v6" />
    </svg>
  )
}

/** Generated query text. */
export function CodeIcon() {
  return (
    <svg {...shared}>
      <path d="M5.5 5.5L3 8l2.5 2.5M10.5 5.5L13 8l-2.5 2.5" />
    </svg>
  )
}

/** Ask in plain English. */
export function ChatIcon() {
  return (
    <svg {...shared}>
      <path d="M13.5 9.5a2 2 0 01-2 2H6l-3 2v-2H4.5a2 2 0 01-2-2v-5a2 2 0 012-2h7a2 2 0 012 2z" />
    </svg>
  )
}

export function SettingsIcon() {
  return (
    <svg {...shared}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7L3.6 3.6" />
    </svg>
  )
}

export function ChevronLeftIcon() {
  return (
    <svg {...shared}>
      <path d="M10 3.5L5.5 8l4.5 4.5" />
    </svg>
  )
}

export function ChevronRightIcon() {
  return (
    <svg {...shared}>
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  )
}

export function ZoomInIcon() {
  return (
    <svg {...shared}>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2l3.3 3.3M7 5.2v3.6M5.2 7h3.6" />
    </svg>
  )
}

export function ZoomOutIcon() {
  return (
    <svg {...shared}>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2l3.3 3.3M5.2 7h3.6" />
    </svg>
  )
}

/** Fit the whole plant back into view. */
export function FitIcon() {
  return (
    <svg {...shared}>
      <path d="M2.5 5.5v-3h3M13.5 5.5v-3h-3M2.5 10.5v3h3M13.5 10.5v3h-3" />
    </svg>
  )
}

/** Toggle the labels on connections. */
export function TagIcon() {
  return (
    <svg {...shared}>
      <path d="M2.5 7V3.5a1 1 0 011-1H7l6 6-4.5 4.5z" />
      <path d="M5.2 5.2h.01" />
    </svg>
  )
}

export function ChevronDownIcon() {
  return (
    <svg {...shared}>
      <path d="M3.5 6L8 10.5 12.5 6" />
    </svg>
  )
}

/** Re-run a retrieval without changing the query. */
export function RefreshIcon() {
  return (
    <svg {...shared}>
      <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9" />
      <path d="M13.5 2v3.5H10" />
    </svg>
  )
}
