import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	createViewerApp,
	prepareViewerContext,
} from "../src/commands/viewer.mts";
import { setupWorkspace } from "./helpers";

describe("viewer options", () => {
	it("disables hot reload script and /events when reload is off", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
  schema: z.object({
    title: z.string(),
    vpath: z.string().optional(),
  }),
  virtualPath: {
    param: "vpath",
    separator: "/",
  },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });
		await fs.writeFile(
			path.join(notesDir, "note.md"),
			`---\ntitle: Note\nvpath: docs/note\n---\n# Note`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			const { app } = await createViewerApp(() => context, {
				enableHotReload: false,
			});
			const eventsResponse = await app.request("http://localhost/events");
			// The fallback index should be served when hot reload is disabled
			expect(eventsResponse.status).toBe(200);
			expect(eventsResponse.headers.get("content-type")).toBe(
				"text/html; charset=utf-8",
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("logs an access line when accessLog is enabled", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
  schema: z.object({
    title: z.string(),
    vpath: z.string().optional(),
  }),
  virtualPath: {
    param: "vpath",
    separator: "/",
  },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });
		await fs.writeFile(
			path.join(notesDir, "alpha.md"),
			`---\ntitle: Alpha\nvpath: docs/alpha\n---\n# Alpha`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			const spy = vi.spyOn(console, "log").mockImplementation(() => {});
			try {
				const { app } = await createViewerApp(() => context, {
					accessLog: true,
				});
				const response = await app.request(
					`http://localhost/?doc=${encodeURIComponent(context.documents[0]?.id ?? "")}`,
				);
				expect(response.status).toBe(200);
				// Expect at least one access log line
				const logged = spy.mock.calls.some(
					(args) =>
						String(args[0]).includes("[viewer]") &&
						String(args[0]).includes("->"),
				);
				expect(logged).toBe(true);
			} finally {
				spy.mockRestore();
			}
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("omits the virtual path field from viewer front matter", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
  schema: z.object({
    title: z.string(),
    status: z.string().optional(),
    vpath: z.string().optional(),
  }),
  virtualPath: {
    param: "vpath",
    separator: "/",
  },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });
		await fs.writeFile(
			path.join(notesDir, "note.md"),
			`---\ntitle: Note\nstatus: draft\nvpath: docs/note\n---\n# Note`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			const document = context.documents[0];
			expect(document?.frontMatter).toMatchObject({
				title: "Note",
				status: "draft",
			});
			expect(document?.frontMatter).not.toHaveProperty("vpath");

			const vpathField = context.frontMatterIndex.fieldMap.get("vpath");
			expect(vpathField?.values.map((entry) => entry.value)).toContain(
				"docs/note",
			);
			const fieldNames = context.frontMatterIndex.fields.map(
				(field) => field.name,
			);
			expect(fieldNames).toContain("vpath");
			expect(fieldNames).toContain("status");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
