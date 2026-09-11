/**
 * The plant, and where the query is in it. This is the workspace -- it fills
 * the window, and everything else sits over it in the dock.
 *
 * Cytoscape is imported as a module and bundled at build time -- no CDN, per
 * the offline requirement. Two things drive it:
 *
 *   GET  /api/graph/model    the plant, class-level, fetched once
 *   POST /api/graph/subgraph what the current query touches, after every step
 *
 * Highlighting and relabeling are applied as classes and data updates on the
 * existing instance rather than by rebuilding it, so the layout stays put as
 * the user builds -- a graph that reshuffles on every keystroke is unusable.
 *
 * Two rules keep it readable at plant scale:
 *
 *   - **Connection labels are off by default.** A hub like "Treatment System"
 *     contains every unit in the plant, and a dozen copies of the word
 *     "contains" fanning out of one node is unreadable. Labels appear on the
 *     connections the query matched, on whatever the pointer is over, and
 *     everywhere if the operator asks for them.
 *   - **Hovering focuses.** The hovered node, its neighbours and the edges
 *     between them stay lit; the rest of the plant fades back rather than
 *     disappearing, so context is kept.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import type { Core } from 'cytoscape'

import { PanelStatus } from '../components/Panel'
import { FitIcon, TagIcon, ZoomInIcon, ZoomOutIcon } from '../components/icons'
import { useQuery } from '../state/QueryContext'
import { iconFor } from '../state/plantIcons'
import type { GraphNode } from '../api/types'

/** Layout, in one place so the toolbar's re-fit matches the first run. */
const LAYOUT = {
  name: 'breadthfirst' as const,
  directed: true,
  padding: 40,
  spacingFactor: 1.0,
  avoidOverlap: true,
  nodeDimensionsIncludeLabels: true,
}

/**
 * Lay the plant along the window's long axis.
 *
 * A process chain is long and thin, so on a wide window it should run left to
 * right and on a tall one top to bottom -- otherwise it is drawn across the
 * short side and shrinks to fit. Breadthfirst picks an orientation from the
 * viewport it happens to see when it runs, which is not reliably the one we
 * want (and its `transform` option, meant for exactly this, is not honoured
 * by the bundled version), so the finished positions are turned here if they
 * came out the wrong way round.
 */
function orientToWindow(instance: Core) {
  const box = instance.nodes().boundingBox()
  const wantsWide = instance.width() >= instance.height()
  const isWide = box.w >= box.h
  if (wantsWide === isWide) return

  instance.nodes().forEach((node) => {
    const { x, y } = node.position()
    node.position({ x: y, y: x })
  })
}

/** Keep the plant at a readable size however few or many nodes there are. */
const MIN_ZOOM = 0.8
const MAX_ZOOM = 1.3

/**
 * The layout is run over the *flow* only.
 *
 * A system node contains every unit in the plant, so its edges make every
 * other node a sibling one hop from it -- a star, with the process order
 * (filter, pump, RO, tank) nowhere in the picture. Those edges are still
 * drawn; they just do not get to decide where anything goes.
 */
function flowOnly(instance: Core) {
  return instance
    .elements()
    .filter(
      (element) =>
        element.isNode() ||
        (element.source().data('kind') !== 'system' &&
          element.target().data('kind') !== 'system'),
    )
}

/** Fit the plant, then stop it being drawn microscopically or hugely. */
function frameGraph(instance: Core) {
  instance.fit(undefined, 45)
  if (instance.zoom() < MIN_ZOOM) instance.zoom({ level: MIN_ZOOM, renderedPosition: { x: instance.width() / 2, y: instance.height() / 2 } })
  if (instance.zoom() > MAX_ZOOM) instance.zoom({ level: MAX_ZOOM, renderedPosition: { x: instance.width() / 2, y: instance.height() / 2 } })
}

export function GraphPanel() {
  const { state, dispatch, graph, subgraph } = useQuery()
  const container = useRef<HTMLDivElement | null>(null)
  const cy = useRef<Core | null>(null)
  const [showLabels, setShowLabels] = useState(false)
  /** What the pointer is over, for the detail card. */
  const [hovered, setHovered] = useState<HoveredNode | null>(null)

  // Read inside Cytoscape's own handlers, which are bound once per model.
  const showLabelsRef = useRef(showLabels)
  showLabelsRef.current = showLabels

  /**
   * Clicking the plant builds the query.
   *
   * Held in a ref because the Cytoscape instance is built once per model and
   * must not be rebuilt when the query changes -- the handler bound at build
   * time would otherwise close over the query as it was then.
   *
   * The node id doubles as the class reference sent back in `cls`, which is
   * the same contract the builder's suggestion chips rely on.
   */
  const onNodeTap = useRef<(id: string, label: string) => void>(() => undefined)
  onNodeTap.current = (id, label) => {
    const cls = { id, label }
    // Nothing built yet: this is where the query starts. Otherwise it is a
    // connection out of whichever card is selected.
    dispatch({ type: 'add', kind: state.steps.length === 0 ? 'entity' : 'related', patch: { cls } })
  }

  // Build once per model. The query changing must not land here.
  useEffect(() => {
    if (!container.current || !graph.data) return

    cy.current?.destroy()
    const instance = cytoscape({
      container: container.current,
      elements: [
        ...graph.data.nodes.map((node) => ({
          data: {
            id: node.id,
            label: nodeLabel(node),
            baseLabel: node.label,
            kind: node.kind,
            count: node.instance_count,
            // Drawn inside the node. Tinted per kind so the glyph reads as
            // part of the box rather than pasted on.
            icon: iconFor(node, iconColour(node.kind)),
          },
        })),
        ...graph.data.edges.map((edge) => ({
          data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label },
        })),
      ],
      style: [
        // A node is the glyph in a tile, with its name beside it. Sizing the
        // tile rather than the text is what makes the icon reliable: a node
        // whose width comes from its label has nowhere to put a picture.
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'text-valign': 'center',
            'text-halign': 'right',
            'text-margin-x': 7,
            'text-wrap': 'wrap',
            'text-justification': 'left',
            'font-size': 11,
            'font-weight': 600,
            'line-height': 1.3,
            color: '#1c2229',
            'text-background-color': '#f4f6f8',
            'text-background-opacity': 0.85,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'background-color': '#ffffff',
            'background-image': 'data(icon)',
            'background-fit': 'contain',
            'background-clip': 'node',
            'background-width': '62%',
            'background-height': '62%',
            'border-width': 1.5,
            'border-color': '#b9c4cf',
            shape: 'round-rectangle',
            width: 40,
            height: 40,
            'transition-property': 'border-color, background-color, opacity',
            'transition-duration': 120,
          },
        },
        // The same colours the builder's cards use, so a node and the card
        // that matched it read as the same kind of thing.
        {
          selector: 'node[kind = "system"]',
          style: { 'background-color': '#eef1f5', 'border-color': '#9aa7b4' },
        },
        {
          selector: 'node[kind = "measurement"]',
          style: { 'background-color': '#fbf0dc', 'border-color': '#c69a4e', color: '#6b4610' },
        },
        {
          selector: 'edge',
          style: {
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'line-color': '#ccd4dc',
            'target-arrow-color': '#ccd4dc',
            width: 1.5,
            'arrow-scale': 0.9,
            'transition-property': 'line-color, opacity, width',
            'transition-duration': 120,
          },
        },
        // Labels ride the line and carry a white backing, so they never sit
        // on top of the line or of each other.
        {
          selector: 'edge.labelled',
          style: {
            label: 'data(label)',
            'font-size': 9,
            color: '#4a5661',
            'text-rotation': 'autorotate',
            'text-background-color': '#ffffff',
            'text-background-opacity': 1,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
          },
        },
        // What the query currently touches.
        {
          selector: 'node.matched',
          style: {
            'background-color': '#ffd479',
            'border-color': '#b8860b',
            'border-width': 2.5,
            color: '#4a3607',
          },
        },
        {
          selector: 'edge.matched',
          style: { 'line-color': '#b8860b', 'target-arrow-color': '#b8860b', width: 2.5 },
        },
        { selector: '.faded', style: { opacity: 0.2 } },
        { selector: 'node.hovered', style: { 'border-color': '#26619c', 'border-width': 2.5 } },
      ],
      // The plant is explored, not edited: dragging a node would only undo
      // the layout.
      autoungrabify: true,
      wheelSensitivity: 0.2,
      minZoom: 0.2,
      maxZoom: 3,
    })
    cy.current = instance

    // breadthfirst is a discrete layout and does not animate, so positions
    // are final by the time run() returns.
    flowOnly(instance).layout(LAYOUT).run()
    orientToWindow(instance)
    frameGraph(instance)

    instance.on('tap', 'node', (event) => {
      const node = event.target
      // The class label, not the relabelled instance one: what gets added is
      // the class, and a query for "CF1" is a different thing entirely.
      onNodeTap.current(node.id(), node.data('baseLabel'))
    })

    instance.on('mouseover', 'node', (event) => {
      const node = event.target
      const near = node.closedNeighborhood()
      instance.elements().not(near).addClass('faded')
      node.addClass('hovered')
      near.edges().addClass('labelled')

      setHovered({
        label: node.data('baseLabel'),
        kind: node.data('kind'),
        count: node.data('count') ?? 1,
        matched: node.hasClass('matched'),
        // The instance label, when the query has pinned this class to one
        // real unit -- the same rename the node itself shows.
        matchedAs: node.data('instanceLabel') ?? null,
        // How it is wired into the rest of the plant.
        connections: near.edges().length,
      })
    })

    instance.on('mouseout', 'node', () => {
      instance.elements().removeClass('faded')
      instance.nodes().removeClass('hovered')
      applyLabels(instance, showLabelsRef.current)
      setHovered(null)
    })

    // The dock opening or collapsing changes the canvas size; Cytoscape has
    // to be told, or it keeps drawing at the size it was built at. Re-framing
    // afterwards is what stops half the plant ending up off-screen when the
    // dock takes the left of the window.
    const observer = new ResizeObserver(() => {
      instance.resize()
      frameGraph(instance)
    })
    if (container.current) observer.observe(container.current)

    return () => {
      observer.disconnect()
      instance.destroy()
      cy.current = null
    }
  }, [graph.data])

  // Apply highlighting and the class-to-instance relabel (story 9a).
  //
  // Depends on graph.data as well as the subgraph: changing the graph size
  // limit rebuilds the instance, and without re-applying here the query's
  // highlight and its instance labels would silently vanish from a query
  // that is still very much active.
  useEffect(() => {
    const instance = cy.current
    if (!instance) return

    const matchedNodes = new Set(subgraph.data?.highlighted_nodes ?? [])
    const matchedEdges = new Set(subgraph.data?.highlighted_edges ?? [])
    const relabeled = subgraph.data?.relabeled ?? {}

    instance.nodes().forEach((node) => {
      node.toggleClass('matched', matchedNodes.has(node.id()))
      // A relabelled node names one real unit, so the "2 units" line is no
      // longer true of it; falling back to the class label restores both.
      const named = relabeled[node.id()] ?? null
      node.data(
        'label',
        named ?? nodeLabel({ label: node.data('baseLabel'), instance_count: node.data('count') }),
      )
      // Recorded rather than inferred from the rendered label: that label
      // carries a count line of its own, so comparing the two would report
      // every multi-unit class as renamed.
      node.data('instanceLabel', named)
    })
    instance.edges().forEach((edge) => {
      edge.toggleClass('matched', matchedEdges.has(edge.id()))
    })
    applyLabels(instance, showLabels)
  }, [subgraph.data, showLabels, graph.data])

  const zoomBy = useCallback((factor: number) => {
    const instance = cy.current
    if (!instance) return
    instance.zoom({
      level: instance.zoom() * factor,
      renderedPosition: { x: instance.width() / 2, y: instance.height() / 2 },
    })
  }, [])

  return (
    <div className="graph">
      <div ref={container} className="graph-canvas" />

      <div className="graph-toolbar">
        <button
          type="button"
          className={`graph-tool${showLabels ? ' is-on' : ''}`}
          title={showLabels ? 'Hide connection labels' : 'Label every connection'}
          onClick={() => setShowLabels((on) => !on)}
        >
          <TagIcon />
        </button>
        <button type="button" className="graph-tool" title="Zoom in" onClick={() => zoomBy(1.25)}>
          <ZoomInIcon />
        </button>
        <button type="button" className="graph-tool" title="Zoom out" onClick={() => zoomBy(0.8)}>
          <ZoomOutIcon />
        </button>
        <button
          type="button"
          className="graph-tool"
          title="Fit the whole plant"
          onClick={() => cy.current && frameGraph(cy.current)}
        >
          <FitIcon />
        </button>
      </div>

      {hovered && <NodeCard node={hovered} />}

      <Legend />

      <div className="graph-notes">
        {graph.error && <PanelStatus kind="error">{graph.error}</PanelStatus>}
        {graph.data?.simplified && (
          <PanelStatus kind="info">
            Showing {graph.data.nodes.length} of {graph.data.total_nodes} node types. Raise the
            graph size limit in Settings to see more.
          </PanelStatus>
        )}
        {!graph.error && state.steps.length === 0 && (
          <p className="graph-hint">Click any part of the plant to ask about it.</p>
        )}
      </div>
    </div>
  )
}

/**
 * A node's two lines: what it is, and how many of them the plant has.
 *
 * The count is the answer to a question the class-level graph otherwise
 * raises and never answers -- one box saying "Pump" in a plant with two of
 * them. It is also why a node relabels to "CF1" but "Pump" stays "Pump".
 */
function nodeLabel(node: Pick<GraphNode, 'label' | 'instance_count'>): string {
  const count = node.instance_count ?? 1
  return count > 1 ? `${node.label}
${count} units` : node.label
}

/** The glyph takes its kind's colour, matching the builder's cards. */
function iconColour(kind: GraphNode['kind']): string {
  if (kind === 'measurement') return '#8a5a12'
  if (kind === 'system') return '#5c6772'
  return '#35618f'
}

/** Labels on: every connection. Labels off: only what the query matched. */
function applyLabels(instance: Core, showAll: boolean) {
  instance.edges().forEach((edge) => {
    edge.toggleClass('labelled', showAll || edge.hasClass('matched'))
  })
}

interface HoveredNode {
  label: string
  kind: GraphNode['kind']
  count: number
  matched: boolean
  matchedAs: string | null
  connections: number
}

/**
 * What the pointer is over, in words.
 *
 * The graph can only show so much inside a box. This is where the detail
 * goes -- how many real units the class stands for, how it is wired in, and
 * whether the current query has reached it.
 */
function NodeCard({ node }: { node: HoveredNode }) {
  const kindWord =
    node.kind === 'system' ? 'System' : node.kind === 'measurement' ? 'Measurement' : 'Equipment'

  return (
    <div className="node-card">
      <p className="node-card-title">{node.matchedAs ?? node.label}</p>
      <dl className="node-card-facts">
        <div>
          <dt>Kind</dt>
          <dd>{kindWord}</dd>
        </div>
        <div>
          <dt>In this plant</dt>
          <dd>
            {node.count} {node.count === 1 ? 'unit' : 'units'}
          </dd>
        </div>
        <div>
          <dt>Connections</dt>
          <dd>{node.connections}</dd>
        </div>
      </dl>
      {node.matched && (
        <p className="node-card-matched">
          {node.matchedAs
            ? `Your query matches this one: ${node.matchedAs}.`
            : 'Your query matches this.'}
        </p>
      )}
    </div>
  )
}

/** What the colours mean, small and always there. */
function Legend() {
  return (
    <div className="legend">
      <span className="legend-item">
        <span className="legend-swatch legend-equipment" />
        Equipment
      </span>
      <span className="legend-item">
        <span className="legend-swatch legend-system" />
        System
      </span>
      <span className="legend-item">
        <span className="legend-swatch legend-matched" />
        In your query
      </span>
    </div>
  )
}
