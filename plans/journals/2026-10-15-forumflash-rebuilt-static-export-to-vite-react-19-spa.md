---
title: "ForumFlash rebuilt: static export to Vite + React 19 SPA"
date: 2026-10-15
summary: "Rebuilt the ForumFlash IELTS vocab site from a Next.js static-export snapshot into a Vite + React 19 + TS + Tailwind v4 + shadcn/ui SPA, recovering the full 4,000-word dataset from a Turbopack chunk."
---

# ForumFlash rebuilt: static export to Vite + React 19 SPA

# ForumFlash: Next.js Static Export → Vite + React 19 SPA

**Date**: 2026-10-15
**Severity**: Low (completed migration)
**Component**: ForumFlash IELTS vocabulary site (repo root)
**Status**: Resolved

## What Happened

Rebuilt ForumFlash from a lone Next.js static-export snapshot (now in `legacy/`) into a proper SPA at repo root: Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui (base-nova, Base UI). No source repo existed — the deployed bundle was the only artifact.

## The Brutal Truth

The scary part wasn't the rewrite — it was that the *entire product* lived inside one minified Turbopack chunk. Lose that file and 4,000 hand-curated vocab items (20 topics × 200, IPA + Vietnamese meanings + examples + idioms + topic graph) are gone forever. There was no backup, no repo, no schema. Data recovery had to come first; the app was scaffolding by comparison.

## Technical Details

- **Dataset recovery**: bracket-matched literals out of `legacy/_next/static/immutable/chunks/3xrtwzmbeeyny.js` → `src/data/topics.json` (4,000 items intact).
- **Brand recovery**: Alexandria + CalSans woff2 → `public/fonts`, `@font-face` in `src/index.css`. Design system persisted at `design-system/forumflash/MASTER.md` (Swiss minimal, adult B2–C1 learners).
- **App**: routes `/` and `/topic/:id`; home hero + 20 topic cards w/ progress; topic page w/ Tabs over the 4 original modes — Học thẻ flashcard, Trắc nghiệm MCQ, Viết lại, Nối từ — plus searchable word list. Learned state in localStorage `forumflash.learned.v1`.
- **Code review fixes**: stale mode state across topic nav (remount Tabs via `key`), non-reactive progress (`useSyncExternalStore` + custom event), unbounded quiz distractor loop (distinct-meaning pool), duplicate-meaning match rounds (bounded resample), uncleared timer (ref + cleanup).
- **UX/AX**: llms.txt + llms-full.txt, sitemap.xml (21 routes), robots.txt, OG/Twitter/JSON-LD `LearningResource`, per-route titles, skip-link, flashcard keyboard nav, focus-visible, prefers-reduced-motion, copy-link, scrollable tabs on mobile.
- **Verified**: typecheck/lint/build green; desktop + mobile browser check, dark mode, zero console errors, reactive learned counter.

## Root Cause Analysis

Root cause of the whole exercise: the project shipped as a deploy artifact with no recoverable source or data. Everything else followed from that.

## Lessons Learned

- Never let the shipped bundle be the only copy. `src/data/topics.json` is now versioned source-of-truth.
- Extract data before touching UI — a pretty shell over a missing dataset is worthless.
- Static-export minified chunks *can* be mined; bracket-matching beats regex on strings containing brackets.

## Next Steps

- Keep `design-system/forumflash/MASTER.md` as canonical brand reference.
- Optional: automated extraction test pinning topics.json shape (20×200) to prevent silent data loss.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
