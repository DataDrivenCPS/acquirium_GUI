import { useId, useState } from 'react'
import CollapseToggle from '../layout/CollapseToggle'
import PolledStatusRow from './PolledStatusRow'
import StatusRow from './StatusRow'
import {
  describeAcquirium,
  describeAddress,
  describeBackend,
  describeConfig,
  describeEmbeddings,
  describeGraph,
} from './describe'
import './StatusPanel.css'

// The right-hand panel: one row per part of the system, each re-checked every few seconds.
// Clicking its title collapses it to a narrow strip, leaving more width for the windows.
// To add a check: write a describe function in describe.ts and add a row here.
function StatusPanel() {
  const [collapsed, setCollapsed] = useState(false)
  const listId = useId()
  return (
    <aside className={`status-panel${collapsed ? ' status-panel--collapsed' : ''}`} aria-label="System status">
      <h2>
        <CollapseToggle label="Status" collapsed={collapsed} controls={listId} onToggle={() => setCollapsed(!collapsed)} />
      </h2>
      {/* hidden, not removed: the rows keep checking while collapsed */}
      <ul id={listId} hidden={collapsed}>
        {/* If this page is showing, the frontend is running. MODE is 'development' under npm run dev. */}
        <StatusRow label="Frontend" tone="ok" text="running" detail={`${import.meta.env.MODE} mode`} />
        <PolledStatusRow label="Backend API" url="/api/" describe={describeBackend} />
        <PolledStatusRow label="Acquirium server" url="/api/server-health" describe={describeAcquirium} />
        <PolledStatusRow label="Embedding indexes" url="/api/embedding-status" describe={describeEmbeddings} />
        <PolledStatusRow label="Graph" url="/api/graph-status" describe={describeGraph} />
        <PolledStatusRow label="Config" url="/api/runtime-info" describe={describeConfig} />
        <PolledStatusRow label="Acquirium address" url="/api/runtime-info" describe={describeAddress} />
      </ul>
    </aside>
  )
}

export default StatusPanel
