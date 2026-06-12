/** Common community-convention frontmatter keys for a note's creation date. */
const FRONTMATTER_CREATED_KEYS = ["created", "date created"] as const;

/** Hand-written dates outside this window are treated as typos and ignored. */
const MIN_PLAUSIBLE_MS = Date.UTC(1990, 0, 1);
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve a note's creation time, preferring the frontmatter `created` /
 * `date created` convention over the filesystem ctime. Frontmatter survives
 * vault copies and git clones, where ctime collapses to the copy date. Falls
 * back to `fileCtime` when the value is absent, unparsable, or implausible.
 */
export function resolveCreatedTime(
	frontmatter: Record<string, unknown> | undefined,
	fileCtime: number,
	nowMs: number = Date.now()
): number {
	if (frontmatter) {
		for (const key of FRONTMATTER_CREATED_KEYS) {
			const parsed = parseDateValue(frontmatter[key]);
			if (parsed !== null && parsed >= MIN_PLAUSIBLE_MS && parsed <= nowMs + FUTURE_TOLERANCE_MS) {
				return parsed;
			}
		}
	}
	return fileCtime;
}

function parseDateValue(value: unknown): number | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const ms = Date.parse(trimmed);
	return Number.isNaN(ms) ? null : ms;
}
