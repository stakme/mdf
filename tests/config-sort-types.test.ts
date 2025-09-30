import { describe, expectTypeOf, it } from "vitest";
import { defineConfig, z } from "@stakme/mdf/config";

describe("config sort typing", () => {
	it("infers schema data for sort comparator", () => {
		defineConfig({
			schema: {
				typed: {
					schema: z.object({
						title: z.string(),
						created_at: z.iso.datetime(),
					}),
					sort: (left, right) => {
						expectTypeOf(left.created_at).toEqualTypeOf<string>();
						expectTypeOf(right.created_at).toEqualTypeOf<string>();
						const title = left.title;
						expectTypeOf(title).toEqualTypeOf<string>();
						// @ts-expect-error verifying unknown keys are rejected
						void left.missing;
						return left.created_at.localeCompare(right.created_at);
					},
				},
			},
		});
	});
});
