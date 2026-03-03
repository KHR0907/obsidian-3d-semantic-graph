# Obsidian 3D Semantic Graph

OpenAI エンベディングを使用してノートを意味分析し、意味的に類似したノートが 3D 空間で近くに配置されるように可視化する Obsidian プラグイン。

[English](./README.md) | [한국어](./README_KO.md) | [中文](./README_ZH.md)

## 機能

- **意味ベースの 3D 可視化**：OpenAI エンベディング（text-embedding-3-small）でノート間の意味的類似度を分析し、UMAP で 3D 空間に配置
- **インタラクション**：ノードクリック→ノートを開く、ホバー→タイトル表示、ドラッグ→回転、スクロール→ズーム
- **エンベディングキャッシュ**：変更されたノートのみ再エンベディングし、API コストを節約
- **カスタマイズ**：類似度閾値、UMAP パラメータ、ノードカラー基準（フォルダ/タグ）、除外フォルダ設定

## インストール

1. リポジトリをクローンしてビルド：
   ```bash
   git clone https://github.com/your-repo/obsidian-3d-semantic-graph.git
   cd obsidian-3d-semantic-graph
   npm install
   npm run build
   ```

2. `main.js`、`manifest.json`、`styles.css` を vault の `.obsidian/plugins/obsidian-3d-semantic-graph/` にコピー

3. Obsidian を再起動 → 設定 → コミュニティプラグイン → "3D Semantic Graph" を有効化

## 使い方

1. 設定 → 3D Semantic Graph → OpenAI API キーを入力
2. リボンアイコン（ネットワーク形状）をクリック、またはコマンドパレットで **Open 3D Semantic Graph** を実行
3. ノートが意味的クラスターとして 3D 空間に表示される

## 設定項目

| 設定 | 説明 | デフォルト |
|------|------|------------|
| API Key | OpenAI API キー | - |
| Embedding Model | エンベディングモデル | text-embedding-3-small |
| Similarity Threshold | リンク生成の最小コサイン類似度（0.5–0.95） | 0.7 |
| Node Color By | ノードの色分け基準（フォルダ/タグ） | Folder |
| UMAP nNeighbors | 局所構造の保存度（5–50） | 15 |
| UMAP minDist | クラスター密度（0.0–0.99） | 0.1 |
| Exclude Folders | 除外するフォルダ（カンマ区切り） | - |

## 技術スタック

- **3d-force-graph**（Three.js ベース）— 3D グラフレンダリング
- **umap-js** — 高次元エンベディングを 3D に次元削減
- **OpenAI API** — `fetch()` で直接呼び出し（SDK 不使用、バンドル軽量化）
- **esbuild** — Obsidian 公式推奨バンドラー

## ライセンス

MIT
