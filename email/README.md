# Transactional Email API

This API will send transactional emails, usually in response to another service.

If an email fails to send, it will put it into a deadletter queue and try again later.

Access to the service is governed by either environmental API keys or the API key service.
