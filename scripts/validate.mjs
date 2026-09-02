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

/* Date.parse is lenient about impossible days — '2026-02-31' parses happily
   and silently becomes March 3 — so round-trip the string and require the
   same calendar day back out. */
const isDate = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v;
};

/* Every date here dates a claim about something that already happened, so one
   in the future is a typo, not a fact. CI runs in UTC and most contributors
   are at UTC+5:45, so allow a day of slack rather than failing a file that was
   correct when it was written. Safe to call on anything: a value that is not a
   date is somebody else's error to report. */
const HORIZON = Date.now() + 24 * 60 * 60 * 1000;
const checkFuture = (file, path, v) => {
  if (isDate(v) && Date.parse(`${v}T00:00:00Z`) > HORIZON) {
    err(file, `${path} is ${v}, which is in the future`);
  }
};

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
    checkFuture(file, `${path}.as_of`, fig.as_of);
  }
}

/* ── meta ── */
const meta = read('meta');
if (meta) {
  if (!meta.event) err('meta.json', 'event is empty');
  if (!['active', 'recovery', 'archived'].includes(meta.status)) {
    err('meta.json', 'status must be active, recovery or archived');
  }
  /* This is the date stamped on the whole page, so it is not optional. */
  if (!isDate(meta.as_of)) err('meta.json', 'as_of is not a YYYY-MM-DD date');
  checkFuture('meta.json', 'as_of', meta.as_of);
}

/* ── fund ── */
const fund = read('fund');
if (fund) {
  checkFigure('fund.json', 'received', fund.received);
  checkFigure('fund.json', 'dispatched', fund.dispatched);
  if (fund.recovery_estimate) checkFigure('fund.json', 'recovery_estimate', fund.recovery_estimate);
  const r = fund.received?.amount;
  const d = fund.dispatched?.amount;
  if (typeof r === 'number' && typeof d === 'number' && d > r) {
    warn('fund.json', `dispatched (${d}) is larger than received (${r}) — possible, but double-check the sources`);
  }
  /* A history row is a figure like any other — it is what the chart draws —
     so the numbers on it carry the same rule as the headline ones. */
  for (const [i, h] of (fund.history ?? []).entries()) {
    const at = `history[${i}]`;
    if (!isDate(h.date)) err('fund.json', `${at}.date is not a YYYY-MM-DD date`);
    checkFuture('fund.json', `${at}.date`, h.date);
    let carriesFigure = false;
    for (const field of ['received', 'dispatched']) {
      if (h[field] === null || h[field] === undefined) continue;
      carriesFigure = true;
      if (typeof h[field] !== 'number' || h[field] < 0) {
        err('fund.json', `${at}.${field} must be a non-negative number or null`);
      }
    }
    if (carriesFigure && !isUrl(h.source_url)) {
      err('fund.json', `${at} carries a figure but ${at}.source_url is not a link`);
    }
  }
}

/* ── dispatches ── */
const dispatches = read('dispatches');
if (dispatches) {
  for (const [i, d] of (dispatches.entries ?? []).entries()) {
    const at = `entries[${i}]`;
    if (!isDate(d.date)) err('dispatches.json', `${at}.date is not a YYYY-MM-DD date`);
    checkFuture('dispatches.json', `${at}.date`, d.date);
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
    checkFuture('resources.json', `${at}.added`, r.added);
    const key = String(r.url).replace(/\/+$/, '').toLowerCase();
    if (seen.has(key)) {
      warn('resources.json', `${at}.url duplicates items[${seen.get(key)}]`);
    } else {
      seen.set(key, i);
    }
  }
}

/* ── helplines ── */
const helplines = read('helplines');
if (helplines) {
  for (const [i, h] of (helplines.items ?? []).entries()) {
    const at = `items[${i}]`;
    if (!h.name) err('helplines.json', `${at}.name is empty`);
    if (!h.number) {
      warn('helplines.json', `${at} has no number — there is nothing here to call`);
    } else if (!/^[\d+\-\s()]+$/.test(h.number)) {
      err('helplines.json', `${at}.number has characters that are not a phone number`);
    } else if ((h.number.match(/\d/g) ?? []).length < 3) {
      err('helplines.json', `${at}.number does not have enough digits to be one`);
    }
    if (h.source_url && !isUrl(h.source_url)) {
      err('helplines.json', `${at}.source_url is not a link`);
    }
    /* "verified" has to mean somebody checked a real number, not that
       somebody ticked the box on an empty field. */
    if (h.verified === true && !h.number) {
      err('helplines.json', `${at} is marked verified but has no number`);
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
  checkFuture('impact.json', 'as_of', impact.as_of);
  for (const group of ['human', 'infrastructure']) {
    for (const [i, c] of (impact[group] ?? []).entries()) {
      const at = `${group}[${i}]`;
      checkFuture('impact.json', `${at}.as_of`, c.as_of);
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

/* ── report ── */
for (const w of warnings) console.log(`  warning  ${w}`);
for (const e of errors) console.error(`  error    ${e}`);

if (errors.length) {
  console.error(`\n${errors.length} error(s). Nothing merges until these are fixed.`);
  process.exit(1);
}
console.log(`\nAll data valid${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
