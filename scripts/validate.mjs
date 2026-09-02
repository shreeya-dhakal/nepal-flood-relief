#!/usr/bin/env node
/**
 * Validates every file in data/ before it can be merged.
 *
 * The site renders this data directly, so a bad merge is a bad page. The site
 * parses defensively (missing fields fall back), which means the checks that
 * matter here are the ones a lenient parser would silently paper over: a
 * figure with no source, a date that is not a date, a link that is not a link.
 *
 *   node scripts/validate.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../data');
const errors = [];
const warnings = [];

const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

const read = (name) => {
  try {
    return JSON.parse(readFileSync(`${DATA}/${name}.json`, 'utf8'));
  } catch (e) {
    err(`${name}.json`, `not valid JSON — ${e.message}`);
    return null;
  }
};

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(v));

const isUrl = (v) => {
  if (typeof v !== 'string' || v === '') return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

/* A figure is only allowed to carry a number if it carries a source too. */
function checkFigure(file, path, fig) {
  if (fig == null || typeof fig !== 'object') return err(file, `${path} missing`);
  if (fig.amount !== null) {
    if (typeof fig.amount !== 'number' || fig.amount < 0) {
      err(file, `${path}.amount must be a non-negative number or null`);
    }
    if (!isUrl(fig.source_url)) {
      err(file, `${path}.amount is set but ${path}.source_url is not a link — an unsourced number does not go on the page`);
    }
    if (!isDate(fig.as_of)) {
      err(file, `${path}.amount is set but ${path}.as_of is not a YYYY-MM-DD date`);
    }
  }
}

/* ── meta ── */
const meta = read('meta');
if (meta) {
  if (!meta.event) err('meta.json', 'event is empty');
  if (!['active', 'recovery', 'archived'].includes(meta.status)) {
    err('meta.json', 'status must be active, recovery or archived');
  }
}

/* ── fund ── */
const fund = read('fund');
if (fund) {
  checkFigure('fund.json', 'received', fund.received);
  checkFigure('fund.json', 'dispatched', fund.dispatched);
  const r = fund.received?.amount;
  const d = fund.dispatched?.amount;
  if (typeof r === 'number' && typeof d === 'number' && d > r) {
    warn('fund.json', `dispatched (${d}) is larger than received (${r}) — possible, but double-check the sources`);
  }
  for (const [i, h] of (fund.history ?? []).entries()) {
    if (!isDate(h.date)) err('fund.json', `history[${i}].date is not a YYYY-MM-DD date`);
  }
}

/* ── dispatches ── */
const dispatches = read('dispatches');
if (dispatches) {
  for (const [i, d] of (dispatches.entries ?? []).entries()) {
    const at = `entries[${i}]`;
    if (!isDate(d.date)) err('dispatches.json', `${at}.date is not a YYYY-MM-DD date`);
    if (d.amount !== null && (typeof d.amount !== 'number' || d.amount < 0)) {
      err('dispatches.json', `${at}.amount must be a non-negative number or null`);
    }
    if (!d.source_url) {
      warn('dispatches.json', `${at} has no source_url — it will show as UNSOURCED on the page`);
    } else if (!isUrl(d.source_url)) {
      err('dispatches.json', `${at}.source_url is not a link`);
    }
    if (d.verified === true && !isUrl(d.source_url)) {
      err('dispatches.json', `${at} is marked verified but has no source link`);
    }
  }
}

/* ── resources ── */
const KINDS = ['tracker', 'fundraiser', 'relief-effort', 'dataset', 'map', 'news', 'other'];
const resources = read('resources');
if (resources) {
  const seen = new Map();
  for (const [i, r] of (resources.items ?? []).entries()) {
    const at = `items[${i}]`;
    if (!r.title) err('resources.json', `${at}.title is empty`);
    if (!isUrl(r.url)) err('resources.json', `${at}.url is not a link`);
    if (!KINDS.includes(r.kind)) {
      err('resources.json', `${at}.kind must be one of: ${KINDS.join(', ')}`);
    }
    if (r.added && !isDate(r.added)) {
      err('resources.json', `${at}.added is not a YYYY-MM-DD date`);
    }
    const key = String(r.url).replace(/\/+$/, '').toLowerCase();
    if (seen.has(key)) {
      warn('resources.json', `${at}.url duplicates items[${seen.get(key)}]`);
    } else {
      seen.set(key, i);
    }
  }
}

/* ── channels ── */
const channels = read('channels');
if (channels) {
  for (const [i, c] of (channels.items ?? []).entries()) {
    const at = `items[${i}]`;
    if (!c.name) err('channels.json', `${at}.name is empty`);
    if (!['domestic', 'international'].includes(c.scope)) {
      err('channels.json', `${at}.scope must be domestic or international`);
    }
    if (c.url && !isUrl(c.url)) err('channels.json', `${at}.url is not a link`);
    /* The highest-stakes rule in the repo: a "verified" set of bank details
       that nobody actually checked is how people get robbed. */
    if (c.verified === true && !isUrl(c.url)) {
      err('channels.json', `${at} is marked verified but has no official page to check it against`);
    }
    if (c.verified === true && (c.details ?? []).some((d) => !d.value)) {
      err('channels.json', `${at} is marked verified but has blank details`);
    }
  }
}

/* ── helplines ── */
const helplines = read('helplines');
if (helplines) {
  for (const [i, h] of (helplines.items ?? []).entries()) {
    if (!h.name) err('helplines.json', `items[${i}].name is empty`);
    if (h.number && !/^[\d+\-\s()]+$/.test(h.number)) {
      err('helplines.json', `items[${i}].number has characters that are not a phone number`);
    }
  }
}

/* ── impact ── */
/* Casualty and damage counts follow the same rule as money: a number the
   reader might repeat onward has to carry the link it came from. */
const impact = read('impact');
if (impact) {
  if (impact.as_of !== null && !isDate(impact.as_of)) {
    err('impact.json', 'as_of must be null or a YYYY-MM-DD date');
  }
  for (const group of ['human', 'infrastructure']) {
    for (const [i, c] of (impact[group] ?? []).entries()) {
      const at = `${group}[${i}]`;
      if (!c.label && !c.info) {
        err('impact.json', `${at} needs a label (with value) or an info statement`);
      }
      /* `info` carries a figure in prose ("Over 1,000 killed"), so it is held
         to the same sourcing rule as a numeric value — the field name does
         not change what a reader will repeat onward. */
      if (c.info && !isUrl(c.source_url) && !isUrl(impact.source_url)) {
        err('impact.json', `${at}.info states a figure but neither it nor the file has a source_url`);
      }
      if (c.info && !isDate(c.as_of) && !isDate(impact.as_of)) {
        err('impact.json', `${at}.info states a figure but there is no as_of date on it or the file`);
      }
      if (c.value !== null && c.value !== undefined) {
        if (typeof c.value !== 'number' || c.value < 0) {
          err('impact.json', `${at}.value must be a non-negative number or null`);
        }
        if (!isUrl(c.source_url) && !isUrl(impact.source_url)) {
          err('impact.json', `${at}.value is set but neither it nor the file has a source_url — a casualty figure does not go on the page unsourced`);
        }
        if (!isDate(c.as_of) && !isDate(impact.as_of)) {
          err('impact.json', `${at}.value is set but there is no as_of date on it or the file — these figures are revised constantly`);
        }
      }
    }
  }
}

/* ── claims ── */
const CLAIM_STATUS = ['true', 'false', 'misleading', 'unverified'];
const claims = read('claims');
if (claims) {
  if (claims.as_of !== null && !isDate(claims.as_of)) {
    err('claims.json', 'as_of must be null or a YYYY-MM-DD date');
  }
  for (const [i, c] of (claims.entries ?? []).entries()) {
    const at = `entries[${i}]`;
    if (!c.claim) err('claims.json', `${at}.claim is empty`);
    if (!CLAIM_STATUS.includes(c.status)) {
      err('claims.json', `${at}.status must be one of: ${CLAIM_STATUS.join(', ')}`);
    }
    if (c.first_seen && !isDate(c.first_seen)) {
      err('claims.json', `${at}.first_seen is not a YYYY-MM-DD date`);
    }
    if (c.source_url && !isUrl(c.source_url)) {
      err('claims.json', `${at}.source_url is not a link`);
    }
    /* The site downgrades these to UNVERIFIED rather than showing them, so
       this is a warning, not an error — but it means the entry does nothing. */
    if (c.status !== 'unverified' && !isUrl(c.source_url)) {
      warn('claims.json', `${at} claims a verdict of "${c.status}" with no source_url — the page will show it as UNVERIFIED`);
    }
    if (c.status !== 'unverified' && !c.verdict) {
      warn('claims.json', `${at} has a verdict of "${c.status}" but no verdict text explaining it`);
    }
  }
}

/* ── notices ── */
const notices = read('notices');
if (notices) {
  for (const [i, n] of (notices.items ?? []).entries()) {
    const at = `items[${i}]`;
    if (!n.title) err('notices.json', `${at}.title is empty`);
    if (!isUrl(n.url)) err('notices.json', `${at}.url is not a link`);
    if (n.published && !isDate(n.published)) {
      err('notices.json', `${at}.published is not a YYYY-MM-DD date`);
    }
    /* The OFFICIAL badge is a trust signal; the site re-checks the host, but
       catching it here means the badge never gets committed wrongly. */
    if (n.official === true) {
      let host = '';
      try {
        host = new URL(n.url).hostname;
      } catch {
        /* url error already reported above */
      }
      if (host && !/(^|\.)gov\.np$/.test(host)) {
        err('notices.json', `${at} is marked official but ${host} is not a gov.np domain`);
      }
    }
  }
}

/* ── report ── */
for (const w of warnings) console.log(`  warning  ${w}`);
for (const e of errors) console.error(`  error    ${e}`);

if (errors.length) {
  console.error(`\n${errors.length} error(s). Nothing merges until these are fixed.`);
  process.exit(1);
}
console.log(`\nAll data valid${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
