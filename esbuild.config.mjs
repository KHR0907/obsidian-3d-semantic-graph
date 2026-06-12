import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

esbuild
	.build({
		entryPoints: ["src/main.ts"],
		bundle: true,
		external: [
			"obsidian",
			"electron",
			"@codemirror/autocomplete",
			"@codemirror/collab",
			"@codemirror/commands",
			"@codemirror/language",
			"@codemirror/lint",
			"@codemirror/search",
			"@codemirror/state",
			"@codemirror/view",
			"@lezer/common",
			"@lezer/highlight",
			"@lezer/lr",
		],
		format: "cjs",
		target: "es2018",
		alias: {
			// Unused optional force engine; its runtime codegen (new Function)
			// would otherwise be flagged by the plugin review. See src/stubs/.
			"ngraph.graph": "./src/stubs/ngraph-stub.js",
			"ngraph.forcelayout": "./src/stubs/ngraph-stub.js",
		},
		logLevel: "info",
		sourcemap: prod ? false : "inline",
		treeShaking: true,
		outfile: "main.js",
		platform: "browser",
		define: {
			global: "globalThis",
		},
		minify: prod,
	})
	.catch(() => process.exit(1));
