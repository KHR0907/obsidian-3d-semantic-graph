import { GraphSceneRenderer } from "./graph-scene-renderer";
import { ClusterRegion } from "./clustered-sphere-layout";
import { GraphData, GraphNode, GraphVisualOptions } from "./types";

export class GraphRenderer {
	private container: HTMLElement;
	private sceneLayer: HTMLDivElement;
	private sceneRenderer: GraphSceneRenderer;
	private linksVisible = true;
	private visualOptions: GraphVisualOptions;

	constructor(
		container: HTMLElement,
		onNodeSelect: (node: GraphNode | null) => void,
		onNodeOpen: (node: GraphNode) => void,
		visualOptions: GraphVisualOptions
	) {
		this.container = container;
		this.visualOptions = visualOptions;
		this.container.replaceChildren();

		this.sceneLayer = document.createElement("div");
		this.sceneLayer.className = "semantic-graph-scene-layer";
		this.container.append(this.sceneLayer);
		this.applyThemeClass();

		this.sceneRenderer = new GraphSceneRenderer(
			this.sceneLayer,
			onNodeSelect,
			onNodeOpen,
			this.visualOptions
		);
	}

	render(data: GraphData): void {
		this.sceneRenderer.render(data);
		this.sceneRenderer.setLinksVisible(this.linksVisible);
	}

	resize(width: number, height: number): void {
		this.sceneRenderer.resize(width, height);
	}

	resetView(): void {
		this.sceneRenderer.resetView();
	}

	setClusterRegions(regions: ClusterRegion[]): void {
		this.sceneRenderer.setClusterRegions(regions);
	}

	setClustersMode(mode: "on" | "hover" | "off"): void {
		this.sceneRenderer.setClustersMode(mode);
	}

	setLinksVisible(visible: boolean): void {
		this.linksVisible = visible;
		this.sceneRenderer.setLinksVisible(visible);
	}

	updateVisualOptions(visualOptions: GraphVisualOptions): void {
		this.visualOptions = visualOptions;
		this.applyThemeClass();
		this.sceneRenderer.updateVisualOptions(visualOptions);
	}

	dispose(): void {
		this.sceneRenderer.dispose();
		this.container.replaceChildren();
	}

	private applyThemeClass(): void {
		this.container.classList.remove("semantic-graph-theme-dark", "semantic-graph-theme-light");
		this.container.classList.add(`semantic-graph-theme-${this.visualOptions.sceneTheme}`);
	}
}
