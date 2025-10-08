import { promises as fs, type Stats } from "node:fs";
import path from "node:path";
import { MdfError } from "../errors.mts";
import {
	readMarkdownDocument,
	serializeMarkdownDocument,
} from "../front-matter.mts";
import { formatDisplayPath } from "../utils/path-format.mts";

export interface AppendCommandOptions {
	cwd: string;
	note: string;
	files: string[];
}

export interface AppendCommandResultEntry {
	destinationPath: string;
	markdownPath: string;
	altText: string;
}

export interface AppendCommandResult {
	notePath: string;
	appended: AppendCommandResultEntry[];
}

interface PreparedEntry extends AppendCommandResultEntry {
	sourcePath: string;
}

export async function runAppendCommand(
	options: AppendCommandOptions,
): Promise<AppendCommandResult> {
	if (!options.note) {
		throw new MdfError(
			"APPEND_INVALID_INPUT",
			"A Markdown file must be provided",
		);
	}

	if (options.files.length === 0) {
		throw new MdfError(
			"APPEND_INVALID_INPUT",
			"At least one file must be provided",
		);
	}

	const notePath = path.resolve(options.cwd, options.note);
	const noteStats = await readFileStats(notePath);
	if (!noteStats) {
		throw new MdfError(
			"APPEND_NOTE_NOT_FOUND",
			`Markdown file not found: ${formatDisplayPath(notePath, options.cwd)}`,
		);
	}

	if (!noteStats.isFile()) {
		throw new MdfError(
			"APPEND_INVALID_INPUT",
			`Target is not a file: ${formatDisplayPath(notePath, options.cwd)}`,
		);
	}

	const noteDirectory = path.dirname(notePath);
	const noteExtension = path.extname(notePath);
	const noteBaseName = path.basename(notePath, noteExtension || undefined);
	const assetsDirectory = path.join(noteDirectory, noteBaseName);

	await fs.mkdir(assetsDirectory, { recursive: true });

	const document = await readMarkdownDocument(notePath);
	const preparedEntries = await prepareEntries({
		cwd: options.cwd,
		notePath,
		assetsDirectory,
		files: options.files,
	});

	const updatedBody = appendImageReferences(document.body, preparedEntries);
	const serialized = serializeMarkdownDocument(
		document.frontMatter,
		updatedBody,
	);

	const moved: PreparedEntry[] = [];
	try {
		for (const entry of preparedEntries) {
			await moveFile(entry.sourcePath, entry.destinationPath);
			moved.push(entry);
		}

		await fs.writeFile(notePath, serialized, "utf8");
	} catch (error) {
		await rollbackMoves(moved);
		throw error;
	}

	const appended = preparedEntries.map<AppendCommandResultEntry>(
		({ destinationPath, markdownPath, altText }) => ({
			destinationPath,
			markdownPath,
			altText,
		}),
	);

	return { notePath, appended };
}

async function prepareEntries(params: {
	cwd: string;
	notePath: string;
	assetsDirectory: string;
	files: string[];
}): Promise<PreparedEntry[]> {
	const { cwd, notePath, assetsDirectory, files } = params;
	const results: PreparedEntry[] = [];
	const seenDestinations = new Set<string>();
	const noteDir = path.dirname(notePath);

	for (const file of files) {
		const sourcePath = path.resolve(cwd, file);
		const sourceStats = await readFileStats(sourcePath);
		if (!sourceStats) {
			throw new MdfError(
				"APPEND_SOURCE_NOT_FOUND",
				`File not found: ${formatDisplayPath(sourcePath, cwd)}`,
			);
		}
		if (!sourceStats.isFile()) {
			throw new MdfError(
				"APPEND_INVALID_INPUT",
				`Source is not a file: ${formatDisplayPath(sourcePath, cwd)}`,
			);
		}

		const fileName = path.basename(sourcePath);
		const destinationPath = path.join(assetsDirectory, fileName);
		if (seenDestinations.has(destinationPath)) {
			throw new MdfError(
				"APPEND_FILE_CONFLICT",
				`Multiple inputs resolve to ${formatDisplayPath(destinationPath, cwd)}`,
			);
		}

		if (sourcePath !== destinationPath) {
			const destinationExists = await fileExists(destinationPath);
			if (destinationExists) {
				throw new MdfError(
					"APPEND_FILE_CONFLICT",
					`File already exists: ${formatDisplayPath(destinationPath, cwd)}`,
				);
			}
		}

		seenDestinations.add(destinationPath);

		const markdownRelative = toPosixPath(
			path.relative(noteDir, destinationPath),
		);
		const altText = deriveAltText(fileName);

		results.push({
			sourcePath,
			destinationPath,
			markdownPath: markdownRelative,
			altText,
		});
	}

	return results;
}

function appendImageReferences(
	body: string,
	entries: readonly AppendCommandResultEntry[],
): string {
	if (entries.length === 0) {
		return body;
	}

	const imageLines = entries.map(
		(entry) => `![${entry.altText}](${entry.markdownPath})`,
	);

	let result = body;
	if (result.length > 0 && !result.endsWith("\n")) {
		result += "\n";
	}
	if (result.length > 0 && !result.endsWith("\n\n")) {
		result += "\n";
	}

	result += imageLines.join("\n");
	if (!result.endsWith("\n")) {
		result += "\n";
	}

	return result;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

async function moveFile(source: string, destination: string): Promise<void> {
	if (source === destination) {
		return;
	}

	try {
		await fs.rename(source, destination);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EXDEV") {
			await fs.copyFile(source, destination);
			await fs.unlink(source);
			return;
		}
		throw error;
	}
}

async function rollbackMoves(entries: readonly PreparedEntry[]): Promise<void> {
	for (const entry of [...entries].reverse()) {
		try {
			await moveFile(entry.destinationPath, entry.sourcePath);
		} catch {
			// Best effort rollback; ignore failures.
		}
	}
}

function deriveAltText(fileName: string): string {
	const base = fileName.replace(path.extname(fileName), "");
	const normalized = base.replace(/[-_]+/gu, " ").trim();
	return normalized || base || "image";
}

function toPosixPath(value: string): string {
	return value.split(path.sep).join(path.posix.sep);
}

async function readFileStats(filePath: string): Promise<Stats | null> {
	try {
		return await fs.stat(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}
		throw error;
	}
}
