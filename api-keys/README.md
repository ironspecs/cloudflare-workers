# API Keys via Cloudflare Worker

The API Keys API allows you to create, update, and delete API keys, designed to be limit access to other APIs.

The GET endpoint is public.

The PUT and DELETE endpoints are protected by one or more secret keys that can be rotated.

## Example 1: Create, Get, and Delete an API key

```bash
wrangler dev
```

```bash
curl -X PUT "http://localhost:8787/api-keys/aaaaaaaaaaa" \
     -H "Authorization: key1" \
     -H "Content-Type: application/json" \
     -H "Origin: http://localhost:8787" \
     -d '{"tenantId": "aaaaaaaaaaa", "expires": 0, "policies": []}'

OK%
```

```bash
curl -X GET "http://localhost:8787/api-keys/aaaaaaaaaaa" \
     -H "Origin: http://localhost:8787"

{"tenantId":"aaaaaaaaaaa","expires":0,"policies":[],"key":"aaaaaaaaaaa"}%
```

```bash
curl -X DELETE "http://localhost:8787/api-keys/aaaaaaaaaaa" \
     -H "Authorization: key1" \
     -H "Origin: http://localhost:8787"

OK%
```

### Example 2: Browser

```js
fetch('/api-keys/aaaaaaaaaaa', {
	method: 'PUT',
	body: '{ "tenantId": "aaaaaaaaaaa", "expires": 0, "policies": [] }',
	headers: { Authorization: 'key1', 'Content-type': 'application/json' },
}).then(
	async (r) => {
		console.info('info', r);
		const body = await r.text();
		console.log('body', body);
		document.body.innerHTML = body;
	},
	(e) => {
		console.error('error', e);
	},
);
```

```js
fetch('/api-keys/aaaaaaaaaaa', {
	method: 'GET',
}).then(
	async (r) => {
		console.info('info', r);
		const body = await r.text();
		console.log('body', body);
		document.body.innerHTML = body;
	},
	(e) => {
		console.error('error', e);
	},
);
```

```js
fetch('/api-keys/aaaaaaaaaaa', {
	method: 'DELETE',
	headers: { Authorization: 'key1' },
}).then(
	async (r) => {
		console.info('info', r);
		const body = await r.text();
		console.log('body', body);
		document.body.innerHTML = body;
	},
	(e) => {
		console.error('error', e);
	},
);
```
