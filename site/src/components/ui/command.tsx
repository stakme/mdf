import { Command as CommandPrimitive } from "cmdk";
import * as React from "react";

function cn(...classes: Array<string | false | null | undefined>): string {
	return classes.filter(Boolean).join(" ");
}

export const Command = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
	<CommandPrimitive
		ref={ref}
		className={cn(
			"w-full rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50",
			className,
		)}
		{...props}
	/>
));
Command.displayName = CommandPrimitive.displayName;

export const CommandInput = React.forwardRef<
	HTMLInputElement,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
	<div className="flex items-center border-b border-neutral-200 px-3 dark:border-neutral-800">
		<CommandPrimitive.Input
			ref={ref}
			className={cn(
				"flex h-10 w-full bg-transparent py-2 text-sm outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400",
				className,
			)}
			{...props}
		/>
	</div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

export const CommandList = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.List>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.List
		ref={ref}
		className={cn(
			"max-h-80 overflow-y-auto px-1 py-2 text-sm text-neutral-700 dark:text-neutral-200",
			className,
		)}
		{...props}
	/>
));
CommandList.displayName = CommandPrimitive.List.displayName;

export const CommandEmpty = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Empty>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Empty
		ref={ref}
		className={cn(
			"px-3 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400",
			className,
		)}
		{...props}
	/>
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

export const CommandItem = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Item
		ref={ref}
		className={cn(
			"flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors aria-selected:bg-neutral-100 dark:aria-selected:bg-neutral-900",
			className,
		)}
		{...props}
	/>
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

export const CommandGroup = CommandPrimitive.Group;
export const CommandSeparator = CommandPrimitive.Separator;
