const CACHE_BUSTER_PARAM = "__mdf_cache__";
let cacheKey: string | null = null;

function getCacheKey(): string {
	if (cacheKey) {
		return cacheKey;
	}
	const random = Math.random().toString(36).slice(2);
	cacheKey = `${Date.now().toString(36)}${random}`;
	return cacheKey;
}

function appendCacheBusterToString(url: string, key: string): string {
	const separator = url.includes("?") ? "&" : "?";
	return `${url}${separator}${CACHE_BUSTER_PARAM}=${encodeURIComponent(key)}`;
}

function withCacheBuster(
	input: RequestInfo | URL,
	key: string,
): RequestInfo | URL {
	if (typeof input === "string") {
		return appendCacheBusterToString(input, key);
	}
	if (typeof URL !== "undefined" && input instanceof URL) {
		const next = new URL(input.toString());
		next.searchParams.set(CACHE_BUSTER_PARAM, key);
		return next;
	}
	return input;
}

export async function fetchJson<T>(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<T> {
	const cacheKeyValue = getCacheKey();
	const request = withCacheBuster(input, cacheKeyValue);
	const response = await fetch(request, {
		cache: "no-store",
		...init,
	});
	if (!response.ok) {
		let message = `${response.status} ${response.statusText}`;
		try {
			const problem = await response.json();
			if (typeof problem?.error === "string") {
				message = problem.error;
			}
		} catch {
			// ignore JSON parsing errors
		}
		throw new Error(message);
	}

	return (await response.json()) as T;
}
