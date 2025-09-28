export type MarkdfmErrorCode =
        | "CONFIG_NOT_FOUND"
        | "SCHEMA_VALIDATION"
        | "INVALID_FRONT_MATTER"
        | "INVALID_FILE_NAME"
        | "INVALID_CONTENT"
        | "FILE_EXISTS"
        | "FRONT_MATTER_NOT_FOUND"
        | "FRONT_MATTER_PARSE"
        | "NO_MATCHING_FILES"
        | "INVALID_FILTER_EXPRESSION"
        | "INVALID_QUERY_FILTER"
        | "TEMPLATE_NOT_FOUND"
        | "INVALID_UPDATE_INPUT"
        | "DEFAULT_VALUE_UNAVAILABLE"
        | "VIRTUAL_PATH_NOT_CONFIGURED"
        | "INVALID_VIRTUAL_PATH_VALUE"
        | "ALIAS_NOT_FOUND"
        | "ALIAS_CYCLE"
        | "INVALID_ALIAS_COMMAND";

export class MarkdfmError extends Error {
        constructor(
                public readonly code: MarkdfmErrorCode,
                message: string,
        ) {
                super(message);
                this.name = "MarkdfmError";
        }
}
