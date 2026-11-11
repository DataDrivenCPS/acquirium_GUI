import { useState } from 'react'
import { defaultFileName, download, exportFileName, FORMATS, toFormat, type ExportTable } from './exportTable'

type ExportButtonsProps = {
  table: ExportTable | null // what is shown; null before the first run
  view: 'metadata' | 'readings'
  truncated: boolean // the page holds only the first rows of a longer result
}

// A file name box and buttons that save the table as it is shown (the same headers and names) as a CSV, JSON or text file;
// the format's extension is added to the name
function ExportButtons({ table, view, truncated }: ExportButtonsProps) {
  const [name, setName] = useState('') // blank means the default name
  const empty = table === null || table.rows.length === 0
  return (
    <div className="export-buttons" role="group" aria-label="Export results">
      <span>Export:</span>
      <input
        type="text"
        aria-label="File name"
        placeholder="Enter a file name"
        title={`Left blank, the file is named ${defaultFileName(view)}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={empty}
      />
      {FORMATS.map(({ format, label, mime }) => (
        <button
          key={format}
          type="button"
          aria-label={`Export as ${label}`}
          disabled={empty}
          title={empty ? 'Run a query with results to export them' : undefined}
          onClick={() => table && download(exportFileName(view, format, name), toFormat(table, format), mime)}
        >
          {label}
        </button>
      ))}
      {truncated && <span className="muted">Only the rows shown are exported.</span>}
    </div>
  )
}

export default ExportButtons
