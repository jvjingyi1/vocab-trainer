# Vocab Trainer

A single-user English vocabulary trainer with spaced repetition.

- Works in any modern browser (desktop and mobile).
- Data lives in Supabase, so every device sees the same list.
- Definitions are fetched from Youdao's public dictionary endpoints.
- Access is gated by a passphrase checked in Postgres (row-level security).

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell and markup |
| `style.css` | Styling |
| `api.js` | Supabase client, passphrase unlock |
| `store.js` | Word CRUD and the spaced-repetition rules |
| `dict.js` | Dictionary lookup over JSONP |
| `app.js` | UI logic and the review flow |

## Notes

The `anon` key in `api.js` is public by design; it grants nothing on its own.
Every request also carries an `x-app-key` header holding the SHA-256 of the
passphrase, and the database policies reject anything that does not match.

Scheduling: a word answered "Got it" leaves the current day's queue and moves up
one box (10 min, 1 d, 3 d, 7 d, 16 d, 35 d). "Not yet" returns it to the end of
today's queue.
