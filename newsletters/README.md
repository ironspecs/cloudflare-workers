# Newsletters

`newsletters` is a Cloudflare Worker for collecting newsletter signups from approved hostnames. It serves an embeddable browser script, supports either a worker-managed dialog or a low-level browser SDK, validates the request against a known hostname, and stores subscriptions in D1.

The route layer uses `Hono`, but the security and business logic stay in small local modules under `src/lib` and `src/domain`.

## Why This Exists

This service exists so multiple websites can share one newsletter signup backend without each site re-implementing:

- hostname allowlisting
- signed short-lived submit tokens for browser embeds
- bot protection with Turnstile
- a small browser SDK for custom UIs
- a server-backed template system for worker-managed dialogs
- rate limiting
- encrypted per-hostname secret storage

The goal is a small public codebase that is understandable enough to copy, but strict enough to run in production.

## Hook It Up To A Website

These are the steps to connect a site such as `softwarepatterns.com`.

### 1. Add the hostname to encrypted config

`config-enc.yaml` stores:

- KEKs under `keks`
- per-hostname public and secret config under `turnstile.hostnames`

Example shape:

```yaml
keks:
  active_id: kek202603101850
  keys:
    kek202603101850: <base64-encoded-32-byte-key>

turnstile:
  hostnames:
    softwarepatterns.com:
      jwks_url: https://auth.inbox-manager.com/.well-known/jwks.json
      site_key: <turnstile-site-key>
      secret_key: <turnstile-secret-key>
```

### 2. Sync encrypted config into Cloudflare

From [newsletters/package.json](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/package.json):

```zsh
npm run config:sync
```

This does two things:

- sets the worker secret `HOSTNAME_CONFIG_KEKS_JSON`
- upserts `hostname_config` and `hostname_config_secrets` rows in remote D1

### 3. Deploy the worker

```zsh
npm run deploy:live
```

### 4. Add the embed script to your site

```html
<script src="https://newsletters.softwarepatterns.workers.dev/newsletters.js" defer></script>
```

### 5. Pick a browser integration mode

Available templates:

| Template                  | File                                                                                                                                                                         | Stack                 | Notes                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------- |
| Built-in dialog           | Worker-managed                                                                                                                                                               | none                  | Fastest path. No template query string.                  |
| Starter dialog            | [newsletters/examples/templates/starter-dialog.html](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/examples/templates/starter-dialog.html)                   | plain HTML + your CSS | Public server template. Select with `?template=starter`. |
| Tailwind + DaisyUI dialog | [newsletters/examples/templates/tailwind-daisyui-dialog.html](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/examples/templates/tailwind-daisyui-dialog.html) | Tailwind + DaisyUI    | Public server template. Select with `?template=daisyui`. |

#### Option A: Use the built-in dialog

```html
<button id="newsletter-signup">Subscribe</button>
<script>
	document.getElementById('newsletter-signup').addEventListener('click', () => {
		window.Newsletters.open({
			listName: 'weekly',
			personName: '',
		});
	});
</script>
```

#### Option B: Use a worker-managed template

Pick one server-backed template in the script URL:

```html
<script src="https://newsletters.softwarepatterns.workers.dev/newsletters.js?template=starter" defer></script>
```

Then call `open()` normally:

```html
<button id="newsletter-signup-template">Subscribe</button>
<script>
	document.getElementById('newsletter-signup-template').addEventListener('click', () => {
		window.Newsletters.open({
			listName: 'weekly',
			personName: '',
		});
	});
</script>
```

Notes:

- Only the requested template is fetched.
- Public templates can be used by any known hostname.
- Owned templates can only be used by their owning hostname.
- The Tailwind + DaisyUI template assumes your site already ships Tailwind utilities and DaisyUI component classes.
- The DaisyUI template uses theme tokens such as `bg-base-100`, `text-base-content`, `border-base-300`, and `btn-primary`, so it follows light and dark themes without hardcoded colors.
- If your Tailwind build purges unused classes, safelist the classes from the template file or import the file into the build.

#### Option C: Build the UI yourself with the browser SDK

```html
<form id="newsletter-form">
	<input id="newsletter-email" type="email" required />
	<input id="newsletter-name" type="text" />
	<div id="newsletter-turnstile"></div>
	<p id="newsletter-error"></p>
	<button type="submit">Join</button>
</form>

<script>
	let session;
	let turnstileControl;

	async function ensureSession() {
		if (session && session.expiresAt > Date.now() + 5000) {
			return session;
		}

		session = await window.Newsletters.createSession({ listName: 'weekly' });
		turnstileControl?.remove();
		turnstileControl = await window.Newsletters.renderTurnstile('#newsletter-turnstile', {
			siteKey: session.siteKey,
		});
		return session;
	}

	document.getElementById('newsletter-form').addEventListener('submit', async (event) => {
		event.preventDefault();
		const activeSession = await ensureSession();
		const turnstileToken = turnstileControl.getToken();
		if (!turnstileToken) {
			document.getElementById('newsletter-error').textContent = 'TURNSTILE_NOT_READY';
			return;
		}

		const result = await window.Newsletters.subscribe({
			email: document.getElementById('newsletter-email').value,
			listName: 'weekly',
			personName: document.getElementById('newsletter-name').value,
			submitToken: activeSession.submitToken,
			turnstileToken,
		});

		if (!result.success) {
			document.getElementById('newsletter-error').textContent = result.error;
			turnstileControl.reset();
		}
	});
</script>
```

All three flows call `/newsletters/session`, render Turnstile explicitly, and then submit to `/subscribe`.

The working local example page is at [newsletters/examples/local-embed/index.html](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/examples/local-embed/index.html).

## Exposed API

### `GET /newsletters.js`

Returns the embeddable browser script.

Behavior:

- defines `window.Newsletters.createSession(...)`
- defines `window.Newsletters.renderTurnstile(...)`
- defines `window.Newsletters.subscribe(...)`
- defines `window.Newsletters.open(...)`
- loads Turnstile with explicit rendering
- preloads exactly one requested template when the script URL includes `?template=<name>`

### Browser SDK

#### `window.Newsletters.createSession({ action, listName })`

Bootstraps a short-lived signed submit token and returns:

- `expiresAt`
- `submitToken`
- `siteKey`

#### `window.Newsletters.renderTurnstile(container, { siteKey })`

Renders Turnstile explicitly into a selector or element and returns:

- `getToken()`
- `reset()`
- `remove()`

#### `window.Newsletters.subscribe({ ... })`

Submits one subscription payload with:

- `email`
- `hostname` optional, defaults to `window.location.hostname`
- `listName`
- `personName`
- `submitToken`
- `turnstileToken`

#### `window.Newsletters.open({ listName, personName })`

Opens a managed `<dialog>`.

- If the script URL did not include `?template=...`, the built-in dialog is used.
- If the script URL included `?template=<name>`, `open(...)` waits for that server-backed template if needed and then uses it.

### `GET /newsletters/templates/:name`

Returns one template for the browser embed flow.

Rules:

- requires `Origin`
- public templates are readable by any known hostname
- owned templates are readable only by their owning hostname
- returns `404` when the template does not exist or is not allowed for the requesting hostname

### `POST /newsletters/session`

Bootstraps a short-lived browser session for one action.

Request:

```json
{
	"action": "subscribe",
	"list_name": "weekly"
}
```

Headers:

- `Origin` is required

Response:

```json
{
	"success": true,
	"value": {
		"expiresAt": 1773144484931,
		"submitToken": "...",
		"siteKey": "..."
	}
}
```

### `POST /subscribe`

Creates or reactivates a subscription.

Headers:

- `Origin`
- `X-Submit-Token`
- `Content-Type: application/json`

Body:

```json
{
	"email": "person@example.com",
	"hostname": "softwarepatterns.com",
	"list_name": "weekly",
	"person_name": "Ada Lovelace",
	"turnstile_token": "..."
}
```

Success responses:

- `ALREADY_SUBSCRIBED`
- `SUBSCRIBED`
- `RESUBSCRIBED`

Failure responses include:

- `UNKNOWN_HOSTNAME`
- `INVALID_HOSTNAME`
- `INVALID_SESSION`
- `INVALID_TURNSTILE`
- `TURNSTILE_NOT_CONFIGURED`
- `RATE_LIMITED`

### `POST /unsubscribe`

Same protection model as `/subscribe`, but marks a record unsubscribed.

Success responses:

- `ALREADY_UNSUBSCRIBED`
- `SINK_ACCEPTED`
- `UNSUBSCRIBED`

Failure responses include:

- `INVALID_HOSTNAME`
- `INVALID_SESSION`
- `INVALID_TURNSTILE`
- `NOT_FOUND`
- `RATE_LIMITED`
- `TURNSTILE_NOT_CONFIGURED`
- `UNKNOWN_HOSTNAME`

### `POST /join` and `POST /leave`

Aliases for `/subscribe` and `/unsubscribe`.

### `GET /api/subscribers`

Returns all subscribers for the authenticated hostname.

Headers:

- `Authorization: Bearer <jwt>`

Query:

```text
hostname=softwarepatterns.com
list_name=weekly
limit=100
offset=0
```

Success response:

```json
{
	"success": true,
	"value": {
		"items": [
			{
				"id": "abc123",
				"email": "person@example.com",
				"hostname": "softwarepatterns.com",
				"list_name": "weekly",
				"person_name": "Ada Lovelace",
				"created_at": "2026-03-10T15:00:00.000Z",
				"email_confirmed_at": null,
				"unsubscribed_at": null
			}
		],
		"limit": 100,
		"offset": 0,
		"has_more": false
	}
}
```

Failure responses include:

- `UNKNOWN_HOSTNAME`
- `JWT_NOT_CONFIGURED`
- `INVALID_AUTHORIZATION`
- `INVALID_JWT`
- `RATE_LIMITED`

### `GET /api/templates`

Returns owned templates for the authenticated hostname.

Headers:

- `Authorization: Bearer <jwt>`

Query:

```text
hostname=softwarepatterns.com
```

Success response:

```json
{
	"success": true,
	"value": {
		"items": [
			{
				"name": "softwarepatterns-signup",
				"hostname": "softwarepatterns.com",
				"markup": "<form>...</form>",
				"created_at": "2026-03-11T02:00:00.000Z",
				"updated_at": "2026-03-11T02:00:00.000Z"
			}
		]
	}
}
```

### `GET /api/templates/:name`

Returns one owned template for the authenticated hostname.

### `POST /api/templates`

Creates one owned template for the authenticated hostname.

Body:

```json
{
	"hostname": "softwarepatterns.com",
	"name": "softwarepatterns-signup",
	"markup": "<form>...</form>"
}
```

### `PATCH /api/templates/:name`

Updates one owned template for the authenticated hostname.

Body:

```json
{
	"hostname": "softwarepatterns.com",
	"markup": "<form>...</form>"
}
```

### `DELETE /api/templates/:name`

Deletes one owned template for the authenticated hostname.

Rules for all `/api/templates*` routes:

- hostname owners can only CRUD their owned templates
- public templates are excluded from customer CRUD
- invalid names return `INVALID_TEMPLATE_NAME`
- invalid markup returns `INVALID_TEMPLATE_MARKUP`
- duplicate names return `ALREADY_EXISTS`

### `DELETE /api/subscribers/:id`

Hard-deletes one subscriber record for the authenticated hostname.

Headers:

- `Authorization: Bearer <jwt>`

Query:

```text
hostname=softwarepatterns.com
```

Success response:

```json
{
	"success": true,
	"value": "DELETED"
}
```

Failure responses include:

- `UNKNOWN_HOSTNAME`
- `NOT_FOUND`
- `JWT_NOT_CONFIGURED`
- `INVALID_AUTHORIZATION`
- `INVALID_JWT`
- `RATE_LIMITED`

### `GET /verify`, `GET /confirm`, `POST /confirm/send`

These endpoints are currently explicit stubs and return `EMAIL_CONFIRMATION_DISABLED`.

## Developer

### How Encryption Works

Public hostname data lives in `hostname_config`.

That table currently includes:

- `hostname`
- `jwks_url`
- `turnstile_site_key`

Secret hostname data lives in `hostname_config_secrets`, keyed by the same hostname:

- `dek_kek_id`
- `dek_wrapped`
- `turnstile_secret_key_ciphertext`

The flow is:

1. The worker loads the active KEK set from `HOSTNAME_CONFIG_KEKS_JSON`.
2. Each hostname secret row stores a DEK wrapped by one KEK.
3. The worker unwraps the DEK using `dek_kek_id`.
4. The worker uses that DEK to decrypt the rest of the row.

The implementation lives in [newsletters/src/lib/hostname-config-secrets.ts](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/src/lib/hostname-config-secrets.ts).

### Why This Works

This model keeps the trust boundaries small:

- D1 backups are safe to export because hostname secrets stay encrypted at rest.
- One worker secret can protect many hostname rows.
- KEK rotation does not require rewriting all ciphertext immediately.
- Public values such as `turnstile_site_key` stay readable in `hostname_config`.

It also scales better than one large env JSON map for hundreds of hostnames.

### Important Files

- [newsletters/src/index.ts](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/src/index.ts): worker routes
- [newsletters/src/domain/subscribers.ts](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/src/domain/subscribers.ts): subscriber list and delete logic
- [newsletters/src/domain/templates.ts](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/src/domain/templates.ts): owned template CRUD and browser template lookup rules
- [newsletters/src/db/newsletter-template-records.ts](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/src/db/newsletter-template-records.ts): template persistence helpers
- [newsletters/src/lib/embed-script.ts](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/src/lib/embed-script.ts): browser embed script
- [newsletters/examples/local-embed/index.html](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/examples/local-embed/index.html): example page showing the built-in dialog and SDK usage
- [newsletters/src/lib/service-auth.ts](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/src/lib/service-auth.ts): trusted service JWT verification via JWKS
- [newsletters/src/lib/turnstile.ts](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/src/lib/turnstile.ts): Turnstile verification
- [newsletters/src/lib/newsletter-sessions.ts](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/src/lib/newsletter-sessions.ts): signed submit-token flow
- [newsletters/scripts/sync-cloudflare-config.mjs](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/scripts/sync-cloudflare-config.mjs): Cloudflare config sync

## Tests

Run unit tests:

```zsh
npm run test:unit
```

Run local Wrangler integration tests:

```zsh
npm run test:integration:local
```

Run the full suite:

```zsh
npm test
```

Run coverage:

```zsh
npm run test:coverage
```

The integration test:

- creates a temporary local D1 database
- seeds hostname and encrypted hostname-secret rows
- seeds public server templates
- starts a temporary local JWKS server
- starts `wrangler dev`
- exercises the published example page and `/api/subscribers` HTTP flows end-to-end

## Use This As A Template

If you want your own version of this service:

1. copy the `newsletters` workspace
2. change the worker name and domain
3. generate your own KEKs
4. add your own hostname entries to encrypted config
5. run `npm run config:sync`
6. deploy

The main pieces worth reusing are:

- the embed script pattern
- the hostname allowlist model
- the signed short-lived submit-token flow
- the KEK/DEK encrypted shadow-table design

What you will probably customize first:

- dialog copy and styling
- subscription side effects
- confirmation flow
- admin/export tooling
