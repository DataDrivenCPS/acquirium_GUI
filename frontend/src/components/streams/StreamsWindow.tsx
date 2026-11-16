import { useState } from 'react'
import type { Stream, StreamsResponse } from '../../api/types'
import { usePolledJson } from '../../hooks/usePolledJson'
import DataTable, { type Column } from '../layout/DataTable'
import PolledBody from '../layout/PolledBody'
import Window from '../layout/Window'
import { formatTime, formatValue, localName, NONE, unitName } from '../../format'
import { matchesFilter } from './filter'

const COLUMNS: Column<Stream>[] = [
  { header: 'Label', cell: (s) => s.label ?? NONE }, // ?? uses the right side when the left is null
  { header: 'Latest value', cell: (s) => formatValue(s.latest_value), numeric: true },
  { header: 'Unit', cell: (s) => <abbr title={s.unit ?? undefined}>{unitName(s.unit)}</abbr> },
  { header: 'Latest reading (local time)', cell: (s) => formatTime(s.latest_time) },
  { header: 'Quantity kind', cell: (s) => <abbr title={s.quantity_kind ?? undefined}>{localName(s.quantity_kind)}</abbr> },
  { header: 'Source', cell: (s) => s.data_source ?? NONE },
  { header: 'Point', cell: (s) => <code>{s.point}</code> },
]

type StreamsWindowProps = {
  selected: string[] // the points of the streams picked so far
  onSelect: (points: string[]) => void
}

// The selection after a click on `point`: a plain click picks just that stream; with Ctrl (or Cmd on a Mac) held, it is added to the picks, or taken out if it is already one
function clicked(selected: string[], point: string, additive: boolean): string[] {
  if (!additive) return [point]
  return selected.includes(point) ? selected.filter((other) => other !== point) : [...selected, point]
}

// Every stream Acquirium records, with its newest reading, refreshed every few seconds. Clicking a stream picks
// it (a bar marks its row) so the query results show it; Ctrl-click (Cmd-click) picks several.
function StreamsWindow({ selected, onSelect }: StreamsWindowProps) {
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
                selected={(s) => selected.includes(s.point)}
                onRowClick={(s, event) => onSelect(clicked(selected, s.point, event.ctrlKey || event.metaKey))}
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
