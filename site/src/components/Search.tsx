import { useMemo, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "./ui/command";

export interface SearchItem {
	title: string;
	path: string;
	description?: string;
	tags?: string[];
	vpath?: string;
	author?: string;
	createdAt?: string;
	updatedAt?: string;
}

export default function Search({
	items,
}: {
	items: SearchItem[];
}): JSX.Element {
	const [query, setQuery] = useState("");

	const filtered = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) {
			return items.slice(0, 50);
		}
		return items
			.filter((item) => {
				const haystacks = [
					item.title,
					item.description ?? "",
					item.vpath ?? "",
				];
				if (item.tags) {
					haystacks.push(...item.tags);
				}
				if (item.author) {
					haystacks.push(item.author);
				}
				if (item.createdAt) {
					haystacks.push(item.createdAt);
				}
				if (item.updatedAt) {
					haystacks.push(item.updatedAt);
				}
				return haystacks.some((value) =>
					value.toLowerCase().includes(normalized),
				);
			})
			.slice(0, 50);
	}, [items, query]);

	return (
		<Command className="w-full min-w-[18rem] max-w-md">
			<CommandInput
				placeholder="Search docs…"
				value={query}
				onValueChange={setQuery}
			/>
			<CommandList>
				<CommandEmpty>No matches found.</CommandEmpty>
				{filtered.map((item) => (
					<CommandItem
						key={item.path}
						onSelect={() => {
							window.location.href = item.path;
						}}
					>
						<div className="flex flex-col">
							<span className="font-medium leading-tight">{item.title}</span>
							{item.description && (
								<span className="text-xs text-neutral-500 dark:text-neutral-400">
									{item.description}
								</span>
							)}
							{item.vpath && (
								<span className="text-xs text-neutral-400 dark:text-neutral-500">
									{item.vpath}
								</span>
							)}
							{(item.author || item.createdAt || item.updatedAt) && (
								<span className="text-xs text-neutral-400 dark:text-neutral-500">
									{[item.author, item.createdAt, item.updatedAt]
										.filter(Boolean)
										.join(" • ")}
								</span>
							)}
						</div>
					</CommandItem>
				))}
			</CommandList>
		</Command>
	);
}
