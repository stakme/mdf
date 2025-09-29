import type { InvalidFileWarning } from "../types.mts";
import { formatDisplayPath } from "./path-format.mts";

export function formatInvalidFileWarningLines(
	warning: InvalidFileWarning,
	cwd: string,
): string[] {
	const displayPath = formatDisplayPath(warning.filePath, cwd);
	return warning.messages.map(
		(message) => `Ignoring invalid Markdown file ${displayPath}: ${message}`,
	);
}

export function logInvalidFileWarnings(
	warnings: readonly InvalidFileWarning[],
	cwd: string,
): void {
	for (const warning of warnings) {
		for (const line of formatInvalidFileWarningLines(warning, cwd)) {
			console.warn(line);
		}
	}
}
