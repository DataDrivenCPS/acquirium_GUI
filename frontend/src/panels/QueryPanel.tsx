/**
 * The query tab: build it, see what it matches, read the data -- in one
 * place, in that order.
 *
 * These were three separate tabs, which made the single most useful thing
 * about this app invisible: change a step, watch the rows change. Splitting
 * cause from effect across a tab switch meant you could only ever see one of
 * them. Stacked, the whole chain is on screen at once, and each band
 * collapses when it is not what you are working on.
 *
 * The order is the order the work happens in, and each band's header says
 * enough -- a row count, a reason there is nothing -- to be useful while
 * collapsed.
 */

import { useState } from 'react'

import { Panel } from '../components/Panel'
import { Section } from '../components/Section'
import { useQuery } from '../state/QueryContext'
import { hasMeasurement } from '../state/queryReducer'
import { DataframeControls, DataframeView } from './DataframePanel'
import { MetadataView, metadataSummary } from './MetadataPanel'
import { QueryBuilder } from './QueryBuilderPanel'

export function QueryPanel() {
  const { state, metadata, dataframe, config } = useQuery()

  // Which bands are open is per-session UI state, deliberately not persisted:
  // every query starts at the builder.
  const [open, setOpen] = useState({ build: true, matches: true, data: true })
  const toggle = (band: keyof typeof open) =>
    setOpen((current) => ({ ...current, [band]: !current[band] }))

  const empty = state.steps.length === 0

  return (
    // No title: the dock's own tab says "Query", and a second copy of the
    // word costs the builder a header's worth of height.
    <Panel>
      <div className="sections">
        <Section
          title="Build"
          open={open.build}
          onToggle={() => toggle('build')}
          summary={empty ? 'nothing yet' : undefined}
        >
          <QueryBuilder />
        </Section>

        <Section
          title="What this matches"
          open={open.matches}
          onToggle={() => toggle('matches')}
          summary={
            empty
              ? undefined
              : metadata.error
                ? 'error'
                : metadataSummary(metadata.data?.rows.length ?? null, metadata.loading)
          }
        >
          <MetadataView />
        </Section>

        <Section
          title="Readings"
          open={open.data}
          onToggle={() => toggle('data')}
          summary={dataSummary({
            measured: hasMeasurement(state),
            rows: dataframe.data?.rows.length ?? null,
            loading: dataframe.loading,
            auto: config?.auto_retrieve_data !== false,
          })}
          actions={<DataframeControls />}
        >
          <DataframeView />
        </Section>
      </div>
    </Panel>
  )
}

/**
 * What the readings band says about itself while collapsed.
 *
 * "no measurements yet" is the important one: it is the difference between
 * "there is no data" and "you have not asked for any".
 */
function dataSummary({
  measured,
  rows,
  loading,
  auto,
}: {
  measured: boolean
  rows: number | null
  loading: boolean
  auto: boolean
}): string {
  if (!measured) return 'no measurements yet'
  if (loading) return 'retrieving…'
  if (rows !== null) return `${rows} row${rows === 1 ? '' : 's'}`
  return auto ? 'waiting for the query to settle' : 'not retrieved'
}
