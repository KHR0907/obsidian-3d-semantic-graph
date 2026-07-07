import { moment } from "obsidian";

export type Locale = "en" | "ko";
export type LanguageSetting = "auto" | Locale;

const STRINGS = {
	// Commands, ribbon, view titles
	"command.openGraph": { en: "Open graph view", ko: "그래프 뷰 열기" },
	"command.openNeighbors": { en: "Open semantic neighbors", ko: "시맨틱 이웃 열기" },
	"view.graph.title": { en: "Semantic graph", ko: "시맨틱 그래프" },
	"view.neighbors.title": { en: "Semantic neighbors", ko: "시맨틱 이웃" },

	// Graph view toolbar
	"toolbar.refresh": { en: "Refresh", ko: "새로고침" },
	"toolbar.refreshAria": { en: "Refresh graph", ko: "그래프 새로고침" },
	"toolbar.resetView": { en: "Reset camera view", ko: "카메라 초기화" },
	"toolbar.resetViewAria": { en: "Reset view", ko: "뷰 초기화" },
	"toolbar.toggleLinks": { en: "Toggle links", ko: "링크 표시 전환" },
	"toolbar.linksOn": { en: "Links on", ko: "링크 켜짐" },
	"toolbar.linksOff": { en: "Links off", ko: "링크 꺼짐" },
	"toolbar.toggleGrid": { en: "Toggle grid", ko: "그리드 표시 전환" },
	"toolbar.gridOn": { en: "Grid on", ko: "그리드 켜짐" },
	"toolbar.gridOff": { en: "Grid off", ko: "그리드 꺼짐" },
	"toolbar.clustersAria": { en: "Clusters mode", ko: "클러스터 모드" },
	"toolbar.clustersOn": { en: "Clusters on", ko: "클러스터 켜짐" },
	"toolbar.clustersOff": { en: "Clusters off", ko: "클러스터 꺼짐" },
	"toolbar.clustersHover": { en: "Clusters hover", ko: "클러스터 호버" },
	"toolbar.insights": { en: "Insights", ko: "인사이트" },
	"toolbar.insightsAria": { en: "Toggle insights", ko: "인사이트 열기/닫기" },
	"toolbar.timeline": { en: "Timeline", ko: "타임라인" },
	"toolbar.timelineAria": { en: "Toggle timeline", ko: "타임라인 열기/닫기" },
	"toolbar.export": { en: "Export HTML", ko: "HTML 내보내기" },
	"toolbar.exportAria": { en: "Export interactive HTML", ko: "인터랙티브 HTML 내보내기" },

	// Graph view status / errors
	"status.building": { en: "Building graph...", ko: "그래프 생성 중..." },
	"status.pca": { en: "Running PCA...", ko: "PCA 실행 중..." },
	"status.pcaProgress": { en: "PCA: {step}/{total}", ko: "PCA: {step}/{total}" },
	"status.umap": { en: "Running UMAP...", ko: "UMAP 실행 중..." },
	"status.umapProgress": { en: "UMAP: {epoch}/{total}", ko: "UMAP: {epoch}/{total}" },
	"status.embedding": { en: "Generating embeddings...", ko: "임베딩 생성 중..." },
	"status.embeddingProgress": { en: "Embedding... {current}/{total}", ko: "임베딩 중... {current}/{total}" },
	"status.loadingVectors": { en: "Loading uploaded vectors...", ko: "업로드된 벡터 불러오는 중..." },
	"status.clusteredSphere": { en: "Using clustered sphere layout...", ko: "클러스터 구형 레이아웃 사용 중..." },
	"status.embeddingFailed": {
		en: "Embedding failed, using clustered sphere layout...",
		ko: "임베딩 실패, 클러스터 구형 레이아웃 사용 중...",
	},
	"status.summary": { en: "{notes} notes, {links} links", ko: "노트 {notes}개, 링크 {links}개" },
	"error.noFiles": { en: "No markdown files found in vault.", ko: "Vault에 마크다운 파일이 없습니다." },
	"error.generic": { en: "Error: {message}", ko: "오류: {message}" },
	"notice.graphError": { en: "Semantic graph: {message}", ko: "시맨틱 그래프: {message}" },

	// Timeline
	"timeline.play": { en: "Play timeline", ko: "타임라인 재생" },
	"timeline.noDates": { en: "No creation dates available", ko: "생성 날짜 정보가 없습니다" },

	// HTML export
	"export.loadFirst": { en: "Load the graph before exporting.", ko: "내보내기 전에 그래프를 먼저 불러오세요." },
	"export.done": { en: "Graph exported as semantic-graph.html", ko: "semantic-graph.html 파일로 내보냈습니다." },
	"export.failed": { en: "Failed to export graph: {message}", ko: "그래프 내보내기 실패: {message}" },
	"export.clickHint": { en: "Click a node to open it in Obsidian", ko: "노드를 클릭하면 Obsidian에서 열립니다" },
	"export.stats": {
		en: "{notes} notes · {links} links · exported {date}",
		ko: "노트 {notes} · 링크 {links} · {date} 내보냄",
	},

	// Insights panel
	"insights.title": { en: "Insights", ko: "인사이트" },
	"insights.closeAria": { en: "Close insights", ko: "인사이트 닫기" },
	"insights.loadFirst": { en: "Load the graph first.", ko: "그래프를 먼저 불러오세요." },
	"insights.computing": { en: "Computing insights… {percent}%", ko: "인사이트 계산 중… {percent}%" },
	"insights.suggested.title": { en: "Suggested links", ko: "링크 제안" },
	"insights.suggested.desc": {
		en: "Semantically close notes that are not linked yet.",
		ko: "의미적으로 가깝지만 아직 연결되지 않은 노트 쌍입니다.",
	},
	"insights.requiresEmbeddings": {
		en: "Requires embeddings. Configure a provider or upload vectors, then refresh the graph.",
		ko: "임베딩이 필요합니다. 프로바이더를 설정하거나 벡터를 업로드한 뒤 그래프를 새로고침하세요.",
	},
	"insights.requiresEmbeddingsShort": { en: "Requires embeddings.", ko: "임베딩이 필요합니다." },
	"insights.skippedTooMany": { en: "Skipped: more than {max} notes.", ko: "건너뜀: 노트가 {max}개를 초과합니다." },
	"insights.noSuggestions": { en: "No suggestions.", ko: "제안이 없습니다." },
	"insights.duplicates.title": { en: "Potential duplicates", ko: "중복 의심" },
	"insights.duplicates.desc": {
		en: "Note pairs with near-identical content.",
		ko: "내용이 거의 동일한 노트 쌍입니다.",
	},
	"insights.noDuplicates": { en: "No duplicates found.", ko: "중복이 없습니다." },
	"insights.orphans.title": { en: "Orphan notes", ko: "고아 노트" },
	"insights.orphans.desc": { en: "Notes without any links.", ko: "링크가 하나도 없는 노트입니다." },
	"insights.noOrphans": { en: "No orphan notes.", ko: "고아 노트가 없습니다." },
	"insights.clusters.title": { en: "Folder clusters", ko: "폴더 클러스터" },
	"insights.clusters.desc": {
		en: "Create a Map of Content note linking every note in a cluster.",
		ko: "클러스터의 모든 노트를 링크하는 MOC(목차) 노트를 생성합니다.",
	},
	"insights.noClusters": { en: "No clusters available.", ko: "클러스터가 없습니다." },
	"insights.vaultRoot": { en: "(vault root)", ko: "(Vault 루트)" },
	"insights.createMoc": { en: "Create MOC", ko: "MOC 생성" },
	"insights.insertLinkAria": { en: "Insert link into source note", ko: "원본 노트에 링크 삽입" },
	"notice.linked": { en: 'Linked "{source}" → "{target}"', ko: '"{source}" → "{target}" 링크를 추가했습니다' },
	"notice.linkFailed": { en: "Failed to insert link: {message}", ko: "링크 삽입 실패: {message}" },
	"notice.mocCreated": { en: "Created {path}", ko: "{path} 파일을 생성했습니다" },
	"notice.mocFailed": { en: "Failed to create MOC: {message}", ko: "MOC 생성 실패: {message}" },

	// Neighbors sidebar
	"neighbors.reload": { en: "Reload vectors", ko: "벡터 다시 불러오기" },
	"neighbors.openNote": {
		en: "Open a note to see its semantic neighbors.",
		ko: "노트를 열면 의미적 이웃이 표시됩니다.",
	},
	"neighbors.noVectors": {
		en: "No embeddings available. Open the graph view with an embedding provider configured to generate them.",
		ko: "사용 가능한 임베딩이 없습니다. 임베딩 프로바이더를 설정하고 그래프 뷰를 열어 생성하세요.",
	},
	"neighbors.noVectorForNote": {
		en: "No embedding for this note yet. Refresh the graph view to embed new notes.",
		ko: "이 노트의 임베딩이 아직 없습니다. 그래프 뷰를 새로고침해 새 노트를 임베딩하세요.",
	},
	"neighbors.none": { en: "No neighbors found.", ko: "이웃을 찾지 못했습니다." },

	// Settings — general
	"settings.general.heading": { en: "General", ko: "일반" },
	"settings.language.name": { en: "Language", ko: "언어" },
	"settings.language.desc": {
		en: "Plugin interface language. Auto follows the Obsidian language. Reopen views to apply everywhere.",
		ko: "플러그인 UI 언어입니다. 자동은 Obsidian 언어 설정을 따릅니다. 열려 있는 뷰는 다시 열면 적용됩니다.",
	},
	"settings.language.auto": { en: "Auto", ko: "자동" },

	// Settings — embeddings
	"settings.embeddings.heading": { en: "Embeddings", ko: "임베딩" },
	"settings.provider.name": { en: "Embedding provider", ko: "임베딩 프로바이더" },
	"settings.provider.desc": {
		en: "OpenAI requires an access key. Ollama runs locally without a key.",
		ko: "OpenAI는 액세스 키가 필요합니다. Ollama는 키 없이 로컬에서 동작합니다.",
	},
	"settings.ollamaEndpoint.name": { en: "Ollama endpoint", ko: "Ollama 엔드포인트" },
	"settings.ollamaEndpoint.desc": {
		en: "Base URL of the local Ollama server. Default: http://localhost:11434.",
		ko: "로컬 Ollama 서버 주소입니다. 기본값: http://localhost:11434.",
	},
	"settings.accessKey.name": { en: "Access key", ko: "액세스 키" },
	"settings.accessKey.desc": {
		en: "Access key for generating embeddings. Leave blank to use the sphere layout without semantic positioning.",
		ko: "임베딩 생성에 사용하는 액세스 키입니다. 비워 두면 시맨틱 배치 없이 구형 레이아웃을 사용합니다.",
	},
	"settings.accessKey.placeholder": { en: "Paste your access key", ko: "액세스 키를 붙여넣으세요" },
	"settings.model.name": { en: "Embedding model", ko: "임베딩 모델" },
	"settings.model.desc": { en: "Choose which model to use for embeddings.", ko: "임베딩에 사용할 모델을 선택합니다." },
	"settings.model.descOllama": {
		en: "Choose which model to use for embeddings. Pull it first with `ollama pull <model>`.",
		ko: "임베딩에 사용할 모델을 선택합니다. 먼저 `ollama pull <모델>`로 받아 두세요.",
	},
	"settings.vectorFile.name": { en: "Vector file", ko: "벡터 파일" },
	"settings.vectorFile.desc": {
		en: "Use an uploaded vector file instead of generated embeddings.",
		ko: "생성된 임베딩 대신 업로드한 벡터 파일을 사용합니다.",
	},
	"settings.vectorFile.export": { en: "Export", ko: "내보내기" },
	"settings.vectorFile.exportTooltip": {
		en: "Download vectors as a compatible file",
		ko: "호환되는 벡터 파일로 다운로드",
	},
	"settings.vectorFile.upload": { en: "Upload", ko: "업로드" },
	"settings.vectorFile.uploadAgain": { en: "Upload again", ko: "다시 업로드" },
	"settings.vectorFile.placeholder": { en: "Uploaded file name", ko: "업로드된 파일 이름" },
	"settings.vectorFile.clearTooltip": {
		en: "Clear uploaded vectors reference",
		ko: "업로드된 벡터 참조 지우기",
	},

	// Settings — graph
	"settings.graph.heading": { en: "Graph", ko: "그래프" },
	"settings.nodeColorBy.name": { en: "Node color by", ko: "노드 색상 기준" },
	"settings.nodeColorBy.desc": {
		en: "How to assign colors to nodes. Default: folder.",
		ko: "노드 색상을 정하는 기준입니다. 기본값: 폴더.",
	},
	"settings.nodeColorBy.folder": { en: "Folder", ko: "폴더" },
	"settings.nodeColorBy.tag": { en: "First tag", ko: "첫 번째 태그" },
	"settings.projection.name": { en: "Projection method", ko: "투영 방식" },
	"settings.projection.desc": {
		en: "Choose how embeddings are projected into space. Default: mapped layout.",
		ko: "임베딩을 3D 공간에 투영하는 방식입니다. 기본값: 매핑 레이아웃.",
	},
	"settings.projection.umap": { en: "Mapped layout", ko: "매핑 레이아웃" },
	"settings.projection.pca": { en: "Principal components", ko: "주성분 분석" },
	"settings.layoutSeed.name": { en: "Layout seed", ko: "레이아웃 시드" },
	"settings.layoutSeed.desc": {
		en: "Seed used for layout steps and overlap resolution. Using the same seed makes the layout more repeatable. Default: random.",
		ko: "레이아웃 계산과 겹침 해소에 쓰는 시드입니다. 같은 시드를 쓰면 레이아웃이 재현됩니다. 기본값: 랜덤.",
	},
	"settings.layoutSeed.random": { en: "Random", ko: "랜덤" },
	"settings.showLinks.name": { en: "Show links", ko: "링크 표시" },
	"settings.showLinks.desc": {
		en: "Display connection lines between nodes. Default: off.",
		ko: "노트 간 연결선을 표시합니다. 기본값: 끔.",
	},
	"settings.timelineSource.name": { en: "Timeline date source", ko: "타임라인 날짜 기준" },
	"settings.timelineSource.desc": {
		en: "Which date the timeline uses for each note. Default: file created time.",
		ko: "타임라인이 노트별로 사용할 날짜 기준입니다. 기본값: 파일 생성 시각.",
	},
	"settings.timelineSource.ctime": { en: "File created time", ko: "파일 생성 시각" },
	"settings.timelineSource.frontmatter": {
		en: "Frontmatter created (falls back to file time)",
		ko: "Frontmatter created (없으면 파일 생성 시각)",
	},
	"settings.showGrid.name": { en: "Show grid", ko: "그리드 표시" },
	"settings.showGrid.desc": {
		en: "Display a solid square grid on the ground plane. Default: on.",
		ko: "바닥 평면에 그리드를 표시합니다. 기본값: 켬.",
	},

	// Settings — appearance
	"settings.appearance.heading": { en: "Appearance", ko: "외관" },
	"settings.sceneTheme.name": { en: "Scene theme", ko: "씬 테마" },
	"settings.sceneTheme.desc": {
		en: "Choose the background style for the scene. Auto follows the app theme. Default: auto.",
		ko: "씬 배경 스타일입니다. 자동은 앱 테마를 따릅니다. 기본값: 자동.",
	},
	"settings.sceneTheme.auto": { en: "Auto", ko: "자동" },
	"settings.sceneTheme.dark": { en: "Dark", ko: "다크" },
	"settings.sceneTheme.light": { en: "Light", ko: "라이트" },
	"settings.nodeOpacity.name": { en: "Node opacity", ko: "노드 투명도" },
	"settings.nodeOpacity.desc": { en: "Adjust node transparency. Default: 1.0.", ko: "노드 투명도를 조절합니다. 기본값: 1.0." },
	"settings.nodeSize.name": { en: "Node size", ko: "노드 크기" },
	"settings.nodeSize.desc": { en: "Adjust the size of nodes. Default: 1.5.", ko: "노드 크기를 조절합니다. 기본값: 1.5." },
	"settings.dragSensitivity.name": { en: "Drag sensitivity", ko: "드래그 감도" },
	"settings.dragSensitivity.desc": {
		en: "Adjust how strongly the camera responds when dragging the graph. Default: 1.0.",
		ko: "그래프 드래그 시 카메라 반응 강도입니다. 기본값: 1.0.",
	},
	"settings.autoOrbit.name": { en: "Auto orbit speed", ko: "자동 회전 속도" },
	"settings.autoOrbit.desc": {
		en: "Adjust the idle camera orbit speed. Set to 0 to disable automatic camera movement. Default: 0.2.",
		ko: "유휴 상태의 카메라 자동 회전 속도입니다. 0이면 비활성화. 기본값: 0.2.",
	},
	"settings.entryAnimation.name": { en: "Entry animation", ko: "진입 애니메이션" },
	"settings.entryAnimation.desc": {
		en: "Play an expand-and-fly-in animation when the graph opens. Default: on.",
		ko: "그래프를 열 때 노드 확산과 카메라 진입 애니메이션을 재생합니다. 기본값: 켬.",
	},
	"settings.suggestedLinks.name": { en: "Suggested links", ko: "링크 제안 개수" },
	"settings.suggestedLinks.desc": {
		en: "Maximum number of suggested links shown in the insights panel. Default: 20.",
		ko: "인사이트 패널에 표시할 링크 제안 최대 개수입니다. 기본값: 20.",
	},
	"settings.neighborCount.name": { en: "Neighbor count", ko: "이웃 노트 개수" },
	"settings.neighborCount.desc": {
		en: "Number of notes shown in the semantic neighbors sidebar. Default: 10.",
		ko: "시맨틱 이웃 사이드바에 표시할 노트 개수입니다. 기본값: 10.",
	},
	"settings.excludeFolders.name": { en: "Exclude folders", ko: "제외 폴더" },
	"settings.excludeFolders.desc": {
		en: "Comma-separated list of folders to exclude from the graph.",
		ko: "그래프에서 제외할 폴더 목록입니다(쉼표 구분).",
	},

	// Settings — projection tuning
	"settings.tuning.heading": { en: "Projection tuning", ko: "투영 튜닝" },
	"settings.umapNeighbors.name": { en: "Number of neighbors", ko: "이웃 수" },
	"settings.umapNeighbors.desc": {
		en: "Controls local vs global structure (5-50). Lower = tighter clusters, higher = broader spread. Default: 40.",
		ko: "지역/전역 구조 균형을 조절합니다(5-50). 낮을수록 군집이 촘촘해집니다. 기본값: 40.",
	},
	"settings.umapMinDist.name": { en: "Minimum distance", ko: "최소 거리" },
	"settings.umapMinDist.desc": {
		en: "How tightly similar points are packed (0.0-0.99). Lower values create tighter clusters. Default: 0.80.",
		ko: "유사한 점들이 모이는 정도입니다(0.0-0.99). 낮을수록 군집이 촘촘해집니다. 기본값: 0.80.",
	},

	// Settings — reset
	"settings.reset.heading": { en: "Reset", ko: "초기화" },
	"settings.reset.name": { en: "Reset to defaults", ko: "기본값으로 초기화" },
	"settings.reset.desc": {
		en: "Restore all settings to their default values. The access key is preserved.",
		ko: "모든 설정을 기본값으로 되돌립니다. 액세스 키는 유지됩니다.",
	},
	"settings.reset.button": { en: "Reset", ko: "초기화" },

	// Settings — notices
	"notice.vectorsUploaded": { en: "Uploaded vector file saved.", ko: "벡터 파일이 업로드되었습니다." },
	"notice.vectorsUploadFailed": { en: "Failed to upload vector file: {message}", ko: "벡터 파일 업로드 실패: {message}" },
	"notice.vectorsGenerating": { en: "Generating vector file...", ko: "벡터 파일 생성 중..." },
	"notice.vectorsExported.uploaded": { en: "Uploaded vector file exported.", ko: "업로드된 벡터 파일을 내보냈습니다." },
	"notice.vectorsExported.generated": { en: "Generated vector file exported.", ko: "생성한 벡터 파일을 내보냈습니다." },
	"notice.vectorsExported.template": { en: "Template vector file exported.", ko: "템플릿 벡터 파일을 내보냈습니다." },
	"notice.vectorsExported.createdInVault": { en: "{message} Created {path} in the vault.", ko: "{message} Vault에 {path} 파일을 만들었습니다." },
	"notice.vectorsExportFailed": { en: "Failed to export vector file: {message}", ko: "벡터 파일 내보내기 실패: {message}" },
} as const;

export type StringKey = keyof typeof STRINGS;

let currentLocale: Locale = "en";

export function setLocale(locale: Locale): void {
	currentLocale = locale;
}

export function getLocale(): Locale {
	return currentLocale;
}

/** Resolve and apply the language setting; "auto" follows the Obsidian app language. */
export function applyLanguageSetting(language: LanguageSetting): void {
	if (language === "en" || language === "ko") {
		setLocale(language);
		return;
	}
	setLocale(moment.locale().toLowerCase().startsWith("ko") ? "ko" : "en");
}

/** Translate a string key, interpolating `{name}` placeholders from vars. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
	let text: string = STRINGS[key][currentLocale];
	if (vars) {
		for (const [name, value] of Object.entries(vars)) {
			text = text.split(`{${name}}`).join(String(value));
		}
	}
	return text;
}
