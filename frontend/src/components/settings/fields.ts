import type { Settings } from '../../api/types'

// How the Settings window lays out the settings the backend keeps (see backend/src/settings.py).
// Values, defaults and ranges come from the backend; the names, descriptions and grouping are page text, kept here.
export type FieldSpec = {
  name: string // the setting's key inside its group
  label: string
  description: string
  integer: boolean // whole numbers only
  slider: boolean // also drag a slider
}

export type GroupSpec = {
  key: keyof Settings // the group's key in the backend's settings
  title: string
  startsOpen: boolean
  fields: FieldSpec[]
}

export const GROUPS: GroupSpec[] = [
  {
    key: 'resolution',
    title: 'Text resolution',
    startsOpen: false,
    fields: [
      {
        name: 'min_score',
        label: 'Minimum Candidate Score',
        description: 'The minimum resolution score a candidate must meet to not trigger the candidate pick list.',
        integer: false,
        slider: true,
      },
      {
        name: 'margin',
        label: 'Candidate Tie Margin',
        description: 'If multiple candidate scores are within this margin, the candidate pick list is triggered.',
        integer: false,
        slider: true,
      },
      {
        name: 'candidate_count',
        label: 'Candidates Shown',
        description: 'The maximum amount of candidates the candidate pick list shows.',
        integer: true,
        slider: false,
      },
    ],
  },
  {
    key: 'results',
    title: 'Query results',
    startsOpen: true,
    fields: [
      {
        name: 'max_rows',
        label: 'Maximum Rows',
        description: 'The maximum amount of rows for every query result.',
        integer: true,
        slider: false,
      },
    ],
  },
]
