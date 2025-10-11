export type Route =
        | { type: "document"; routePath: string | null }
        | { type: "fm-index" }
        | { type: "fm-field"; field: string }
        | { type: "fm-value"; field: string; value: string };

export function parseRoute(): Route {
        const hash = window.location.hash.slice(1);
        if (!hash || hash === "/") {
                return { type: "document", routePath: null };
        }

        const parts = hash.split("/").filter(Boolean);
        if (parts.length === 0) {
                        return { type: "document", routePath: null };
        }

        if (parts[0] === "fm") {
                if (parts.length === 1) {
                        return { type: "fm-index" };
                }
                if (parts.length === 2) {
                        return { type: "fm-field", field: decodeURIComponent(parts[1]) };
                }
                if (parts.length === 3) {
                        return {
                                type: "fm-value",
                                field: decodeURIComponent(parts[1]),
                                value: decodeURIComponent(parts[2]),
                        };
                }
        }

        const decodedSegments = parts.map((segment) => {
                try {
                        return decodeURIComponent(segment);
                } catch {
                        return segment;
                }
        });

        return {
                type: "document",
                routePath: decodedSegments.join("/"),
        };
}

export function buildDocumentHash(routePath: string): string {
        const trimmed = routePath.trim();
        if (!trimmed || trimmed === "/") {
                return "#/";
        }

        const encoded = trimmed
                .split("/")
                .map((segment) => encodeURIComponent(segment))
                .join("/");

        return `#/${encoded}`;
}
