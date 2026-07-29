# Your Shopper

Your Shopper is the first dogfood application for `@templar/api-auth`. Its deliberately small
product surface proves one complete workflow:

1. Sign in through the shared Templar authentication service.
2. Create an app-local API key from the authenticated UI.
3. Call `GET /api/v1/hello` with the key as a Bearer credential.
4. Receive `{ "message": "hello world" }` for a valid key.
5. Revoke the key and observe subsequent requests return `401`.

The app has no shopper domain behavior yet. Its purpose is to exercise API credential issuance and
request authentication end to end.
