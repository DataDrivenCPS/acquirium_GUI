import type { RowStatus } from './describe'

type StatusRowProps = RowStatus & { label: string } // & combines two types: the row's status plus its label

// One line of the status panel: ● Label: text, with an optional smaller detail line under it
function StatusRow({ label, tone, text, detail }: StatusRowProps) {
  return (
    <li className="status-row">
      <span className={`status-dot status-dot--${tone}`} aria-hidden="true" /> {/* the dot is decoration; screen readers read the text */}
      <div>
        <p>
          {label}: <strong>{text}</strong>
        </p>
        {detail && <p className="status-detail">{detail}</p>} {/* only rendered when there is a detail */}
      </div>
    </li>
  )
}

export default StatusRow
