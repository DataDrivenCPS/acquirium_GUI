import { useState } from 'react'
import type { Stream, StreamsResponse } from '../../api/types'
import { usePolledJson } from '../../hooks/usePolledJson'
import DataTable, { type Column } from '../layout/DataTable'
import PolledBody from '../layout/PolledBody'
import Window from '../layout/Window'
import { formatTime, formatValue, NONE } from '../../format'
import { matchesFilter } from './filter'

const COLUMNS: Column<Stream>[] = [
  { header: 'Label', cell: (s) => s.label ?? NONE }, // ?? uses the right side when the left is null
  { header: 'Latest value', cell: (s) => formatValue(s.latest_value), numeric: true },
  { header: 'Unit', cell: (s) => s.unit ?? NONE },
  { header: 'Latest reading (local time)', cell: (s) => formatTime(s.latest_time) },
  { header: 'Quantity kind', cell: (s) => s.quantity_kind ?? NONE },
  { header: 'Source', cell: (s) => s.data_source ?? NONE },
  { header: 'Point', cell: (s) => <code>{s.point}</code> },
]

// Every stream Acquirium records, with its newest reading, refreshed every few seconds
function StreamsWindow() {
  const result = usePolledJson<StreamsResponse>('/api/streams')
  const [filter, setFilter] = useState('') // what's typed in the filter box

  return (
    <Window title="Streams" area="streams" source={result.state === 'ok' ? result.data.source : undefined}>
      <PolledBody result={result}>
        {({ streams }) => {
          const shown = streams.filter((stream) => matchesFilter(stream, filter))
          return (
            <>
              <div className="window-toolbar">
                <input
                  type="search"
                  placeholder="Filter streams"
                  aria-label="Filter streams"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
                <span>{shown.length} of {streams.length} streams</span>
              </div>
              <DataTable
                columns={COLUMNS}
                rows={shown}
                rowKey={(s) => s.point}
                empty={streams.length === 0 ? 'No streams.' : 'No streams match the filter.'}
              />
            </>
          )
        }}
      </PolledBody>
    </Window>
  )
}

export default StreamsWindow
