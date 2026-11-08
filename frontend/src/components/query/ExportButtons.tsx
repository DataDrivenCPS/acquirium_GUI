import { download, exportFileName, FORMATS, toFormat, type ExportTable } from './exportTable'

type ExportButtonsProps = {
  table: ExportTable | null // what is shown; null before the first run
  view: 'metadata' | 'readings'
  truncated: boolean // the page holds only the first rows of a longer result
}

// Buttons that save the table as it is shown (the same headers and names) as a CSV, JSON or text file
function ExportButtons({ table, view, truncated }: ExportButtonsProps) {
  const empty = table === null || table.rows.length === 0
  return (
    <div className="export-buttons" role="group" aria-label="Export results">
      <span>Export:</span>
      {FORMATS.map(({ format, label, mime }) => (
        <button
          key={format}
          type="button"
          aria-label={`Export as ${label}`}
          disabled={empty}
          title={empty ? 'Run a query with results to export them' : undefined}
          onClick={() => table && download(exportFileName(view, format), toFormat(table, format), mime)}
        >
          {label}
        </button>
      ))}
      {truncated && <span className="muted">Only the rows shown are exported.</span>}
    </div>
  )
}

export default ExportButtons
