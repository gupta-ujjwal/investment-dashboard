#!/usr/bin/env node
// Refresh `src/data/sectors.json` from upstream sector-classification
// sources (issue #24 follow-up). Invoked by the bi-weekly
// `refresh-sectors.yml` GitHub Actions workflow and runnable locally to
// seed or expand the bundled map.
//
// Sources:
//   - US: `datasets/s-and-p-500-companies` (community-maintained CSV
//     mirror of Wikipedia's S&P 500 constituents). Columns: Symbol,
//     Security, GICS Sector, GICS Sub-Industry, …
//   - India: NSE archive CSV for NIFTY 100 (a.k.a. NIFTY 50 ∪ NIFTY Next 50).
//     Columns: Company Name, Industry, Symbol, Series, ISIN Code.
//
// Output keys:
//   - US: ticker (matches Vested broker `sourceSymbol`)
//   - India: ISIN (matches Groww broker `sourceSymbol`)
//
// The two ontologies coexist in one map by design — GICS labels appear
// next to NSE classification labels. Forcing a unified taxonomy would
// mis-classify (NSE's "Financial Services" covers what GICS splits across
// "Financials" and "Real Estate"). The donut renders both honestly.
//
// Failure policy: any source-fetch failure, shape mismatch, or
// below-floor count aborts the run with exit code 1. The workflow file
// does NOT retry — a red CI run is acceptable; the previous-good JSON
// stays on disk. Sector mappings drift slowly (constituents change ~once
// per quarter), so weekly staleness is benign.

import { writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_FILE = join(ROOT, 'src', 'data', 'sectors.json')

const SOURCES = {
  US: 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv',
  IN: 'https://nsearchives.nseindia.com/content/indices/ind_nifty100list.csv',
}

// Some upstreams (NSE archive in particular) reject empty / bot-like
// user-agents. This is the smallest UA each source accepts — not a
// deception, just a gate-pass.
const USER_AGENT = 'Mozilla/5.0 (compatible; investment-dashboard-refresh)'

// Floors guarding against truncated / partial CSV downloads. ~500 USD +
// 100 INR is what a successful run looks like; if the count drops well
// below either we'd rather fail than ship a hollowed-out map.
const MIN_US_ENTRIES = 400
const MIN_IN_ENTRIES = 90

async function fetchCsv(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`)
  }
  return res.text()
}

/**
 * Parse a CSV text into an array of cell arrays. Handles quoted fields
 * with embedded commas — both source CSVs have those (company names like
 * `"Smith & Co, Inc."`). Tolerant enough for these two sources; not a
 * general-purpose CSV parser.
 */
function parseCsv(text) {
  const rows = []
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue
    const cells = []
    let buf = ''
    let inQuotes = false
    for (let i = 0; i < rawLine.length; i++) {
      const c = rawLine[i]
      if (c === '"') {
        if (inQuotes && rawLine[i + 1] === '"') {
          buf += '"'
          i++ // escaped quote
        } else {
          inQuotes = !inQuotes
        }
      } else if (c === ',' && !inQuotes) {
        cells.push(buf)
        buf = ''
      } else {
        buf += c
      }
    }
    cells.push(buf)
    rows.push(cells)
  }
  return rows
}

function requireColumn(headers, name, source) {
  const idx = headers.indexOf(name)
  if (idx < 0) {
    throw new Error(
      `${source}: missing expected column "${name}". Got headers: ${headers.join(' | ')}`,
    )
  }
  return idx
}

async function fetchUsEntries() {
  const text = await fetchCsv(SOURCES.US)
  const [headers, ...data] = parseCsv(text)
  const tickerCol = requireColumn(headers, 'Symbol', 'US S&P 500 CSV')
  const nameCol = requireColumn(headers, 'Security', 'US S&P 500 CSV')
  const sectorCol = requireColumn(headers, 'GICS Sector', 'US S&P 500 CSV')

  const entries = {}
  for (const row of data) {
    const ticker = row[tickerCol]?.trim()
    const name = row[nameCol]?.trim()
    const sector = row[sectorCol]?.trim()
    if (!ticker || !sector) continue
    entries[ticker] = { name, sector, market: 'USD' }
  }
  return entries
}

async function fetchInEntries() {
  const text = await fetchCsv(SOURCES.IN)
  const [headers, ...data] = parseCsv(text)
  const nameCol = requireColumn(headers, 'Company Name', 'IN NIFTY 100 CSV')
  const industryCol = requireColumn(headers, 'Industry', 'IN NIFTY 100 CSV')
  const isinCol = requireColumn(headers, 'ISIN Code', 'IN NIFTY 100 CSV')

  const entries = {}
  for (const row of data) {
    const isin = row[isinCol]?.trim()
    const name = row[nameCol]?.trim()
    const sector = row[industryCol]?.trim()
    if (!isin || !sector) continue
    entries[isin] = { name, sector, market: 'INR' }
  }
  return entries
}

function validate(us, ind) {
  const usCount = Object.keys(us).length
  const inCount = Object.keys(ind).length
  if (usCount < MIN_US_ENTRIES) {
    throw new Error(
      `Only ${usCount} US entries fetched (expected ≥${MIN_US_ENTRIES}). ` +
        `Likely a truncated download or upstream schema change.`,
    )
  }
  if (inCount < MIN_IN_ENTRIES) {
    throw new Error(
      `Only ${inCount} INR entries fetched (expected ≥${MIN_IN_ENTRIES}). ` +
        `Likely a truncated download or upstream schema change.`,
    )
  }
}

async function main() {
  console.log('Fetching US S&P 500 sector classifications…')
  const us = await fetchUsEntries()
  console.log(`  ${Object.keys(us).length} US entries`)

  console.log('Fetching India NIFTY 100 sector classifications…')
  const ind = await fetchInEntries()
  console.log(`  ${Object.keys(ind).length} INR entries`)

  validate(us, ind)

  // Stable key order — sorted alphabetically — so each refresh PR's diff
  // is a clean "added/removed entries" view rather than full file churn.
  const merged = { ...us, ...ind }
  const sortedKeys = Object.keys(merged).sort()
  const sorted = {}
  for (const k of sortedKeys) sorted[k] = merged[k]

  await writeFile(OUT_FILE, JSON.stringify(sorted, null, 2) + '\n', 'utf8')
  console.log(`✓ Wrote ${sortedKeys.length} entries → ${OUT_FILE}`)
}

main().catch((err) => {
  console.error(`✗ ${err.message}`)
  process.exit(1)
})
