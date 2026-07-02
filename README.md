# Obsidian 3D Semantic Graph

Desktop-only Obsidian plugin that visualizes your notes in an interactive 3D space. Notes are positioned using OpenAI or local Ollama embeddings projected into 3D via UMAP or PCA, so semantically related notes cluster together. Without embeddings, the plugin uses a folder-based clustered sphere layout with ConvexHull cluster regions.

[Korean](./docs/README_KO.md)

## Features

- **Semantic 3D layout** — OpenAI or Ollama embeddings reduced to 3D coordinates via UMAP or PCA
- **Local embeddings (Ollama)** — run fully offline with a local Ollama server, no API key required
- **Insights panel** — suggested links (semantically close but unlinked note pairs, drawn as dashed lines and insertable with one click), potential duplicates, orphan notes, and per-cluster MOC (Map of Content) generation
- **Semantic neighbors sidebar** — a mini 3D view plus ranked list of the active note's nearest semantic neighbors
- **Timeline playback** — replay your vault's growth over time by note creation date (file created time by default; optionally frontmatter `created` / `date created`)
- **Interactive HTML export** — download the current graph as a standalone HTML file with deep links back into your vault
- **Korean and English UI** — language setting (auto / English / 한국어); auto follows the Obsidian app language
- **Clustered sphere fallback** — folder-based clustered layout with color-coded groups when no embeddings are available
- **ConvexHull cluster regions** — translucent 3D hulls that outline folder clusters (toggle: On / Hover / Off)
- **Note links** — real links from Obsidian's resolved references, togglable from the toolbar
- **Node coloring** — by folder or first tag
- **Uploaded vectors** — import/export custom vector JSON files as an alternative to API-generated embeddings
- **Appearance controls** — light/dark theme, grid, auto orbit, node size, opacity, drag sensitivity
- **Deterministic seeding** — same layout seed produces the same graph layout
- **Embedding cache** — reuses unchanged note vectors to minimize API calls
- **Folder exclusion** — skip specified folders from both graph and embedding generation

## How It Works

1. Markdown files are loaded from the vault, excluding folders listed in settings.
2. Nodes are created from files; links are built from Obsidian's resolved note references.
3. If an embedding provider (OpenAI API key or local Ollama) or uploaded vectors are available, embeddings are projected to 3D with UMAP or PCA.
4. Otherwise, a clustered sphere layout groups notes by top-level folder with ConvexHull regions.

### Using Ollama (no API key)

1. Install [Ollama](https://ollama.com) and pull an embedding model: `ollama pull nomic-embed-text`
2. In **Settings → 3D Semantic Graph**, set **Embedding provider** to **Ollama (local)**.
3. Open the graph — embeddings are generated locally and cached.

## Installation

Requires Obsidian **1.11.0 or newer** (desktop only).

### Community plugins

Search for **3D Semantic Graph** in **Settings → Community plugins** and install.

### Build from source

```bash
git clone <repository-url>
cd 3d-semantic-graph
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into:

```
<your-vault>/.obsidian/plugins/semantic-graph/
```

Then restart Obsidian and enable **3D Semantic Graph** in **Settings → Community plugins**.

## Development

```bash
npm run dev    # watch mode
npm run build  # production build
```

## Usage

1. Open **Settings → 3D Semantic Graph** and optionally configure an embedding provider (OpenAI or Ollama) or upload vectors.
2. Open the graph from the ribbon icon or the **Open 3D Semantic Graph** command.
3. **Toolbar controls:**
   - **Refresh** — rebuild the graph
   - **Reset Camera** — return to the default camera angle
   - **Links** — toggle link visibility
   - **Grid** — toggle XZ grid
   - **Clusters** — cycle cluster regions mode (On → Hover → Off)
   - **Insights** — open the insights panel (suggested links, duplicates, orphans, MOC)
   - **Timeline** — replay vault growth by note creation date
   - **Export HTML** — download a standalone interactive HTML snapshot
4. Click a node to select it. Shift-click to open the note.
5. Open the **Semantic neighbors** sidebar with the **Open semantic neighbors** command to see the active note's nearest notes.

## Settings

| Setting | Description | Default |
| --- | --- | --- |
| Language | Plugin UI language (auto / English / 한국어) | `auto` |
| Embedding Provider | OpenAI (API key) or Ollama (local) | `openai` |
| API Key | OpenAI API key for embedding generation | Empty |
| Ollama Endpoint | Base URL of the local Ollama server | `http://localhost:11434` |
| Embedding Model | Embedding model for the selected provider | `text-embedding-3-large` |
| Custom Vector JSON | Upload/export vector JSON instead of API embeddings | Empty |
| Projection Method | UMAP or PCA for dimensionality reduction | `umap` |
| Layout Seed | Seed for deterministic layout | Random |
| Timeline Date Source | Date the timeline uses: file created time or frontmatter `created` | `ctime` |
| Suggested Links | Max suggested links in the insights panel | `20` |
| Neighbor Count | Notes shown in the semantic neighbors sidebar | `10` |

| Node Color By | Color nodes by folder or first tag | `folder` |
| Show Links | Display link lines between notes | Off |
| Show Grid | Display XZ grid plane | On |
| Show Clusters | ConvexHull cluster region visibility | `hover` |
| Scene Theme | Auto (match app theme), dark, or light background | `auto` |
| Node Opacity | Node transparency (0.15–1.0) | `1.0` |
| Node Size | Node size multiplier (0.4–2.0) | `1.5` |
| Drag Sensitivity | Camera rotation sensitivity (0.2–3.0) | `1.0` |
| Auto Orbit Speed | Idle camera rotation speed (0 to disable) | `0.2` |
| Exclude Folders | Comma-separated folders to exclude | Empty |
| Number of Neighbors | UMAP local/global balance (5–50) | `40` |
| Minimum Distance | UMAP clustering tightness (0–0.99) | `0.80` |

## Embedding Cache

- Stored as `embeddings-cache.json` in the plugin directory
- Automatically invalidated when the model or note content changes

## Tech Stack

- [3d-force-graph](https://github.com/vasturiano/3d-force-graph) — 3D graph rendering
- [Three.js](https://threejs.org/) — WebGL scene, ConvexGeometry for cluster hulls
- [umap-js](https://github.com/PAIR-code/umap-js) — UMAP dimensionality reduction
- [esbuild](https://esbuild.github.io/) — bundler
- Obsidian `requestUrl` API — embedding HTTP requests

## License

MIT
