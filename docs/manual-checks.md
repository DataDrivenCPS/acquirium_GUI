# Manual verification checklist

For UI flows that are awkward to unit test until browser-level test tooling exists. Per this
project's working style, "done" always has a check attached rather than being judged by eye —
so these are written down and walked deliberately, not eyeballed.

Start the app with `python -m acquirium_gui` (one terminal), then open
<http://127.0.0.1:5001>. Walking the list under `--dev` is equally valid; the URL is the
same either way.

Every check below passes against the **fixture** data. Re-walk the list once the live
adapter lands; the wording is deliberately about behaviour, not about fixture specifics,
except where a fixture value is named.

## The layout

The plant graph is the workspace and fills the window; everything else lives in the dock on
the left, one tab at a time.

- [ ] The plant fills the window, with the dock over its left edge and no part of the plant
      drawn underneath the dock.
- [ ] The tabs are **Query, Python, Ask**, and exactly one panel is on screen at a time.
      Switching tabs does not disturb the query or the graph.
- [ ] The **Query** tab holds three bands in order -- *Build*, *What this matches*,
      *Readings* -- all on screen together. Changing a step changes the rows below it
      without navigating anywhere.
- [ ] Collapse a band. Its header stays, carrying its summary (a row count, "no measurements
      yet"), and the others do not move.
- [ ] **Query** carries a badge with the number of rows matched.
- [ ] Press the chevron at the bottom of the tabs. The dock shrinks to just the tabs and the
      plant re-fits to the whole window — nothing is left stranded off-screen.
- [ ] Re-open it and the panel is exactly as it was: a half-typed query, a fetched table.
- [ ] The query sentence sits above the plant and stays there whichever tab is open, and
      whether the dock is open or collapsed.
- [ ] **Settings** opens as a dialog over the workspace and closes on *Close* or on a click
      outside it.

## The plant graph

- [ ] Each unit is drawn as a tile with a glyph for what it is -- a funnel for a filter, a
      volute for a pump, a vessel for the RO unit -- and its name beside it. A class the
      icons do not recognise gets a plain equipment box rather than nothing.
- [ ] A class with more than one real unit says so underneath its name ("2 units"). Build a
      query that pins it to one, and the node renames to that unit and drops the count.
- [ ] Hover a node. A card in the bottom-left gives its kind, how many units the plant has
      and how many connections it makes; if the query matches it, the card says so and names
      the unit.
- [ ] The legend at the bottom-left matches what is drawn: equipment, system, in your query.
- [ ] Connection labels are **off** by default: the plant reads as boxes and arrows, with no
      thicket of repeated words like "contains" fanning out of the system node.
- [ ] Hover a node. It outlines, its neighbours stay lit, the rest of the plant fades, and
      only its own connections are labelled.
- [ ] Press the label button in the bottom-right toolbar. Every connection is labelled, each
      label riding its own line on a white backing — none sits on top of another or on a box.
- [ ] Zoom in, zoom out, then press fit. The whole plant comes back at a readable size.
- [ ] Resize the window narrow and tall. The plant re-lays itself along the long axis rather
      than shrinking to fit the short one.

## Empty state

- [ ] The header shows a **Sample data** badge. (It must read *Connected to Acquirium* only
      when a real server is behind the adapter — an operator mistaking fixture readings for
      their own plant is the worst failure this app has.)
- [ ] The plant renders class-level boxes — "Pump", "Tank", "Reverse Osmosis Unit" — with
      no query built.
- [ ] Nothing anywhere on screen looks like a URI or a `prefix:Name` CURIE.
- [ ] The **Matches** tab says to add a step; it does not show an empty grid.
- [ ] The builder asks **"What are you looking for?"** and offers a chip per class of
      equipment installed ("Pump", "Tank", "Valve"...), drawn from the plant model. An
      operator who does not know the vocabulary is not left facing an empty text box.

## Free-text resolution (stories 1, 5)

- [ ] Type `pump` in the builder's text box. It accepts "Pump" on its own without offering
      a choice.
- [ ] Press *change*, then type `filter`. A picker of three filter classes appears and
      **nothing is selected until you click one**. This is the check that matters most: a
      silent pick here is a confidently wrong query.
- [ ] Each candidate says whether it is one specific thing or a class of them.
- [ ] Type `zzzzqq`. It says nothing matches, rather than selecting the closest thing.
- [ ] The dashed "in this plant" list is visually distinct from the resolver's picker. The
      two must never be mistaken for each other: one is a browse aid, the other is the
      disambiguation safety net.

## Building a query (the card canvas)

The builder draws the query as connected cards rather than a list of steps, so these are
the checks that the shape on screen is the query being sent.

- [ ] Click **Pump**. One card appears, selected, with its actions showing: *Follow a
      connection*, *Get measurements*, *Add a condition*.
- [ ] The sentence in the query bar reads **"Show me every Pump."** It changes with every
      edit, and always describes what the cards say.
- [ ] Press **Follow a connection**. A second card appears *indented under* the first, with
      a labelled line joining them, and the selection moves to it. The cursor is already in
      its text box.
- [ ] Type `tank`. The card becomes "Tank" and the sentence reads
      "…, then every Tank connected to Pump."
- [ ] Set the direction to **Downstream**. The line's label changes to *flows into* and the
      sentence to "…downstream of Pump". Nothing else moves.
- [ ] Click the **Pump** card. It is now the selected one, and the Tank card is not.
- [ ] Press **Get measurements**. The measurement card appears as a *second branch under
      Pump*, beside the Tank branch — not at the end of the chain. This is the branching
      that used to need a "Go back to" step.
- [ ] The three kinds of card are distinguishable without reading them: equipment, connection
      and measurement each have their own colour and icon.
- [ ] Press **Add a condition** on the Tank card. An unfinished chip appears, dashed, with
      its editor open. Choose *medium is Seawater* and press **Done**: the chip now reads
      the condition as a sentence, and so does the blue readback.
- [ ] Remove that chip. Both the card and the sentence drop it.
- [ ] Remove the **Pump** card. Everything hanging off it goes too — no card is left
      pointing at something that no longer exists.
- [ ] **Nowhere in the app does an alias appear.** Find-in-page for `e1`, `r1`, `m1` matches
      nothing — not in the builder, and not in the **Matches** column headers, which read
      "Pump", "Pump type", "Measurement", "Measures", "Unit".

## Live preview (story 7)

- [ ] Pick "Cartridge Filter". The **Matches** tab updates **without pressing anything**,
      and its badge shows the row count even while another tab is open.
- [ ] It shows a "type" column alongside the column naming what matched.
- [ ] Add a condition that cannot match (`medium is Permeate` on a pump). The panel explains
      that nothing matched; it does not error, blank out, or show a stack trace.

## Graph (stories 8, 9, 9a)

- [ ] With "Cartridge Filter" selected, that node is highlighted and every other node is not.
- [ ] Clicking a highlighted node adds a connection to it from the selected card, rather
      than starting a second query.
- [ ] The node's label changes from "Cartridge Filter" to **CF1** — the class collapses to
      the one real unit that matched.
- [ ] Remove the step. The label reverts to "Cartridge Filter".
- [ ] Select "Pump" instead. The node stays labelled "Pump", because two pumps match and
      naming one of them would be a lie.
- [ ] Build `RO` → **Follow a connection** → `Tank`. Both nodes *and the edge between
      them* highlight.
- [ ] With nothing built, click a node in the plant graph. It becomes the first card in the
      builder. Click another: it is added as a connection from the selected card.
- [ ] The graph layout does not reshuffle on each keystroke while you type in the builder.

## Retrieving readings (story 10, as amended)

Readings arrive on their own now. The cost of retrieval has not changed, so what is checked
here is that it stays *bounded*: debounced, gated on there being something to fetch, and
switchable back to manual.

- [ ] With no measurement step, the **Readings** band says so ("no measurements yet") and
      the refresh button is disabled. Nothing is requested.
- [ ] Add **Get measurements**. A table appears on its own, with `time` as the first column
      and one column per measurement point, with the unit in the header.
- [ ] Open the browser's network tab and type a class name into a card, letter by letter.
      `/api/query/metadata` fires per edit; `/api/query/execute` fires **once**, after the
      typing stops. This is the check that matters: retrieval must not follow every
      keystroke.
- [ ] Edit the query afterwards. The old rows clear rather than sitting there under a query
      that no longer produced them.
- [ ] Change the row count to 200. 200 rows come back without pressing anything else.
- [ ] Turn **Retrieve readings automatically** off in Settings. Edit the query: the band
      says "not retrieved" and `/api/query/execute` fires **never**, while *What this
      matches* keeps updating. Press refresh: exactly one retrieval.

## Settings (story 9b)

- [ ] Open **Settings**. Set the confidence threshold to `0.05` and the runner-up margin to
      `0`, save.
- [ ] Type `filter` again. It now resolves silently, with no picker — the setting, not a
      constant, decided that.
- [ ] Restart the backend and reopen the page. The changed values are still there.
- [ ] Set the graph size limit to `3`. The plant says how many node types it is hiding
      rather than silently showing a partial plant — and a query built beforehand keeps its
      highlight and its instance labels through the rebuild.
- [ ] Restore the defaults (0.72 / 0.08 / 3 / 150), or delete `acquirium-gui.toml`.

## Generated query (story 13)

- [ ] The **Python** tab shows nothing until asked: it is collapsed on arrival.
- [ ] Press **Show**. It prints a Python chain starting `acq.query()` that matches the steps
      built.
- [ ] It is the *only* place in the app where query text appears.

## Natural language (placeholder)

- [ ] The panel states plainly that it is not implemented; the input is disabled rather than
      accepting text that goes nowhere.

## Cross-cutting

- [ ] With the backend stopped, the page says the backend cannot be reached and names the
      command to start it — it does not show a blank screen or a raw fetch error.

## The launch command

- [ ] `python -m acquirium_gui` in a clean checkout builds the interface, then serves it.
      One terminal, one URL, nothing else to remember.
- [ ] Run it again. It starts immediately — no rebuild, because nothing changed.
- [ ] Edit a file under `frontend/src`, then run it again. It rebuilds before serving, so
      what is on screen is what is on disk.
- [ ] `--dev` starts Vite and the API together and Ctrl+C stops both; no node process is
      left holding port 5001 afterwards.
- [ ] With a dev server already running, `--dev` says the port is taken and stops, rather
      than sitting on a URL that serves nothing.
- [ ] Walk the whole list with the browser's find-in-page for `http` and `:` -shaped tokens.
      Nothing outside the generated-query panel matches.
- [ ] Repeat the first three sections in a second browser (the brief asks for Chrome, Safari,
      Firefox and Edge).
