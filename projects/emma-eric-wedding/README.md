# Emma & Eric Wedding

Draft wedding website and design system for Emma and Eric.

The current milestone includes a responsive homepage shell, an interactive
style board at `/style`, and a Google-protected administration shell at
`/admin`. It intentionally does not include guest data, RSVP persistence, or
invented personal content.

```sh
pnpm --filter emma-eric-wedding dev
```

The admin deployment needs `TEMPLAR_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and
`GOOGLE_CLIENT_SECRET`. Register this Google OAuth redirect URI:

```txt
https://emmaand.ericventor.com/api/auth/callback/google
```

Only `ericandemma2027@gmail.com` is allowed to create an account or open the
admin page. No sign-in UI is shown outside `/admin`.

The production target is `emmaand.ericventor.com`. The draft is marked
`noindex` and disallowed by `robots.txt` while privacy and guest access are still
being designed.
