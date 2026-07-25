# Emma & Eric Wedding

Draft wedding website and design system for Emma and Eric.

The current milestone includes a responsive homepage shell, an interactive
style board at `/style`, and a Google-protected administration shell at
`/admin`. It intentionally does not include guest data, RSVP persistence, or
invented personal content.

```sh
pnpm --filter emma-eric-wedding dev
```

Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to the workspace-root `.env`
file alongside `TEMPLAR_AUTH_SECRET`. Create a Google OAuth client with the
**Web application** type and register both redirect URIs:

```txt
http://localhost:5180/api/auth/callback/google
https://emmaand.ericventor.com/api/auth/callback/google
```

Set the Google OAuth app's audience to **External** and publish it **In
production**. Publishing the OAuth consent screen does not make the admin page
public; the application still enforces its own email allowlist. Restart the dev
process after changing `.env`; environment changes are not picked up by the
running watcher.

Only `ericandemma2027@gmail.com` is allowed to create an account or open the
admin page. No sign-in UI is shown outside `/admin`.

The production target is `emmaand.ericventor.com`. The draft is marked
`noindex` and disallowed by `robots.txt` while privacy and guest access are still
being designed.
