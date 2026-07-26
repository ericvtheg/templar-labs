# Emma & Eric Wedding

Draft wedding website and design system for Emma and Eric.

The current milestone includes a responsive homepage shell, an interactive
style board at `/style`, and Google-protected household enrollment at `/admin`.
The admin stores household contact and mailing details, named invitees, and
explicit per-person plus-one permissions. Enrolled households can be edited or
removed. It does not yet include guest-facing RSVP responses or invented
personal content.

```sh
pnpm --filter emma-eric-wedding dev
```

The `/admin` route authenticates through the local Templar Auth service on port `5181`, so run
`pnpm --filter templar-auth dev` alongside Emma when testing the complete local sign-in flow.
Emma does not receive Google credentials, maintain canonical identity tables, or create local user
rows. It uses the database-free `createTemplarAuthApp` integration. Admin access comes from the
centrally signed global `admin` claim, and no sign-in UI is shown outside `/admin`.

The production target is `emmaand.ericventor.com`. The draft is marked
`noindex` and disallowed by `robots.txt` while privacy and guest access are still
being designed.
