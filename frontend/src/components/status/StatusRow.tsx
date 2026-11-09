import type { LabeledStatus } from './describe'
import StatusDot from './StatusDot'

// One line of the status panel: ● Label: text, with an optional smaller detail line under it
function StatusRow({ label, tone, text, detail }: LabeledStatus) {
  return (
    <li className="status-row">
      <StatusDot tone={tone} />
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
