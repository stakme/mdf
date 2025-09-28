import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

function getInitialDarkMode(): boolean {
	if (typeof document === "undefined") {
		return false;
	}
	if (document.documentElement.classList.contains("dark")) {
		return true;
	}
	const stored = localStorage.getItem("theme");
	if (stored === "dark" || stored === "light") {
		return stored === "dark";
	}
	return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

export default function ThemeToggle(): JSX.Element {
	const [isDark, setIsDark] = useState<boolean>(getInitialDarkMode);

	useEffect(() => {
		if (typeof document === "undefined") {
			return;
		}
		document.documentElement.classList.toggle("dark", isDark);
		localStorage.setItem("theme", isDark ? "dark" : "light");
	}, [isDark]);

	return (
		<button
			type="button"
			aria-label="Toggle theme"
			onClick={() => setIsDark((value) => !value)}
			className="inline-flex items-center gap-2 rounded border border-neutral-200 px-3 py-1 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
		>
			{isDark ? (
				<Moon size={16} aria-hidden="true" />
			) : (
				<Sun size={16} aria-hidden="true" />
			)}
			<span>{isDark ? "Dark" : "Light"}</span>
		</button>
	);
}
