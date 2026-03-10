# Newsletters

`newsletters` is a Cloudflare Worker for collecting newsletter signups from approved hostnames. It serves an embeddable browser script, opens a Turnstile-protected signup dialog, validates the request against a known hostname, and stores subscriptions in D1.

## Why This Exists

This service exists so multiple websites can share one newsletter signup backend without each site re-implementing:

- hostname allowlisting
- CSRF protection for cross-site embeds
- bot protection with Turnstile
- short-lived session bootstrapping
- rate limiting
- encrypted per-hostname secret storage

The goal is a small public codebase that is understandable enough to copy, but strict enough to run in production.

## Hook It Up To A Website

These are the steps to connect a site such as `softwarepatterns.com`.

### 1. Add the hostname to encrypted config

`config-enc.yaml` stores:

- KEKs under `keks`
- per-hostname Turnstile config under `turnstile.hostnames`

Example shape:

```yaml
keks:
  active_id: kek202603101850
  keys:
    kek202603101850: <base64-encoded-32-byte-key>

turnstile:
  hostnames:
    softwarepatterns.com:
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

### 5. Open the dialog from your page

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

The dialog script calls `/newsletters/session`, renders Turnstile explicitly, and then submits to `/subscribe`.

## Exposed API

### `GET /newsletters.js`

Returns the embeddable browser script.

Behavior:

- defines `window.Newsletters.open(...)`
- loads Turnstile with explicit rendering
- opens a native `<dialog>`

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
		"csrfToken": "...",
		"expiresAt": 1773144484931,
		"sessionId": "...",
		"siteKey": "..."
	}
}
```

### `POST /subscribe`

Creates or reactivates a subscription.

Headers:

- `Origin`
- `X-CSRF-Token`
- `X-Session-Id`
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

- `SUBSCRIBED`
- `RESUBSCRIBED`

Failure responses include:

- `UNKNOWN_HOSTNAME`
- `INVALID_HOSTNAME`
- `INVALID_SESSION`
- `INVALID_TURNSTILE`
- `TURNSTILE_NOT_CONFIGURED`
- `ALREADY_SUBSCRIBED`
- `RATE_LIMITED`

### `POST /unsubscribe`

Same protection model as `/subscribe`, but marks a record unsubscribed.

### `POST /join` and `POST /leave`

Aliases for `/subscribe` and `/unsubscribe`.

### `GET /verify`, `GET /confirm`, `POST /confirm/send`

These endpoints are currently explicit stubs and return `EMAIL_CONFIRMATION_DISABLED`.

## Developer

### How Encryption Works

Public hostname data lives in `hostname_config`.

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
- [newsletters/src/lib/embed-script.ts](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/src/lib/embed-script.ts): browser embed script
- [newsletters/src/lib/turnstile.ts](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/src/lib/turnstile.ts): Turnstile verification
- [newsletters/src/lib/newsletter-sessions.ts](/Users/dane/Projects/ironspecs/cloudflare-workers/newsletters/src/lib/newsletter-sessions.ts): KV-backed session flow
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
- starts `wrangler dev`
- exercises the real HTTP flow end-to-end

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
- the KV-backed short-lived session flow
- the KEK/DEK encrypted shadow-table design

What you will probably customize first:

- dialog copy and styling
- subscription side effects
- confirmation flow
- admin/export tooling
