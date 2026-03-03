# Obsidian 3D Semantic Graph

An Obsidian plugin that analyzes notes using OpenAI embeddings and visualizes them in 3D space, placing semantically similar notes closer together.

[한국어](./README_KO.md) | [中文](./README_ZH.md) | [日本語](./README_JA.md)

## Features

- **Semantic 3D Visualization**: Analyze semantic similarity between notes using OpenAI embeddings (text-embedding-3-small) and project them into 3D space via UMAP
- **Interactions**: Click node → open note, hover → show title, drag → rotate, scroll → zoom
- **Embedding Cache**: Only re-embed changed notes to save API costs
- **Customization**: Similarity threshold, UMAP parameters, node color scheme (folder/tag), folder exclusion

## Installation

1. Clone and build:
   ```bash
   git clone https://github.com/your-repo/obsidian-3d-semantic-graph.git
   cd obsidian-3d-semantic-graph
   npm install
   npm run build
   ```

2. Copy `main.js`, `manifest.json`, `styles.css` to your vault's `.obsidian/plugins/obsidian-3d-semantic-graph/`

3. Restart Obsidian → Settings → Community plugins → Enable "3D Semantic Graph"

## Usage

1. Settings → 3D Semantic Graph → Enter your OpenAI API key
2. Click the ribbon icon (network shape) or run **Open 3D Semantic Graph** from the command palette
3. Notes are displayed as semantic clusters in 3D space

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| API Key | OpenAI API key | - |
| Embedding Model | Embedding model to use | text-embedding-3-small |
| Similarity Threshold | Minimum cosine similarity to create a link (0.5–0.95) | 0.7 |
| Node Color By | Node coloring criterion (folder/tag) | Folder |
| UMAP nNeighbors | Local structure preservation (5–50) | 15 |
| UMAP minDist | Cluster density (0.0–0.99) | 0.1 |
| Exclude Folders | Folders to exclude (comma-separated) | - |

## Tech Stack

- **3d-force-graph** (Three.js-based) — 3D graph rendering
- **umap-js** — Dimensionality reduction from high-dimensional embeddings to 3D
- **OpenAI API** — Direct `fetch()` calls (no SDK, lighter bundle)
- **esbuild** — Officially recommended Obsidian bundler

## License

MIT
