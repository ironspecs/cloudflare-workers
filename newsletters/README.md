# Newsletters

`newsletters` is a hosted signup service for approved websites, backed by one Cloudflare Worker.

It is useful because it gives sites a simple newsletter signup flow without each site having to rebuild bot protection, hostname checks, and subscriber management.

## Integration

Use the starter template:

```html
<script src="https://newsletters.softwarepatterns.workers.dev/newsletters.js?template=starter" defer></script>

<button id="newsletter-signup">Subscribe</button>

<script>
	document.getElementById('newsletter-signup').addEventListener('click', () => {
		window.Newsletters.open({ listName: 'weekly' });
	});
</script>
```

Use the DaisyUI template instead:

```html
<script src="https://newsletters.softwarepatterns.workers.dev/newsletters.js?template=daisyui" defer></script>

<button id="newsletter-signup">Subscribe</button>

<script>
	document.getElementById('newsletter-signup').addEventListener('click', () => {
		window.Newsletters.open({ listName: 'weekly' });
	});
</script>
```

The script is deferred and the template is loaded lazily, so there is no meaningful page-load penalty from adding it to your site.

If the built-in templates are not enough, you can upload your own custom templates and use them the same way. Public templates are available to all approved hostnames, while owned templates belong only to the hostname that created them.

## Deep Integration

If you want to own the UI yourself, you can use the browser API directly:

```html
<script src="https://newsletters.softwarepatterns.workers.dev/newsletters.js" defer></script>
<form id="newsletter-form">
	<input id="newsletter-email" type="email" required />
	<div id="newsletter-turnstile"></div>
	<button type="submit">Join</button>
</form>

<script>
	let session;
	let turnstileControl;

	document.getElementById('newsletter-form').addEventListener('submit', async (event) => {
		event.preventDefault();

		session = await window.Newsletters.createSession({ listName: 'weekly' });
		turnstileControl?.remove();
		turnstileControl = await window.Newsletters.renderTurnstile('#newsletter-turnstile', {
			siteKey: session.siteKey,
		});

		const result = await window.Newsletters.subscribe({
			email: document.getElementById('newsletter-email').value,
			listName: 'weekly',
			submitToken: session.submitToken,
			turnstileToken: turnstileControl.getToken(),
		});

		console.log(result);
	});
</script>
```

## Subscribers

You can fetch the full subscriber list for a hostname at any time through the backend API.

## Backend Auth

Any backend call uses JWT auth. The worker verifies the bearer token against the configured `jwks_url` for that hostname before allowing protected API access.
