# Cloudflare Workers

Cloudflare Workers run JavaScript in a V8 environment. They are a serverless platform that allows you to run code at the edge of Cloudflare's network. This means that you can run code in 200+ cities around the world. This is great for low latency applications. It also means that you can run code without having to manage servers. This is great for low cost applications.

## Projects

- [api-keys](./api-keys)
- [static-sites](./static-sites)

## Testing

Run wrangler dev to test locally.

```zsh
npx wrangler dev
```

## Deploy to production

Run wrangler publish to deploy to Cloudflare.

```zsh
npx wrangler deploy -e prod
```
