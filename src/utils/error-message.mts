import { MdfError } from "../errors.mts";

export function formatErrorMessage(error: unknown): string {
	if (error instanceof MdfError) {
		return error.message;
	}

	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
