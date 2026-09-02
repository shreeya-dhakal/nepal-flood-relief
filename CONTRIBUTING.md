# Contributing

## What gets accepted

A change lands if someone can follow the link and see the same thing you saw.
That is the whole bar, and it applies to figures, bank details, and links to
other people's work alike.

Sources, roughly best to worst:

1. An official government notice, or the organisation's own site.
2. A named report from an established newsroom.
3. A post from an organisation's own verified account.
4. A screenshot with no link — **not enough on its own.** Open an issue with it
   and someone will try to find the original.

## Adding a link to someone else's work

Say who runs it. A tracker maintained by a group that has been doing this for
years and one started yesterday by an anonymous account are both listable, but
they are not the same thing, and the `verified` flag is how the page says so.

Do not add:

- Fundraisers with no named organiser and no way to see what was spent.
- Aggregators that are just a copy of this page or of each other.
- Anything asking for wallet transfers or bank details over direct message.

## Adding a dispatch

One row per release, with as much as you can get:

```json
{
  "date": "2026-09-04",
  "amount": 5000000,
  "currency": "NPR",
  "district": "Sindhupalchok",
  "recipient": "District Disaster Management Committee",
  "purpose": "Tarpaulins and water purification for 400 households",
  "source_url": "https://...",
  "verified": true
}
```

`purpose` is the field people actually read. "Relief materials" tells nobody
anything; "tarpaulins and water purification for 400 households" does.

## Correcting something

Corrections are the point of this repo, not an inconvenience. Open a PR with
the fix and the source, or an issue if you would rather someone else did the
editing. If a number here is wrong, please say so even if you cannot prove the
right one — an unsourced number being removed is an improvement.

## Adding Nepali

Every user-facing string has a `*_ne` sibling. If you can translate helplines
and the needs list, do those first — they are the fields most likely to be read
by someone actually in the flood.

## Running the checks

```sh
node scripts/validate.mjs
```

Errors block the merge. Warnings are worth reading but will not stop you.
