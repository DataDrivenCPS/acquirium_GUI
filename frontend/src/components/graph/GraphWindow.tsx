import Window from '../layout/Window'

// Placeholder for a graph beside the Streams window. It has no data yet; it only reserves the space.
function GraphWindow() {
  return (
    <Window title="Graph" area="graph">
      <p className="muted">Placeholder: no graph yet.</p>
    </Window>
  )
}

export default GraphWindow
