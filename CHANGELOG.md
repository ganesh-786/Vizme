# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); this project does not yet use tagged
releases (backend/frontend deploy from `main`; the `visualizemet` library is versioned separately
on npm, see `library/package.json`).

History prior to this file's introduction is available via `git log`; it is not backfilled here to
avoid guessing at dates and scope that weren't recorded at the time.

## [Unreleased]

### Added

- Root `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`, and this `CHANGELOG.md`.
- `docs/API.md` — REST API reference generated from the actual route source.
- `docs/PRODUCTION_ROADMAP.md` — maintained gap analysis and deployment plan (replaces
  `docs/Roadmap.md` as the current plan; that file is kept for historical context).
- `.claude/CLAUDE.md` — project context and conventions for AI-assisted development.

### Changed

- `docs/` reorganized into category subfolders: `getting-started/`, `architecture/`, `reference/`,
  `operations/`, `archive/`. `docs/README.md` is now a category index rather than a flat file
  listing.
- `docs/README.md` rewritten from a stale, duplicate 600+ line document into a short index of the
  `docs/` folder.
- `docs/ARCHITECTURE.md` and `docs/SETUP.md` corrected to describe the actual Mimir remote-write
  ingestion pipeline (previously described an older Pushgateway-based design).
- `library/README.md` expanded with the zero-code tracking attribute reference (product context,
  `data-vizme-value-from`, the `vizme:track` custom event, Schema.org fallback).
- License field unified to MIT across `package.json`, `backend/package.json`, and `library/package.json`
  (previously inconsistent: unset, ISC, and MIT respectively).

### Removed

- `docs/IMPLEMENTATION.md` — obsolete MVP build summary, superseded by `docs/ARCHITECTURE.md` and
  `docs/MIMIR_MULTITENANCY.md`.
- `docs/ENHANCEMENT_SUMMARY.md` — its unique reference content (zero-code tracking attributes) was
  migrated into `library/README.md` before removal.
- `docs/METRICS_TOTAL_REVENUE.md` — merged into `docs/METRICS_CALCULATIONS.md` as a worked example.
