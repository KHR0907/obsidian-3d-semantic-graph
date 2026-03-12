# Obsidian 3D Semantic Graph

Desktop-only Obsidian plugin that places your notes in a 3D scene. With an OpenAI API key, the plugin generates embeddings for note content and projects them into 3D with UMAP or PCA so semantically related notes appear closer together. You can also upload your own vector JSON file instead of generating embeddings inside the plugin. Without either one, it falls back to a deterministic sphere layout.

[한국어](./docs/README_KO.md) | [日本語](./docs/README_JA.md) | [中文](./docs/README_ZH.md)

## Features

- Semantic 3D positioning with OpenAI embeddings
- Custom vector JSON upload that overrides API-generated embeddings
- UMAP or PCA projection for 3D layout generation
- Deterministic layout seeding and optional sphereized semantic layout
- Real note links from Obsidian resolved links, with toolbar toggle
- Light and dark scene themes, optional grid, auto orbit, and reset view
- Node coloring by folder or first tag
- Embedding cache that reuses unchanged note vectors
- Folder exclusion support for both graph data and embedding generation

## How It Works

1. The plugin loads markdown files from your vault, excluding any folders listed in settings.
2. Nodes are created from note files, and links are built from Obsidian's resolved note links.
3. If a custom vector JSON file is uploaded, the plugin uses those vectors directly for 3D projection.
4. Otherwise, if an OpenAI API key is configured, note text is cleaned, embedded, cached, and reduced to 3D with the selected projection method.
5. If no vector JSON or API key is configured, or embedding fails, the graph falls back to a deterministic sphere layout.
6. In sphere layout mode, notes are distributed throughout a 3D sphere using a stable hash-based ordering and golden-angle spacing, so the fallback stays reproducible across reloads but is not semantic.

## Installation

### Build from source

```bash
git clone <repository-url>
cd <repository-directory>
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into:

```text
<your-vault>/.obsidian/plugins/3d-semantic-graph/
```

Then restart Obsidian and enable **3D Semantic Graph** in **Settings > Community plugins**.

## Development

```bash
npm run dev
npm run build
```

## Usage

1. Open **Settings > 3D Semantic Graph**.
2. Either enter an OpenAI API key and choose an embedding model, or upload a custom vector JSON file.
3. Uploaded vectors take priority over API-generated embeddings when both are present.
4. Open the graph from the ribbon icon or the **Open 3D Semantic Graph** command.
5. Use the toolbar to refresh the graph, reset the camera, and toggle links or grid visibility.
6. Shift-click a node to open the note directly.

## Settings

| Setting | Description | Default |
| --- | --- | --- |
| API Key | OpenAI API key. Leave empty if you plan to use uploaded vectors or the sphere-layout fallback. | Empty |
| Embedding Model | OpenAI embedding model for semantic layout. | `text-embedding-3-large` |
| Custom Vector JSON | Upload a JSON file with precomputed vectors. If present, it overrides API-generated embeddings. | Empty |
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

## Custom Vector JSON Format

Uploaded vectors use this format:

```json
{
  "entries": {
    "folder/note-a.md": {
      "embedding": [0.12, -0.48, 0.91]
    },
    "folder/note-b.md": {
      "embedding": [-0.33, 0.27, 0.54]
    }
  }
}
```

- Keys inside `entries` must match note paths in the vault.
- Each `embedding` must be an array of numbers.
- The uploaded file is stored as `uploaded-vectors.json` in the plugin directory.

## Tech Stack

- `3d-force-graph`
- `three`
- `umap-js`
- `esbuild`
- Obsidian `requestUrl` API for embedding requests

## License

MIT
