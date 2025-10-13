---
title: Backlog Tickets
vpath: /recipes
tags:
draft: false
chapter: 320
---

## Create a new ticket

In this project, I use `mdf` to track backlog tickets. When I want to add a new
ticket, I use the `new` command:

```bash
$ npx @stakme/mdf new  --template backlog ./TODO

TODO/1760332871430.md
```

Then you can open the file and fill in the content. Templates will enforce a
consistent structure to your AI assistants.

## List tickets

When I need a list of undone tickets, I can list them easily:

```bash
$ npx @stakme/mdf list --filter "status=todo" ./TODO

./TODO
├── Static export (./TODO/01K7DJQ035ARH9N8JJXAPED2Y2.md)
└── Make this repo public (./TODO/1760332871430.md)
```

In my development workflow, I copy a line in the output like
`Make this repo public (./TODO/1760332871430.md)`, paste it in Codex console and
just send it to Codex.

But this is a bit verbose. So I created an alias in the config file:

```ts
aliases: {
  todo: `list --filter "status=todo" ./TODO`,
},
```

Now I can run `mdf todo` to list undone tickets. It behaves like the above
command.

```bash
$ npx @stakme/mdf run todo
```

### Close a ticket

You can close a ticket and update its timestamp with:

```bash
npx @stakme/mdf update \
  --fm status=done \
  --fm updated_at \
  ./TODO/01K6BSE06562Y4C34KXETJ7SYV.md
```
