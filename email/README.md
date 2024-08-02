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
    "to": [{
      "email": "recipient@example.com"
    }],
    "from": {
      "email": "sender@example.com"
    },
    "subject": "Test Email",
    "content": [{
      "type": "text/plain",
      "value": "This is a test email sent from curl."
    }]
  }'
```

## Testing

Create a fake local dkim private key:

```bash
openssl genpkey -algorithm RSA -out dkim_private.key -pkeyopt rsa_keygen_bits:2048
```

```bash
openssl rsa -in dkim_private.key -pubout -out dkim_public.key
```

```bash
cat dkim_public.key | sed '1d;$d' | tr -d '\n'
```

## DKIM

```bash
PRIVATE_KEY=$(cat dkim_private.key | sed '1d;$d' | tr -d '\n' | sed 's/"/\\"/g')

JSON_PAYLOAD=$(printf '{
  "dkim_private_key": "%s",
  "dkim_selector": "test",
  "dkim_domain": "example.com"
}' "$PRIVATE_KEY")

curl -X PUT http://localhost:8787/dkim-configs/example.com \
  -H "Authorization: key1" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8787" \
  -d "$JSON_PAYLOAD"
```

```bash
curl -X GET http://localhost:8787/logs/ \
  -H "Authorization: key1" \
	-H "Origin: http://localhost:8787"
```

## Production

```bash
curl -X GET https://email-prod.softwarepatterns.workers.dev/logs/ \
  -H "Authorization: key1" \
	-H "Origin: http://localhost:8787"
```
