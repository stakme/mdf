import { MdfError } from "./errors.mts";

export function parseFrontMatterInputs(
	inputs: string[],
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const raw of inputs) {
		const { key, value } = parseFrontMatterInput(raw);
		mergeFrontMatterValue(result, key, value);
	}
	return result;
}

export function mergeFrontMatterValue(
	target: Record<string, unknown>,
	key: string,
	value: unknown,
): void {
	const current = target[key];
	if (current === undefined) {
		target[key] = value;
		return;
	}

	if (Array.isArray(current)) {
		if (Array.isArray(value)) {
			current.push(...value);
		} else {
			current.push(value);
		}
		return;
	}

	if (Array.isArray(value)) {
		target[key] = [current, ...value];
		return;
	}

	target[key] = [current, value];
}

export function parseFrontMatterInput(input: string): {
	key: string;
	value: unknown;
} {
	const separatorIndex = input.indexOf("=");
	if (separatorIndex === -1) {
		throw new MdfError(
			"INVALID_FRONT_MATTER",
			`Front matter must be provided as key=value, received: ${input}`,
		);
	}

	const key = input.slice(0, separatorIndex).trim();
	const rawValue = input.slice(separatorIndex + 1).trim();
	if (!key) {
		throw new MdfError(
			"INVALID_FRONT_MATTER",
			`Front matter key cannot be empty: ${input}`,
		);
	}

	const value = coerceFrontMatterValue(rawValue);
	return { key, value };
}

export function coerceFrontMatterValue(rawValue: string): unknown {
	const trimmed = stripWrappingQuotes(rawValue.trim());
	if (!trimmed.length) {
		return "";
	}

	if (/^(true|false)$/i.test(trimmed)) {
		return trimmed.toLowerCase() === "true";
	}

	if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
		const asNumber = Number(trimmed);
		if (!Number.isNaN(asNumber)) {
			return asNumber;
		}
	}

	if (
		(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
		(trimmed.startsWith("[") && trimmed.endsWith("]"))
	) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return trimmed;
		}
	}

	return trimmed;
}

export function stripWrappingQuotes(value: string): string {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}
