import './CollapseToggle.css'

type CollapseToggleProps = {
  label: string // the panel's title, shown on the button
  collapsed: boolean
  controls: string // id of the element this button shows and hides
  onToggle: () => void
}

// A panel title that doubles as a show/hide button. aria-expanded tells screen readers
// whether the panel is open; the arrow is decoration, so it's hidden from them.
function CollapseToggle({ label, collapsed, controls, onToggle }: CollapseToggleProps) {
  return (
    <button type="button" className="collapse-toggle" aria-expanded={!collapsed} aria-controls={controls} onClick={onToggle}>
      <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span> {label}
    </button>
  )
}

export default CollapseToggle
