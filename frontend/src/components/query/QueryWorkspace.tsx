import PythonWindow from './PythonWindow'
import QueryBuilderWindow from './QueryBuilderWindow'
import QueryResultsWindow from './QueryResultsWindow'

// The three query windows. STUB: they hold their places in the layout but do nothing yet.
// The plan: this component owns the list of steps (QueryStep in api/types.ts). The builder edits it,
// the Python window sends it to POST /api/query/python (see hooks/useDebouncedPost), and Run sends it
// to POST /api/query/run (see postJson in api/http.ts) for the results window. Those backend routes
// exist and answer 501 Not Implemented until the query_builder package is filled in.
function QueryWorkspace() {
  return (
    // <>...</> adds no element, so each window is placed directly in the operator grid
    <>
      <QueryBuilderWindow />
      <PythonWindow />
      <QueryResultsWindow />
    </>
  )
}

export default QueryWorkspace
