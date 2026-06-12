# Value Features Design — Insights, Local Embeddings, Timeline, Export, Neighbors

Date: 2026-06-12
Status: Approved (user requested implementation of all five directions A–E)

## Goal

Move the plugin from "pretty 3D visualization" to an actionable knowledge tool by adding
five features on top of the existing embedding infrastructure:

- **A. Insights** — suggested links, duplicate detection, orphan notes, cluster MOC generation
- **B. Local embeddings** — Ollama provider so no OpenAI API key is required
- **C. Timeline** — replay vault growth over time using note creation dates
- **D. HTML export** — standalone interactive HTML snapshot of the current graph
- **E. Semantic neighbors** — sidebar view showing the active note's nearest semantic neighbors

## A. Insights

New pure-logic module `src/insights.ts`:

- `cosineSimilarity(a, b)` on raw vectors (normalized internally once per batch).
- `computeSuggestedLinks(embeddings, existingLinks, maxCount)` — ranks all unlinked note
  pairs by cosine similarity and returns the top `maxCount` (default 20). No absolute
  threshold: similarity scales differ per embedding model, so ranking is more robust.
- `computeDuplicates(embeddings, threshold=0.93)` — near-identical note pairs.
- `computeOrphans(nodes, links)` — degree-0 notes (works without embeddings).

UI: an "Insights" toolbar button in the graph view opens a right-side overlay panel with
sections: Suggested links / Potential duplicates / Orphan notes / Clusters (MOC).

- Suggested link rows show `A ↔ B (NN%)` with an **insert link** button that appends a
  markdown link (via `fileManager.generateMarkdownLink`) to the source note.
- Suggested pairs are also drawn in the 3D scene as dashed lines (separate
  `THREE.LineSegments` with `LineDashedMaterial`, not part of the force-graph data).
- Clusters section lists folder cluster regions with a **Create MOC** button that writes
  `MOC - <folder>.md` containing links to every note in the cluster.

Embeddings-dependent sections show a hint when no vectors are available.
Insights are computed lazily on first panel open per graph load and capped for very large
vaults (pairwise similarity is O(n²·d)).

## B. Local embeddings (Ollama)

- `EmbeddingProvider` becomes `"openai" | "ollama"`.
- New `OllamaEmbeddingAdapter` using `requestUrl` against `<endpoint>/api/embed`
  (`{ model, input: string[] }` → `{ embeddings: number[][] }`). Default endpoint
  `http://localhost:11434`, default model `nomic-embed-text`, smaller batch size (16).
- `canGenerateEmbeddings` returns true for the Ollama provider without an API key.
- Settings: provider dropdown; provider-specific model presets; endpoint field shown for
  Ollama; API key field shown for OpenAI. Cache model id already includes the provider so
  existing caches invalidate correctly.
- `main.ts` migration: stop forcing provider to `openai`; validate provider/model pairs.

Out of scope (deliberate): transformers.js in-process embeddings (multi-MB bundle,
runtime model download) and Smart Connections cache import (their `.ajson` format is
version-dependent and brittle). Ollama covers the "no API key" value with far less risk.

## C. Timeline

- `GraphNode` gains `ctime` (from `file.stat.ctime`).
- Renderer gains `setTimeFilter(cutoffMs | null)`: hides node objects with `ctime > cutoff`
  and link/suggestion lines touching hidden nodes. Direct visibility toggling on tracked
  objects; no force-graph rebuild.
- Graph view gains a toolbar "timeline" toggle revealing a bottom bar: play/pause button,
  range slider over `[min ctime, max ctime]`, current date label. Play animates the slider
  over ~15 seconds. Closing the bar clears the filter.

## D. HTML export

- New `src/html-export.ts`: `buildGraphExportHtml(data, options)` produces a standalone
  HTML document embedding the positioned graph JSON, loading `3d-force-graph` from a CDN,
  reproducing node colors/sizes/positions and links on a dark background.
- Node click opens `obsidian://open?vault=<name>&file=<path>` so the export links back to
  the vault. Hover shows the note name.
- Toolbar "export" button downloads `semantic-graph.html` via blob anchor (same pattern as
  the existing vector export). Requires internet when *viewing* (CDN script).

## E. Semantic neighbors sidebar

- New `NeighborsView` (`semantic-graph-neighbors` view type) registered for the right
  sidebar, plus a command and ribbon-less activation from the graph toolbar.
- Shows for the active markdown note: a mini 3D graph (reusing `GraphRenderer`) with the
  active note centered and its top-N neighbors placed at distance proportional to
  `1 - similarity`, and a list with similarity percentages; click opens the note.
- Vectors come from the existing embedding cache (read-only — never triggers API calls)
  or uploaded vectors. When absent, shows a hint to generate embeddings first.
- Updates on `active-leaf-change` / `file-open`.

## Settings additions

| Setting | Default |
| --- | --- |
| `embeddingProvider` | `openai` |
| `ollamaEndpoint` | `http://localhost:11434` |
| `suggestedLinkCount` (insights top-K) | 20 |
| `neighborCount` (sidebar top-N) | 10 |

## Error handling

- Ollama request failures surface the HTTP/connection error and fall back to the
  clustered sphere layout (existing catch path in `loadGraph`).
- Insights/neighbors degrade gracefully without embeddings (hint text instead of data).
- MOC creation refuses to overwrite an existing file (unique suffixed name instead).

## Testing

`npm run build` (tsc type-check + esbuild) is the gate; `src/insights.ts` is written as
pure functions with a small node-based smoke test run during development. The project has
no test harness; introducing one is out of scope for this change.
