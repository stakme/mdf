export function normalizeViewerRoutePathKey(
	routePath: string | null | undefined,
): string | null {
	if (!routePath) {
		return null;
	}

	const trimmed = routePath.trim();
	if (trimmed.length === 0) {
		return null;
	}

	const withoutSlashes = trimmed.replace(/^\/+|\/+$/gu, "");
	if (withoutSlashes.length === 0) {
		return null;
	}

	return withoutSlashes;
}
