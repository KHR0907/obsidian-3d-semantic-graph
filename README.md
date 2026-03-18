# Obsidian 3D Semantic Graph

Desktop-only Obsidian plugin that places your notes in a 3D scene. With an OpenAI API key, the plugin generates embeddings for note content and projects them into 3D with UMAP or PCA so semantically related notes appear closer together. Without an API key, it falls back to a deterministic sphere layout.

[한국어](./README_KO.md) | [日本語](./README_JA.md) | [中文](./README_ZH.md)

## Features

- Semantic 3D positioning with OpenAI embeddings
- UMAP or PCA projection for 3D layout generation
- Deterministic layout seeding and optional sphereized semantic layout
- Real note links from Obsidian resolved links, with toolbar toggle
- Inspector panel for selected notes and connected notes
- Light and dark scene themes, optional grid, auto orbit, and reset view
- Node coloring by folder or first tag
- Embedding cache that reuses unchanged note vectors
- Folder exclusion support for both graph data and embedding generation

## How It Works

1. The plugin loads markdown files from your vault, excluding any folders listed in settings.
2. Nodes are created from note files, and links are built from Obsidian's resolved note links.
3. If an OpenAI API key is configured, note text is cleaned, embedded, cached, and reduced to 3D with the selected projection method.
4. If no API key is configured, or embedding fails, the graph falls back to a sphere layout.

## Installation

### Build from source

```bash
git clone <repository-url>
cd obsidian-3d-semantic-graph
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into:

```text
<your-vault>/.obsidian/plugins/obsidian-3d-semantic-graph/
```

Then restart Obsidian and enable **3D Semantic Graph** in **Settings > Community plugins**.

## Development

```bash
npm run dev
npm run build
```


## Usage

1. Open **Settings > 3D Semantic Graph**.
2. Optionally enter an OpenAI API key to enable semantic positioning.
3. Open the graph from the ribbon icon or the **Open 3D Semantic Graph** command.
4. Use the toolbar to refresh the graph, reset the camera, and toggle links or grid visibility.
5. Click a node to pin it in the inspector. Shift-click a node, or use the inspector button, to open the note.

## Settings

| Setting | Description | Default |
| --- | --- | --- |
| API Key | OpenAI API key. Leave empty to use sphere layout only. | Empty |
| Embedding Model | OpenAI embedding model for semantic layout. | `text-embedding-3-large` |
| Projection Method | Dimensionality reduction method for 3D coordinates. | `umap` |
| Layout Seed | Seed for UMAP and overlap resolution. | Random |
| Sphereize Data | Blend semantic coordinates toward a sphere surface. | `false` |
| Node Color By | Color nodes by folder or first tag. | `folder` |
| Show Links | Show connection lines between notes. | `false` |
| Show Grid | Show the XZ grid helper. | `true` |
| Scene Theme | Scene background theme. | `light` |
| Node Opacity | Node transparency. | `1.0` |
| Node Size | Node size multiplier. | `1.5` |
| Drag Sensitivity | Camera rotation sensitivity. | `1.0` |
| Auto Orbit Speed | Idle camera orbit speed. Set `0` to disable. | `0.2` |
| Exclude Folders | Comma-separated folders to skip. | Empty |
| Number of Neighbors | UMAP local/global balance. | `30` |
| Minimum Distance | UMAP clustering distance. | `0.80` |

## Embedding Cache

- Cache file: `embeddings-cache.json`
- Stored inside the plugin directory
- Invalidated automatically when the embedding model changes or cached content changes

## Tech Stack

- `3d-force-graph`
- `three`
- `umap-js`
- `esbuild`
- Obsidian `requestUrl` API for embedding requests

## License

MIT
