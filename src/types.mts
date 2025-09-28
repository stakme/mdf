import type { z } from "zod";

export interface DefaultsContext {
	now: Date;
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
        frontmatter?: DefaultsValue<TData>;
        body?:
                | string
                | ((context: TemplateBodyContext<TData>) => string | Promise<string>);
}

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

export type SchemaConfig<TSchema extends z.ZodTypeAny = z.ZodTypeAny> =
        | TSchema
        | SchemaDefinition<TSchema>
        | readonly SchemaDefinition<TSchema>[];

export interface MarkdfmConfig<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
        schema: SchemaConfig<TSchema>;
        defaultSchema?: string;
        defaults?: DefaultsValue<z.infer<TSchema>>;
        content?:
                | string
                | ((context: ContentContext<z.infer<TSchema>>) => string | Promise<string>);
        fileName?: (
                context: FileNameContext<z.infer<TSchema>>,
        ) => string | Promise<string>;
        extension?: string;
        templates?: Record<string, TemplateDefinition<z.infer<TSchema>>>;
        defaultTemplate?: string;
        virtualPath?: VirtualPathConfig;
}

export interface LoadedSchema<TSchema extends z.ZodTypeAny = z.ZodTypeAny>
        extends SchemaDefinition<TSchema> {}

export interface LoadedConfig<TSchema extends z.ZodTypeAny = z.ZodTypeAny>
        extends Omit<MarkdfmConfig<TSchema>, "schema"> {
        schema: TSchema;
        schemas: readonly LoadedSchema<TSchema>[];
        defaultSchema: string;
        getSchemaForRelativePath(relativePath: string): LoadedSchema<TSchema>;
        path: string;
        virtualPath?: LoadedVirtualPathConfig;
}
