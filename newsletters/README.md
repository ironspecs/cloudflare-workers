# Newsletters

`newsletters` is a hosted signup service for approved websites, backed by one Cloudflare Worker.

It is useful because it gives sites a simple newsletter signup flow without each site having to rebuild bot protection, hostname checks, and subscriber management.

## Integration

Use the starter template with one inline bootstrap snippet:

```html
<script>
	!(function (w, d, u) {
		if (w.Newsletters) return;
		function open(o) {
			open.q.push(o);
		}
		open.q = [];
		w.Newsletters = { open: open };
		var s = d.createElement('script');
		s.src = u;
		s.defer = true;
		d.head.appendChild(s);
	})(window, document, 'https://newsletters.softwarepatterns.workers.dev/newsletters.js?template=starter');
</script>

<button id="newsletter-signup" type="button">Subscribe</button>

<script>
	document.getElementById('newsletter-signup').addEventListener('click', () => {
		window.Newsletters.open({ listName: 'weekly' });
	});
</script>
```

Use the DaisyUI template instead:

```html
<script>
	!(function (w, d, u) {
		if (w.Newsletters) return;
		function open(o) {
			open.q.push(o);
		}
		open.q = [];
		w.Newsletters = { open: open };
		var s = d.createElement('script');
		s.src = u;
		s.defer = true;
		d.head.appendChild(s);
	})(window, document, 'https://newsletters.softwarepatterns.workers.dev/newsletters.js?template=daisyui');
</script>
```

The snippet defines `window.Newsletters.open()` immediately, queues calls made before the real script loads, and then hands them off once `newsletters.js` is ready. The real script still loads lazily, so there is no meaningful page-load penalty from adding it to your site.

If the built-in templates are not enough, you can upload your own custom template and use it the same way by changing the `template=` value in the script URL. For demos, add `&mode=demo` to the script URL so the worker uses the Cloudflare Turnstile test key and sink behavior.

## Public Template Development

Public templates are authored in Liquid under `templates/public/<name>/` and rendered into HTML during sync.

Useful commands:

```sh
npm run template:render -- starter
npm run template:check
npm run template:sync -- starter
```

Template source is split into:

- `templates/public/<name>/template.liquid`
- `templates/public/<name>/data.json`
- shared partials under `templates/partials/`

The sync path validates the rendered HTML before it is written to D1, so invalid public templates fail fast instead of shipping broken markup.

## Deep Integration

If you want to own the UI yourself, keep the same bootstrap pattern and use the browser API directly:

```html
<script src="https://newsletters.softwarepatterns.workers.dev/newsletters.js" defer></script>

<form id="newsletter-form">
	<input id="newsletter-email" type="email" required />
	<div id="newsletter-turnstile"></div>
	<button type="submit">Join</button>
</form>

<script>
	document.getElementById('newsletter-form').addEventListener('submit', async (event) => {
		event.preventDefault();

		const session = await window.Newsletters.createSession({ listName: 'weekly' });
		const turnstile = await window.Newsletters.renderTurnstile('#newsletter-turnstile', {
			siteKey: session.siteKey,
		});

		const result = await window.Newsletters.subscribe({
			email: document.getElementById('newsletter-email').value,
			listName: 'weekly',
			submitToken: session.submitToken,
			turnstileToken: turnstile.getToken(),
		});

		console.log(result);
	});
</script>
```

## Subscribers

You can fetch the full subscriber list for a hostname at any time through the backend API.

## Backend Auth

Any backend call uses JWT auth. The worker verifies the bearer token against the configured `jwks_url` for that hostname before allowing protected API access.
