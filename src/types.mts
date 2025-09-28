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

export interface MarkdfmConfig<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
        schema: TSchema;
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
}

export interface LoadedConfig<TSchema extends z.ZodTypeAny = z.ZodTypeAny>
        extends MarkdfmConfig<TSchema> {
        path: string;
}
