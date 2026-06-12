// Build-time stub for ngraph.graph / ngraph.forcelayout.
//
// three-forcegraph imports both to support its optional `forceEngine: 'ngraph'`
// mode, which this plugin never uses (the default d3 engine handles layout).
// ngraph.forcelayout generates its integrator with `new Function(...)` at
// runtime, which trips dynamic-code-execution checks in the Obsidian plugin
// review, so the real modules are aliased to this stub in esbuild.config.mjs.
export default function ngraphStub() {
	throw new Error("The ngraph force engine is not bundled with this plugin.");
}
