import type { Driver, DriversResponse } from '../../api/types'
import { usePolledJson } from '../../hooks/usePolledJson'
import DataTable, { type Column } from '../layout/DataTable'
import PolledBody from '../layout/PolledBody'
import Window from '../layout/Window'
import { formatTime } from '../../format'

const COLUMNS: Column<Driver>[] = [
  { header: 'Name', cell: (d) => d.name },
  {
    header: 'Status',
    // a failed driver's status reads 'failed: <reason>'; show it in the error color
    cell: (d) => <span className={d.status.startsWith('failed') ? 'text-error' : undefined}>{d.status}</span>,
  },
  { header: 'Interval (s)', cell: (d) => d.interval, numeric: true },
  { header: 'Started (local time)', cell: (d) => formatTime(d.started_at) },
  { header: 'Spec', cell: (d) => <code>{d.spec}</code> },
]

// The drivers feeding data into Acquirium, refreshed every few seconds
function DriversWindow() {
  const result = usePolledJson<DriversResponse>('/api/drivers')
  return (
    <Window title="Drivers" area="drivers" source={result.state === 'ok' ? result.data.source : undefined}>
      <PolledBody result={result}>
        {({ drivers }) => (
          <DataTable columns={COLUMNS} rows={drivers} rowKey={(d) => d.name} empty="No drivers." />
        )}
      </PolledBody>
    </Window>
  )
}

export default DriversWindow
