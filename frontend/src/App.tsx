import DriversWindow from './components/drivers/DriversWindow'
import GraphWindow from './components/graph/GraphWindow'
import QueryWorkspace from './components/query/QueryWorkspace'
import StatusPanel from './components/status/StatusPanel'
import StreamsWindow from './components/streams/StreamsWindow'
import './App.css'

function App() {
  return (
    // the operator windows fill the left and the status panel sits on the right (see .app-layout in App.css)
    <div className="app-layout">
      <main>
        <h1>Acquirium GUI</h1> {/* h1 is the page's main heading */}
        {/* each window places itself in a named cell of this grid (grid-template-areas in App.css).
            They're listed in the same order as on screen, so the Tab key moves through them top to bottom. */}
        <div className="operator-grid">
          <StreamsWindow />
          <GraphWindow />
          <QueryWorkspace />
          <DriversWindow />
        </div>
      </main>
      <StatusPanel />
    </div>
  )
}

export default App
