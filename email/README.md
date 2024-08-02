# Transactional Email API

This API will send transactional emails, usually in response to another service.

If an email fails to send, it will put it into a deadletter queue and try again later.

Access to the service is governed by either environmental API keys or the API key service.

```bash
curl -X POST http://localhost:8787/send-email \
  -H "Authorization: key1" \
  -H "Content-Type: application/json" \
	-H "Origin: http://localhost:8787" \
  -d '{
    "to": {
      "email": "recipient@example.com"
    },
    "from": {
      "email": "sender@example.com"
    },
    "subject": "Test Email",
    "content": {
      "type": "text/plain",
      "value": "This is a test email sent from curl."
    }
  }'
```
