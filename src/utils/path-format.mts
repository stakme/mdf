import path from "node:path";

export function formatDisplayPath(filePath: string, cwd: string): string {
	const relative = path.relative(cwd, filePath) || path.basename(filePath);
	if (relative.startsWith("..")) {
		return relative;
	}
	return relative.startsWith(".") ? relative : `./${relative}`;
}

export function formatRelativePath(filePath: string, cwd: string): string {
	const relative = path.relative(cwd, filePath) || path.basename(filePath);
	return relative;
}
