# Obsidian 3D Semantic Graph

这是一个仅支持 Obsidian 桌面版的插件。配置 OpenAI API Key 后，插件会为笔记内容生成嵌入向量，再通过 UMAP 或 PCA 投影到 3D 空间，让语义接近的笔记彼此更靠近。没有 API Key 时，会回退到确定性的球形布局。

[English](./README.md) | [한국어](./README_KO.md) | [日本語](./README_JA.md)

## 功能

- 基于 OpenAI 嵌入的语义 3D 布局
- 使用 UMAP 或 PCA 生成 3D 坐标
- 支持种子控制的可复现布局，以及可选的 sphereize 效果
- 基于 Obsidian 实际笔记链接的连线显示
- 亮色/暗色场景主题、网格开关、自动旋转、重置视角
- 按文件夹或第一个标签为节点着色
- 对未变化笔记复用的嵌入缓存
- 同时作用于图数据和嵌入生成的排除文件夹设置

## 工作流程

1. 插件读取 vault 中未被排除的 markdown 文件。
2. 每篇笔记会成为一个节点，节点之间的连线来自 Obsidian 的 resolved links。
3. 如果配置了 OpenAI API Key，插件会清洗正文、生成嵌入、写入缓存，并用选定的方法投影到 3D。
4. 如果没有 API Key，或者嵌入步骤失败，则使用确定性的球形布局。
5. 在球形布局模式下，节点会按照基于路径哈希的稳定顺序和 golden-angle 间隔分布在 3D 球体内部，因此刷新后仍可复现，但这不是语义布局。

## 安装

### 从源码构建

```bash
git clone <repository-url>
cd obsidian-3d-semantic-graph
npm install
npm run build
```

构建完成后，将 `main.js`、`manifest.json`、`styles.css` 复制到：

```text
<your-vault>/.obsidian/plugins/3d-semantic-graph/
```

然后重启 Obsidian，并在 **Settings > Community plugins** 中启用 **3D Semantic Graph**。

## 开发

```bash
npm run dev
npm run build
```

仓库中还包含 `scripts/deploy-to-vault.ps1`，这是一个把构建产物复制到指定本地 vault 路径的辅助脚本。

## 使用方法

1. 打开 **Settings > 3D Semantic Graph**。
2. 如需启用语义布局，填写 OpenAI API Key。
3. 通过功能区图标或 **Open 3D Semantic Graph** 命令打开视图。
4. 可以在工具栏中刷新图谱、重置相机，以及切换连线和网格显示。
5. 按住 `Shift` 点击节点可以直接打开笔记。

## 设置项

| 设置 | 说明 | 默认值 |
| --- | --- | --- |
| API Key | OpenAI API Key。留空时将使用确定性的球形布局 fallback，而不是语义嵌入布局 | 空 |
| Embedding Model | 语义布局使用的 OpenAI 嵌入模型 | `text-embedding-3-large` |
| Projection Method | 生成 3D 坐标的降维方法 | `umap` |
| Layout Seed | UMAP 和节点避让使用的随机种子 | 随机 |
| Sphereize Data | 将语义坐标部分混合到球面方向 | `false` |
| Node Color By | 按文件夹或第一个标签着色 | `folder` |
| Show Links | 是否显示笔记之间的连线 | `false` |
| Show Grid | 是否显示 XZ 平面网格 | `true` |
| Scene Theme | 场景背景主题 | `light` |
| Node Opacity | 节点透明度 | `1.0` |
| Node Size | 节点尺寸倍率 | `1.5` |
| Drag Sensitivity | 相机拖拽旋转灵敏度 | `1.0` |
| Auto Orbit Speed | 空闲时自动旋转速度，设为 `0` 可关闭 | `0.2` |
| Exclude Folders | 要排除的文件夹列表（逗号分隔） | 空 |
| Number of Neighbors | UMAP 的局部/全局平衡参数 | `30` |
| Minimum Distance | UMAP 的聚类距离参数 | `0.80` |

## 嵌入缓存

- 缓存文件：`embeddings-cache.json`
- 保存位置：插件目录
- 当嵌入模型或笔记内容变化时会自动失效

## 技术栈

- `3d-force-graph`
- `three`
- `umap-js`
- `esbuild`
- 嵌入请求通过 Obsidian `requestUrl` API 发出

## License

MIT
