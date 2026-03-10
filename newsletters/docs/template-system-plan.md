# Template System Plan

## Goal

Replace the old page-owned template selector path with a real server-backed template system while keeping the low-level browser SDK.

## Public Surface

Two browser extremes:

- Low-level SDK:
  - `window.Newsletters.createSession(...)`
  - `window.Newsletters.renderTurnstile(...)`
  - `window.Newsletters.subscribe(...)`
- High-level dialog:
  - site selects a template in the script URL query string
  - `window.Newsletters.open(...)` uses the requested server template if one was configured
  - if no template was requested, `open(...)` uses the built-in default dialog

## Template Selection

Script URL examples:

- `/newsletters.js`
- `/newsletters.js?template=starter`
- `/newsletters.js?template=daisyui`
- `/newsletters.js?template=customer-signup-v1`

Behavior:

- `newsletters.js` parses its own `template` query parameter
- if a template was requested, the script starts fetching exactly that one template immediately
- the fetch is async and does not block script evaluation
- if `open(...)` happens before the template finishes loading, it waits for the same in-flight promise
- if the template is already loaded, dialog open is immediate

## Storage Model

Add one `newsletter_template` table with globally unique `name`.

Columns:

- `name` primary key
- `hostname` nullable
- `markup` text
- `created_at`
- `updated_at`

Ownership rules:

- `hostname IS NULL` means public template
- `hostname IS NOT NULL` means owned template

Access rules:

- public templates can be fetched by any known hostname
- owned templates can only be fetched by their owning hostname
- hostname owners can only CRUD their owned templates
- public templates are created and managed only by us through repo/deploy tooling

## Routes

Browser read route:

- `GET /newsletters/templates/:name`
  - requires known browser `Origin`
  - returns the requested template if it is public or owned by the requesting hostname
  - returns `404` for missing or not-owned templates

Authenticated owner CRUD:

- `GET /api/templates?hostname=...`
- `GET /api/templates/:name?hostname=...`
- `POST /api/templates`
- `PATCH /api/templates/:name`
- `DELETE /api/templates/:name`

Rules:

- all `/api/templates*` routes require JWT auth
- all owner CRUD is scoped to the authenticated hostname
- public templates are excluded from owner CRUD

## Public Templates

Public templates live in repo files and are synced into D1 by deploy tooling.

Initial public templates:

- `starter`
- `daisyui`

## Testing

Unit tests:

- template record and domain behavior
- browser script preload behavior
- owner CRUD behavior

Integration tests:

- known-host browser template fetch
- public template fetch
- owned template fetch allowed for owner and rejected for other hostnames
- authenticated template CRUD for owned templates only
- `newsletters.js?template=...` still works with the normal subscribe flow
