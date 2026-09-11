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
 * Four rules keep it readable at plant scale:
 *
 *   - **A node is a tile with its name underneath.** Names to the side made
 *     the picture as wide as the longest label and left rows of text
 *     colliding across the middle of the plant; underneath, the tiles line
 *     up and the process chain is the thing you see first.
 *   - **Containment is drawn differently from flow.** "Treatment System
 *     contains Pump" is true of everything and says nothing about how water
 *     moves, so those edges are dashed, pale and arrowless while flow edges
 *     are solid and arrowed. Same information, one of them no longer
 *     shouting.
 *   - **Connection labels are off by default.** A hub like "Treatment System"
 *     contains every unit in the plant, and a dozen copies of the word
 *     "contains" fanning out of one node is unreadable. Labels appear on the
 *     connections the query matched, on whatever the pointer is over, and
 *     everywhere if the operator asks for them.
 *   - **Hovering focuses.** The hovered node, its neighbours and the edges
 *     between them stay lit; the rest of the plant fades back rather than
 *     disappearing, so context is kept.
 *
 * Clicking a node opens a small menu rather than editing the query outright.
 * It used to add a step immediately, which is fine when the query is empty
 * and the only possible meaning is "start here", and opaque the moment it is
 * not: the same click silently meant "and connect it to whichever card is
 * selected". The menu says which, in words, before anything changes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import type { Core } from 'cytoscape'

import { PanelStatus } from '../components/Panel'
import {
  CloseIcon,
  ConnectionIcon,
  EquipmentIcon,
  FitIcon,
  TagIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../components/icons'
import { useQuery } from '../state/QueryContext'
import { iconFor } from '../state/plantIcons'
import { currentAlias, focusedAlias } from '../state/queryReducer'
import type { QueryState } from '../state/queryReducer'
import { stepLabel } from '../state/queryTree'
import type { GraphNode } from '../api/types'

/** Layout, in one place so the toolbar's re-fit matches the first run. */
const LAYOUT = {
  name: 'breadthfirst' as const,
  directed: true,
  padding: 40,
  // Room for a name sitting under each tile rather than beside it.
  spacingFactor: 1.35,
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
const MIN_ZOOM = 0.75
const MAX_ZOOM = 1.25

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

/** Where a node's menu goes, and what it needs to say. */
interface NodeMenu extends HoveredNode {
  id: string
  /** Rendered position, i.e. pixels inside the canvas. */
  x: number
  y: number
  /**
   * Hang the menu under the node, or over it.
   *
   * Under is the default -- it leaves the tile and its name in view above
   * the menu, which is how you check you clicked the right thing. A node in
   * the bottom of the canvas has no room under it, so that one flips.
   */
  above: boolean
}

/** Clear of the tile (26px) and the name sitting under it. */
const MENU_GAP = 54

export function GraphPanel() {
  const { state, dispatch, graph, subgraph } = useQuery()
  const container = useRef<HTMLDivElement | null>(null)
  const cy = useRef<Core | null>(null)
  const [showLabels, setShowLabels] = useState(false)
  /** What the pointer is over, for the detail card. */
  const [hovered, setHovered] = useState<HoveredNode | null>(null)
  /** The node that was clicked, and what can be done with it. */
  const [menu, setMenu] = useState<NodeMenu | null>(null)

  // Read inside Cytoscape's own handlers, which are bound once per model.
  const showLabelsRef = useRef(showLabels)
  showLabelsRef.current = showLabels

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
            // part of the tile rather than pasted on.
            icon: iconFor(node, iconColour(node.kind)),
          },
        })),
        ...graph.data.edges.map((edge) => ({
          data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label },
        })),
      ],
      style: [
        // A node is a tile with its name under it. Sizing the tile rather
        // than the text is what makes the icon reliable: a node whose width
        // comes from its label has nowhere to put a picture.
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 7,
            'text-wrap': 'wrap',
            'text-max-width': '110px',
            'text-justification': 'center',
            'font-size': 11,
            'font-weight': 600,
            'line-height': 1.35,
            color: '#26303a',
            'text-background-color': '#f4f6f8',
            'text-background-opacity': 0.92,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'background-color': '#ffffff',
            'background-image': 'data(icon)',
            'background-fit': 'contain',
            'background-clip': 'node',
            'background-width': '56%',
            'background-height': '56%',
            'border-width': 2,
            'border-color': '#9fb1c2',
            shape: 'round-rectangle',
            width: 52,
            height: 52,
            'transition-property': 'border-color, background-color, opacity, border-width',
            'transition-duration': 120,
          },
        },
        // The same colours the builder's cards use, so a node and the card
        // that matched it read as the same kind of thing.
        {
          selector: 'node[kind = "equipment"]',
          style: { 'background-color': '#f3f8fd', 'border-color': '#7d9fc4' },
        },
        {
          selector: 'node[kind = "system"]',
          style: {
            'background-color': '#eef1f5',
            'border-color': '#9aa7b4',
            'border-style': 'dashed',
            color: '#4a5661',
          },
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
            'line-color': '#a9b8c6',
            'target-arrow-color': '#a9b8c6',
            width: 2,
            'arrow-scale': 1,
            'transition-property': 'line-color, opacity, width',
            'transition-duration': 120,
          },
        },
        // Containment, not flow: true of every unit in the plant and mute
        // about how water moves through it, so it is drawn as background.
        {
          selector: 'edge.structural',
          style: {
            'line-color': '#dde4ea',
            'line-style': 'dashed',
            'target-arrow-shape': 'none',
            width: 1.5,
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
            'border-width': 3,
            'border-style': 'solid',
            color: '#4a3607',
            'text-background-color': '#fff6e2',
          },
        },
        {
          selector: 'edge.matched',
          style: {
            'line-color': '#b8860b',
            'target-arrow-color': '#b8860b',
            'line-style': 'solid',
            width: 3,
          },
        },
        { selector: '.faded', style: { opacity: 0.18 } },
        { selector: 'node.hovered', style: { 'border-color': '#26619c', 'border-width': 3 } },
        // The node whose menu is open, held lit while the menu is up. Border
        // only: a matched node must keep its amber fill, or clicking one
        // would read as having dropped it out of the query.
        {
          selector: 'node.picked',
          style: {
            'border-color': '#26619c',
            'border-width': 4,
            'border-style': 'solid',
          },
        },
      ],
      // The plant is explored, not edited: dragging a node would only undo
      // the layout.
      autoungrabify: true,
      wheelSensitivity: 0.2,
      minZoom: 0.2,
      maxZoom: 3,
    })
    cy.current = instance

    // Containment is decided by the nodes it joins, so it is classified once
    // here rather than re-derived in a selector on every style pass.
    instance.edges().forEach((edge) => {
      if (edge.source().data('kind') === 'system' || edge.target().data('kind') === 'system') {
        edge.addClass('structural')
      }
    })

    // breadthfirst is a discrete layout and does not animate, so positions
    // are final by the time run() returns.
    flowOnly(instance).layout(LAYOUT).run()
    orientToWindow(instance)
    frameGraph(instance)

    instance.on('tap', 'node', (event) => {
      const node = event.target
      instance.nodes().removeClass('picked')
      node.addClass('picked')
      const at = node.renderedPosition()
      setMenu({
        id: node.id(),
        // The class label, not the relabelled instance one: what gets added
        // is the class, and a query for "CF1" is a different thing entirely.
        label: node.data('baseLabel'),
        kind: node.data('kind'),
        count: node.data('count') ?? 1,
        matched: node.hasClass('matched'),
        matchedAs: node.data('instanceLabel') ?? null,
        connections: node.closedNeighborhood().edges().length,
        x: at.x,
        y: at.y,
        above: at.y > instance.height() * 0.62,
      })
    })

    // Clicking the background is how you put the menu away.
    instance.on('tap', (event) => {
      if (event.target !== instance) return
      instance.nodes().removeClass('picked')
      setMenu(null)
    })

    // A menu pinned to a node has to go when the node moves out from under
    // it; re-anchoring it mid-pan would be worse than dismissing it.
    instance.on('viewport', () => {
      instance.nodes().removeClass('picked')
      setMenu(null)
    })

    instance.on('mouseover', 'node', (event) => {
      const node = event.target
      const near = node.closedNeighborhood()
      instance.elements().not(near).addClass('faded')
      node.addClass('hovered')
      near.edges().addClass('labelled')
      container.current?.classList.add('is-pointing')

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
      container.current?.classList.remove('is-pointing')
      applyLabels(instance, showLabelsRef.current)
      setHovered(null)
    })

    // The dock opening, collapsing or being dragged wider changes the canvas
    // size; Cytoscape has to be told, or it keeps drawing at the size it was
    // built at. Re-framing afterwards is what stops half the plant ending up
    // off-screen when the dock takes the left of the window.
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

  const closeMenu = useCallback(() => {
    cy.current?.nodes().removeClass('picked')
    setMenu(null)
  }, [])

  // Escape closes the menu, as it does the settings dialog.
  useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, closeMenu])

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

      {menu && (
        <NodeMenuCard
          menu={menu}
          anchorLabel={anchorLabel(state)}
          onClose={closeMenu}
          onAdd={(kind) => {
            dispatch({ type: 'add', kind, patch: { cls: { id: menu.id, label: menu.label } } })
            closeMenu()
          }}
        />
      )}

      {/* One overlay at a time: the menu already says everything the hover
          card would, and pinned rather than chasing the pointer. */}
      {hovered && !menu && <NodeCard node={hovered} />}

      <Legend />

      <div className="graph-notes">
        {graph.error && <PanelStatus kind="error">{graph.error}</PanelStatus>}
        {graph.data?.simplified && (
          <PanelStatus kind="info">
            Showing {graph.data.nodes.length} of {graph.data.total_nodes} node types. Raise the
            graph size limit in Settings to see more.
          </PanelStatus>
        )}
        {!graph.error && state.steps.length === 0 && !menu && (
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

/**
 * What a step added from the plant would attach to, in words.
 *
 * This is the thing the old click-to-add never said: "connected to" is only
 * meaningful if you know what it is connecting to, and that was an invisible
 * pointer. Mirrors the reducer's own default for an omitted `frm`.
 */
function anchorLabel(state: QueryState): string | null {
  const alias = focusedAlias(state) ?? currentAlias(state.steps)
  if (!alias) return null
  const step = state.steps.find((candidate) => candidate.alias === alias)
  return step ? stepLabel(step) : null
}

interface HoveredNode {
  label: string
  kind: GraphNode['kind']
  count: number
  matched: boolean
  matchedAs: string | null
  connections: number
}

function kindWord(kind: GraphNode['kind']): string {
  return kind === 'system' ? 'System' : kind === 'measurement' ? 'Measurement' : 'Equipment'
}

/**
 * What the pointer is over, in words.
 *
 * The graph can only show so much inside a tile. This is where the detail
 * goes -- how many real units the class stands for, how it is wired in, and
 * whether the current query has reached it.
 */
function NodeCard({ node }: { node: HoveredNode }) {
  return (
    <div className="node-card">
      <p className="node-card-title">{node.matchedAs ?? node.label}</p>
      <dl className="node-card-facts">
        <div>
          <dt>Kind</dt>
          <dd>{kindWord(node.kind)}</dd>
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
      <p className="node-card-cue">Click to use it in your query.</p>
    </div>
  )
}

/**
 * The clicked node, and what it can do to the query -- spelled out.
 *
 * With nothing built yet there is one sensible meaning and it is offered as
 * one button. Once there is a query there are two, and the difference
 * between them ("hang it off the Pump" versus "ask about it separately") is
 * exactly what the old silent click had to guess at.
 */
function NodeMenuCard({
  menu,
  anchorLabel: anchor,
  onAdd,
  onClose,
}: {
  menu: NodeMenu
  anchorLabel: string | null
  onAdd: (kind: 'entity' | 'related') => void
  onClose: () => void
}) {
  const started = anchor !== null

  return (
    <div
      className={`node-menu${menu.above ? ' is-above' : ''}`}
      style={{ left: menu.x, top: menu.y + (menu.above ? -MENU_GAP + 26 : MENU_GAP) }}
      role="dialog"
      aria-label={`${menu.label} — add to the query`}
    >
      <div className="node-menu-head">
        <div>
          <p className="node-menu-title">{menu.matchedAs ?? menu.label}</p>
          <p className="node-menu-facts">
            {kindWord(menu.kind)} · {menu.count} {menu.count === 1 ? 'unit' : 'units'} ·{' '}
            {menu.connections} {menu.connections === 1 ? 'connection' : 'connections'}
          </p>
        </div>
        <button type="button" className="qb-icon-button" title="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <div className="node-menu-actions">
        {!started ? (
          <button type="button" className="node-menu-action is-primary" onClick={() => onAdd('entity')}>
            <EquipmentIcon />
            Show me every {menu.label}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="node-menu-action is-primary"
              onClick={() => onAdd('related')}
            >
              <ConnectionIcon />
              Connect it to {anchor}
            </button>
            <button type="button" className="node-menu-action" onClick={() => onAdd('entity')}>
              <EquipmentIcon />
              Ask about it separately
            </button>
          </>
        )}
      </div>

      {menu.matched && (
        <p className="node-menu-matched">
          {menu.matchedAs
            ? `Already in your query as ${menu.matchedAs}.`
            : 'Already in your query.'}
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
        <span className="legend-swatch legend-measurement" />
        Measurement
      </span>
      <span className="legend-item">
        <span className="legend-swatch legend-system" />
        System
      </span>
      <span className="legend-item">
        <span className="legend-swatch legend-matched" />
        In your query
      </span>
      <span className="legend-item">
        <span className="legend-line" />
        Flow
      </span>
      <span className="legend-item">
        <span className="legend-line legend-line-structural" />
        Contains
      </span>
    </div>
  )
}
