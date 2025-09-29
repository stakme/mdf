import type { z } from "zod";

export type IdGeneratorName = "uuid" | "ulid";

export interface DefaultsContext {
	now: Date;
}

export interface InvalidFileWarning {
	filePath: string;
	messages: string[];
}

export interface ContentContext<TData> extends DefaultsContext {
	data: TData;
}

export interface FileNameContext<TData> extends ContentContext<TData> {
	directory: string;
}

export type DefaultsValue<TData> =
	| Partial<TData>
	| ((context: DefaultsContext) => Partial<TData> | Promise<Partial<TData>>);

export type TemplateBodyContext<TData> = TData & { now: Date; data: TData };

export interface TemplateDefinition<TData> {
	schema?: string;
	frontmatter?: DefaultsValue<TData>;
	body?: TemplateBodyResolver<TData>;
}

export type TemplateBodyResolver<TData> =
	| string
	| ((context: TemplateBodyContext<TData>) => string | Promise<string>);

export interface VirtualPathConfig {
	param: string;
	separator?: string;
}

export interface LoadedVirtualPathConfig extends VirtualPathConfig {
	separator: string;
}

export interface SchemaDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
	name: string;
	glob?: string;
	schema: TSchema;
}

export type AnySchemaDefinition = SchemaDefinition<z.ZodTypeAny>;

export type SchemaEntryInput<TSchema extends z.ZodTypeAny = z.ZodTypeAny> =
	| TSchema
	| (Omit<SchemaDefinition<TSchema>, "name"> & { schema: TSchema });

export type SchemaRecordInput = Record<string, SchemaEntryInput>;

type ExtractSchemaFromEntry<TEntry> = TEntry extends z.ZodTypeAny
	? TEntry
	: TEntry extends { schema: infer TSchema extends z.ZodTypeAny }
		? TSchema
		: never;

type InferSchemaData<TEntry> = z.infer<ExtractSchemaFromEntry<TEntry>>;

type SchemaNames<TSchemaRecord> = keyof TSchemaRecord & string;

type SchemaDataUnion<TSchemaRecord> = SchemaNames<TSchemaRecord> extends never
	? Record<string, unknown>
	: {
			[TSchemaName in SchemaNames<TSchemaRecord>]: InferSchemaData<
				TSchemaRecord[TSchemaName]
			>;
		}[SchemaNames<TSchemaRecord>];

type TemplateDefinitionForSchema<
	TSchemaRecord extends SchemaRecordInput,
	TSchemaName extends SchemaNames<TSchemaRecord>,
> = {
	schema: TSchemaName;
	frontmatter?: DefaultsValue<InferSchemaData<TSchemaRecord[TSchemaName]>>;
	body?: TemplateBodyResolver<InferSchemaData<TSchemaRecord[TSchemaName]>>;
};

type TemplateDefinitionForSchemaUnion<TSchemaRecord extends SchemaRecordInput> =
	SchemaNames<TSchemaRecord> extends never
		? never
		: {
				[TSchemaName in SchemaNames<TSchemaRecord>]: TemplateDefinitionForSchema<
					TSchemaRecord,
					TSchemaName
				>;
			}[SchemaNames<TSchemaRecord>];

type TemplateDefinitionWithoutSchema = {
	schema?: undefined;
	frontmatter?: DefaultsValue<Record<string, unknown>>;
	body?: TemplateBodyResolver<Record<string, unknown>>;
};

export type TemplateConfigEntry<TSchemaRecord extends SchemaRecordInput> =
	| TemplateDefinitionWithoutSchema
	| TemplateDefinitionForSchemaUnion<TSchemaRecord>;

export type TemplatesConfig<TSchemaRecord extends SchemaRecordInput> = Record<
	string,
	TemplateConfigEntry<TSchemaRecord>
>;

export type SchemaConfig<
	TSchemaRecord extends SchemaRecordInput = SchemaRecordInput,
> =
	| z.ZodTypeAny
	| SchemaDefinition
	| readonly AnySchemaDefinition[]
	| TSchemaRecord;

export interface MdfConfig<
	TSchemaRecord extends SchemaRecordInput = SchemaRecordInput,
> {
	schema: SchemaConfig<TSchemaRecord>;
	defaultSchema?: SchemaNames<TSchemaRecord>;
	defaults?: DefaultsValue<SchemaDataUnion<TSchemaRecord>>;
	content?:
		| string
		| ((
				context: ContentContext<SchemaDataUnion<TSchemaRecord>>,
		  ) => string | Promise<string>);
	fileName?: (
		context: FileNameContext<SchemaDataUnion<TSchemaRecord>>,
	) => string | Promise<string>;
	extension?: string;
	templates?: TemplatesConfig<TSchemaRecord>;
	defaultTemplate?: string;
	virtualPath?: VirtualPathConfig;
	idGenerator?: IdGeneratorName;
	aliases?: Record<string, string>;
}

export interface LoadedSchema<TSchema extends z.ZodTypeAny = z.ZodTypeAny>
	extends SchemaDefinition<TSchema> {}

export interface LoadedConfig<
	TSchemaRecord extends SchemaRecordInput = SchemaRecordInput,
> extends Omit<MdfConfig<TSchemaRecord>, "schema"> {
	schema: z.ZodTypeAny;
	schemas: readonly LoadedSchema[];
	defaultSchema: string;
	getSchemaForRelativePath(relativePath: string): LoadedSchema;
	getSchemaByName(name: string): LoadedSchema | undefined;
	path: string;
	virtualPath?: LoadedVirtualPathConfig;
	idGenerator: IdGeneratorName;
}
