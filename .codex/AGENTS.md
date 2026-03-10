# Repo Notes

This repository is public.

It serves two purposes at the same time:

- It is a customer-facing example of clean Cloudflare Worker code.
- It is production code that will be deployed to Cloudflare.

Constraints:

- Prefer clear, unsurprising, production-safe implementations.
- Do not introduce sketchy shortcuts, hidden behavior, or demo-only hacks.
- Treat documentation, examples, and code structure as customer-visible artifacts.
- Do not commit plaintext credentials or secrets.
- Store repo credentials and sensitive config with SOPS.
