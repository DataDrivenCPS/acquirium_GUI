import type { Tone } from './describe'

// A small colored dot for a tone (colors in StatusPanel.css). It's decoration, so screen
// readers skip it (aria-hidden); the text next to it always says the same thing in words.
function StatusDot({ tone }: { tone: Tone }) {
  return <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />
}

export default StatusDot
