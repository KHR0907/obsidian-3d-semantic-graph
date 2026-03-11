# Obsidian 3D Semantic Graph

Obsidian のデスクトップ専用プラグインです。OpenAI API キーを設定すると、ノート本文を埋め込みベクトル化し、UMAP または PCA で 3D 座標に投影して、意味的に近いノート同士を近くに配置します。API キーがない場合は、決定的な球状レイアウトにフォールバックします。

[English](./README.md) | [한국어](./README_KO.md) | [中文](./README_ZH.md)

## 主な機能

- OpenAI 埋め込みを使った意味ベースの 3D 配置
- UMAP または PCA による 3D 投影
- シードによる再現可能なレイアウトと任意の sphereize 表示
- Obsidian の実リンク情報に基づく接続線表示
- 選択ノートと接続ノートを確認できる Inspector パネル
- ライト/ダークのシーンテーマ、グリッド表示、自動回転、ビューリセット
- フォルダまたは最初のタグによるノード色分け
- 変更されていないノートを再利用する埋め込みキャッシュ
- グラフ生成と埋め込み生成の両方に効く除外フォルダ設定

## 動作の流れ

1. 設定で除外していない markdown ファイルを vault から読み込みます。
2. 各ノートをノードに変換し、Obsidian の resolved links から接続線を作ります。
3. OpenAI API キーがある場合は、本文を整形して埋め込みを作成し、キャッシュしたうえで選択した手法で 3D 座標へ変換します。
4. API キーがない場合、または埋め込み処理に失敗した場合は球状レイアウトを使います。

## インストール

### ソースからビルド

```bash
git clone <repository-url>
cd obsidian-3d-semantic-graph
npm install
npm run build
```

ビルド後、`main.js`、`manifest.json`、`styles.css` を次の場所へコピーします。

```text
<your-vault>/.obsidian/plugins/obsidian-3d-semantic-graph/
```

その後 Obsidian を再起動し、**Settings > Community plugins** で **3D Semantic Graph** を有効にします。

## 開発

```bash
npm run dev
npm run build
```

このリポジトリには、特定のローカル vault にビルド成果物をコピーする `scripts/deploy-to-vault.ps1` も含まれています。

## 使い方

1. **Settings > 3D Semantic Graph** を開きます。
2. 意味ベースの配置を有効にする場合は OpenAI API キーを入力します。
3. リボンアイコン、または **Open 3D Semantic Graph** コマンドからビューを開きます。
4. ツールバーで再読み込み、カメラのリセット、リンク表示、グリッド表示を操作できます。
5. ノードをクリックすると Inspector に固定され、`Shift`+クリックまたは Inspector のボタンでノートを開けます。

## 設定項目

| 設定 | 説明 | 既定値 |
| --- | --- | --- |
| API Key | OpenAI API キー。空の場合は球状レイアウトのみ使用 | 空 |
| Embedding Model | 意味レイアウトに使う OpenAI 埋め込みモデル | `text-embedding-3-large` |
| Projection Method | 3D 座標生成に使う次元削減手法 | `umap` |
| Layout Seed | UMAP と重なり解消に使うシード値 | ランダム |
| Sphereize Data | 意味座標を球面方向へ一部ブレンドします | `false` |
| Node Color By | フォルダまたは最初のタグで色分け | `folder` |
| Show Links | ノート間の接続線を表示 | `false` |
| Show Grid | XZ 平面グリッドを表示 | `true` |
| Scene Theme | シーン背景テーマ | `light` |
| Node Opacity | ノードの透明度 | `1.0` |
| Node Size | ノードサイズ倍率 | `1.5` |
| Drag Sensitivity | カメラ回転感度 | `1.0` |
| Auto Orbit Speed | 待機時の自動回転速度。`0` で無効 | `0.2` |
| Exclude Folders | 除外するフォルダ一覧（カンマ区切り） | 空 |
| Number of Neighbors | UMAP の局所/大域バランス | `30` |
| Minimum Distance | UMAP のクラスタ距離 | `0.80` |

## 埋め込みキャッシュ

- キャッシュファイル: `embeddings-cache.json`
- 保存先: プラグインディレクトリ
- モデル変更時またはノート本文変更時に自動で無効化

## 技術スタック

- `3d-force-graph`
- `three`
- `umap-js`
- `esbuild`
- 埋め込みリクエストには Obsidian の `requestUrl` API を使用

## ライセンス

MIT
