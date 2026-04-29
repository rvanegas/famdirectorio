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
npm run db:push       # apply schema changes to ~/src/fam/db/family.db
npm run db:generate   # generate migration files

# Tests
npm test
```

## CLI Usage

```
fam member list [--generation N] [--city name]
fam member get <id>
fam member add                    # interactive prompts
fam member edit <id>
fam member delete <id>

fam relationship add <fromId> <toId> <type>   # type: child|spouse  (child: fromId=parent, toId=child; siblings are inferred)
fam relationship list <memberId>

fam family sync                   # sync nuclear_families table from relationships
fam family verify                 # verify tree integrity

fam db backup                     # timestamped backup of family.db

fam media add <memberId> <filePath> [--caption text] [--primary]
fam media list <memberId>
fam media set-primary <mediaId>

fam pdf generate [--branch name] [--member id] [--output path]
```

## Language

CLI commands, error messages, and code are in English. Email template content (subject lines and body text) is in Spanish.

Member name/city/occupation/notes prompts accept ASCII escape sequences for diacritics: `a'`→á, `e'`→é, `i'`→í, `o'`→ó, `u'`→ú, `n~`→ñ, `u"`→ü (uppercase versions work too). Decoded in `src/cli/utils/prompts.ts`.

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
│   ├── types.ts          # Domain interfaces (Member, Relationship, MediaAsset, NuclearFamily)
│   └── *.repository.ts   # CRUD — members, relationships, nuclearFamilies, media
├── pdf/
│   ├── generator.ts      # assembles full yearbook; queries via repositories
│   └── layouts/          # cover, toc, familyPage, memberPage, branchPage, indexPage
└── cli/
    ├── program.ts        # Commander root
    ├── commands/         # one file per command group (member, relationship, family, media, pdf, db)
    └── utils/            # table formatters, interactive prompts
```

**Configuration**: `~/.config/famdirectorio/config.toml` (read at startup; CLI exits if missing or invalid)

```toml
dir = "/Users/rodvandur/.local/share/famdirectorio"
senders = [10, 26, 52]   # member IDs; resolved to {{sender1}}, {{sender2}}, ... in email templates

[smtp]
host = "..."
user = "..."
pass = "..."
from = "..."
# ssl = true    # optional; defaults to false
# port = 465   # optional; defaults to 587, or 465 if ssl = true
```

**Data files** (all relative to `dir` in config):
- `db/family.db` — SQLite database (auto-created on first run)
- `media/{memberId}/` — local photo storage
- `email-templates/` — mustache `.txt` templates for `fam email send`
- `data/output/` — generated PDFs (gitignored)

**Schema tables**: `members`, `relationships` (edge list), `nuclearFamilies` (derived from relationships; synced via `fam family sync`), `media`

**PDF output**: `data/output/yearbook-YYYY-MM-DD.pdf`. Page order: Cover → TOC → per-branch divider → Gen 1-2 full pages → Gen 3+ 4-per-page grid.
