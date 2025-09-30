import { defineConfig, z } from "@stakme/mdf/config";

defineConfig({
        schema: {
                typed: {
                        schema: z.object({
                                title: z.string(),
                                created_at: z.iso.datetime(),
                        }),
                        sort: (left, right) => {
                                const leftCreatedAt: string = left.created_at;
                                const rightCreatedAt: string = right.created_at;

                                // @ts-expect-error missing property should not type-check
                                void left.missing;

                                return leftCreatedAt.localeCompare(rightCreatedAt);
                        },
                },
        },
});
