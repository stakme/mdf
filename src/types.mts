import type { z } from "zod";

export type DocumentSort<TData = Record<string, unknown>> = (
	a: TData,
	b: TData,
) => number;


export type SchemaFilenameGenerator<TData> = (
	data: TData,
) => string | Promise<string>;

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

export interface VirtualSlugConfig {
	param: string;
}

export interface SchemaDefinitionInput<
	TSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
	glob?: string;
	schema: TSchema;
	sort?: DocumentSort<z.infer<TSchema>>;
	visibleFields?: readonly string[];
	filenameGenerator?: SchemaFilenameGenerator<z.infer<TSchema>>;
}

export interface SchemaDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny>
	extends SchemaDefinitionInput<TSchema> {
	name: string;
}

export type AnySchemaDefinition = SchemaDefinition<z.ZodTypeAny>;

export type SchemaEntryInput<TSchema extends z.ZodTypeAny = z.ZodTypeAny> =
	| TSchema
	| SchemaDefinitionInput<TSchema>;

export type SchemaRecordInput = Record<string, SchemaEntryInput>;

type ExtractSchemaFromEntry<TEntry> = TEntry extends z.ZodTypeAny
	? TEntry
	: TEntry extends { schema: infer TSchema extends z.ZodTypeAny }
		? TSchema
		: never;

type InferSchemaData<TEntry> = z.infer<ExtractSchemaFromEntry<TEntry>>;

type SchemaNames<TSchemaRecord> = keyof TSchemaRecord & string;

type DefaultSchemaNameList<TSchemaRecord extends SchemaRecordInput> =
	readonly SchemaNames<TSchemaRecord>[];

export type DefaultSchemaConfig<
	TSchemaRecord extends SchemaRecordInput = SchemaRecordInput,
> = SchemaNames<TSchemaRecord> | DefaultSchemaNameList<TSchemaRecord>;

export type DefaultTemplateConfig<
	TSchemaRecord extends SchemaRecordInput = SchemaRecordInput,
> = Partial<Record<SchemaNames<TSchemaRecord>, string>>;

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

export type RepoIcon = "github" | "gitlab";

export interface RepoConfig {
	icon: RepoIcon;
	url: string;
}

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
	defaultSchema?: DefaultSchemaConfig<TSchemaRecord>;
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
	defaultTemplate?: DefaultTemplateConfig<TSchemaRecord>;
	virtualPath?: VirtualPathConfig;
	virtualSlug?: VirtualSlugConfig;
	aliases?: Record<string, string>;
	repo?: RepoConfig;
}

export type MdfConfigWithRecord<
	TSchemaRecord extends SchemaRecordInput = SchemaRecordInput,
> = Omit<MdfConfig<TSchemaRecord>, "schema"> & { schema: TSchemaRecord };

export interface LoadedSchema<TSchema extends z.ZodTypeAny = z.ZodTypeAny>
	extends SchemaDefinition<TSchema> {}

export interface LoadedConfig<
	TSchemaRecord extends SchemaRecordInput = SchemaRecordInput,
> extends Omit<MdfConfig<TSchemaRecord>, "schema"> {
	schema: z.ZodTypeAny;
	schemas: readonly LoadedSchema[];
	defaultSchema: string;
	schemaPriority?: readonly string[];
	getSchemaForRelativePath(relativePath: string): LoadedSchema;
	getSchemaByName(name: string): LoadedSchema | undefined;
	path: string;
	virtualPath?: LoadedVirtualPathConfig;
	virtualSlug?: VirtualSlugConfig;
}
