# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build TypeScript to JavaScript
npm run build

# Run during development (no build step)
npm run dev -- <command>

# Run compiled CLI
node dist/index.js <command>
# or after npm link: fam <command>

# Database
npm run db:push       # apply schema changes to data/family.db
npm run db:generate   # generate migration files

# Tests
npm test
```

## CLI Usage

```
fam import csv [file]             # import CSV into SQLite (default: data/duranmazuera-id.csv)
fam import status                 # show record counts

fam member list [--generation N] [--branch id] [--city name]
fam member get <id>
fam member add                    # interactive prompts
fam member edit <id>
fam member delete <id>

fam relationship add <fromId> <toId> <type>   # type: child|spouse|sibling  (child: fromId=parent, toId=child)
fam relationship list <memberId>

fam branch list
fam branch show <name>            # shows all members in branch by generation

fam media add <memberId> <filePath> [--caption text] [--primary]
fam media list <memberId>
fam media set-primary <mediaId>

fam pdf generate [--branch name] [--member id] [--output path]
```

## Architecture

**Stack**: TypeScript, Node.js 22, SQLite via Drizzle ORM + better-sqlite3, PDFKit, Commander.js

**Module boundary rule**: `cli/` and `pdf/` import from `core/`. `core/` imports from `db/`. Nothing in `core/` knows about Commander or PDFKit — this is the seam a future web server will use.

```
src/
├── index.ts              # CLI entrypoint (3 lines, delegates to cli/program.ts)
├── db/
│   ├── schema.ts         # Drizzle table definitions (single source of truth)
│   └── client.ts         # exports db instance (better-sqlite3 + drizzle)
├── core/
│   ├── types.ts          # Domain interfaces (Member, Branch, Relationship, MediaAsset)
│   └── *.repository.ts   # CRUD — members, relationships, branches, media
├── import/
│   ├── csv.parser.ts     # PapaParse wrapper
│   ├── csv.mapper.ts     # raw CSV row → domain objects + relationship edges
│   └── csv.importer.ts   # orchestrates parse → map → upsert + branch resolution
├── pdf/
│   ├── generator.ts      # assembles full yearbook; queries via repositories
│   └── layouts/          # cover, toc, memberPage, branchPage
└── cli/
    ├── program.ts        # Commander root
    ├── commands/         # one file per command group
    └── utils/            # table formatters, interactive prompts
```

**Data files**:
- `data/duranmazuera-id.csv` — canonical import source (CSV `Ref`+`Rel` columns encode parent-child/spouse relationships)
- `data/family.db` — SQLite database (gitignored)
- `data/media/{memberId}/` — local photo storage referenced by member ID
- `data/output/` — generated PDFs (gitignored)

**Schema tables**: `members`, `relationships` (edge list), `branches` (14, one per Gen-2 child), `media`

**PDF output**: `data/output/yearbook-YYYY-MM-DD.pdf`. Page order: Cover → TOC → per-branch divider → Gen 1-2 full pages → Gen 3+ 4-per-page grid.
