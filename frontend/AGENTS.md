<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# The design rules are NOT in this file

**Read `../AGENTS.md`.** It is the design and build specification for
this product — colour, type, spacing, the component inventory, the page
templates, all of it — and it is the file every rule in this repository
refers to when it says "AGENTS.md".

This file exists only because `next dev` writes the block above into
whichever directory it is run from, and since the repository was split
into `frontend/` and `backend/` that directory is this one. It is not a
second specification and nothing should be added to it.

Do not delete it either: `next dev` re-creates it on the next run, and
it would come back without this pointer.
