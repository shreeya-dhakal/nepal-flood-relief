# nepal-flood-relief

Crowdsourced data behind the flood relief tracker at
**[icodeformybhasa.com/nepal-floods](https://icodeformybhasa.com/nepal-floods)**.

Everything on that page is rendered from the JSON files in [`data/`](data/).
There is no database and no CMS. Edit a file here, get it merged, and the page
picks it up within about five minutes — no site deploy needed.

## The one rule

**A number without a source does not go on the page.** Not "we'll add the link
later", not "everyone is saying it". Every figure carries the link it came
from, and CI rejects the ones that don't. This is a page about money during a
disaster; the moment it starts carrying unsourced claims it is worse than
nothing.

The same goes for bank details: a channel can only be marked `"verified": true`
if it links to the organisation's own page or an official notice where you can
check the account against.

## Files

| File | What it holds |
| --- | --- |
| `data/meta.json` | Event name, status, the standing summary and disclaimer |
| `data/fund.json` | The two headline numbers — received into and dispatched from the PM Disaster Relief Fund |
| `data/dispatches.json` | Itemised releases from the fund: date, amount, district, purpose, source |
| `data/channels.json` | Verified ways to donate, domestic and international |
| `data/resources.json` | Other people's trackers, spreadsheets, fundraisers and relief efforts |
| `data/needs.json` | What responders say they need — and what they are asking people to stop sending |
| `data/helplines.json` | Emergency numbers |
| `data/updates.json` | Changelog shown at the bottom of the page |

They are separate files so that two people fixing two different things at the
same time do not collide in a merge.

## How to contribute

**The quick way.** [Open an
issue](https://github.com/shreeya-dhakal/nepal-flood-relief/issues/new/choose)
with the link or the figure. There are forms for adding a link and updating a
figure; somebody will turn it into a pull request.

**The direct way.** Edit the file on GitHub (the pencil icon), which opens a
pull request for you. Every section of the site links straight to the file it
renders, so "that number is wrong" and "here is the fix" are the same click.

Before you open a PR:

```sh
node scripts/validate.mjs
```

No install step — it needs nothing but Node 22+. The same check runs on every
pull request, and a failure means the page would have shown something wrong.

## Conventions

- **Dates** are `YYYY-MM-DD`. Always. They render localised.
- **Amounts** are plain numbers in the smallest sensible unit, no commas, no
  currency symbol, no `"Rs"` — `12345678`, not `"Rs 1,23,45,678"`. The site
  formats them in lakh/crore grouping.
- **`verified`** means a human checked it against the linked source. It starts
  `false` and that is fine — the page labels unverified entries honestly rather
  than hiding them.
- **`*_ne` fields** are the Nepali translation of the field next to them. Leave
  them `""` if you cannot translate; the page falls back to English. Filling
  them in is one of the most useful things you can do here.
- **Append, don't reorder.** The site sorts by date. Add new entries at the end
  of the array so diffs stay readable.

## Licence

Data is [CC0](LICENSE) — public domain. Mirror it, fork it, build a better page
with it.
