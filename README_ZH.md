# Obsidian 3D Semantic Graph

一款 Obsidian 插件，使用 OpenAI 嵌入向量对笔记进行语义分析，并在 3D 空间中可视化，语义相似的笔记在空间中距离更近。

[English](./README.md) | [한국어](./README_KO.md) | [日本語](./README_JA.md)

## 功能

- **基于语义的 3D 可视化**：使用 OpenAI 嵌入（text-embedding-3-small）分析笔记间的语义相似度，通过 UMAP 投影到 3D 空间
- **交互操作**：点击节点→打开笔记，悬停→显示标题，拖拽→旋转，滚动→缩放
- **嵌入缓存**：仅重新嵌入已更改的笔记，节省 API 费用
- **自定义设置**：相似度阈值、UMAP 参数、节点颜色方案（文件夹/标签）、文件夹排除

## 安装

1. 克隆仓库并构建：
   ```bash
   git clone https://github.com/your-repo/obsidian-3d-semantic-graph.git
   cd obsidian-3d-semantic-graph
   npm install
   npm run build
   ```

2. 将 `main.js`、`manifest.json`、`styles.css` 复制到 vault 的 `.obsidian/plugins/obsidian-3d-semantic-graph/` 目录

3. 重启 Obsidian → 设置 → 第三方插件 → 启用 "3D Semantic Graph"

## 使用方法

1. 设置 → 3D Semantic Graph → 输入 OpenAI API 密钥
2. 点击侧边栏图标（网络图标）或在命令面板中运行 **Open 3D Semantic Graph**
3. 笔记将以语义聚类的形式显示在 3D 空间中

## 设置项

| 设置 | 说明 | 默认值 |
|------|------|--------|
| API Key | OpenAI API 密钥 | - |
| Embedding Model | 嵌入模型 | text-embedding-3-small |
| Similarity Threshold | 创建链接的最小余弦相似度（0.5–0.95） | 0.7 |
| Node Color By | 节点着色依据（文件夹/标签） | Folder |
| UMAP nNeighbors | 局部结构保留程度（5–50） | 15 |
| UMAP minDist | 聚类密度（0.0–0.99） | 0.1 |
| Exclude Folders | 排除的文件夹（逗号分隔） | - |

## 技术栈

- **3d-force-graph**（基于 Three.js）— 3D 图形渲染
- **umap-js** — 高维嵌入降维至 3D
- **OpenAI API** — 直接使用 `fetch()` 调用（不使用 SDK，减小包体积）
- **esbuild** — Obsidian 官方推荐的打包工具

## 许可证

MIT
