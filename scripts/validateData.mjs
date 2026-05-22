#!/usr/bin/env node
// Build-time shape validation for the bundled analytics-depth data files
// (issue #24, PR B). Runs as `prebuild` so `npm run build` fails red on a
// malformed JSON before Vite ships it to users — the third line of defence
// after `scripts/refresh-benchmarks.mjs` (validates on fetch) and the
// chart-level `ChartErrorBoundary` (contains render-time blast radius).
//
// Intentionally dependency-free — uses only Node's stdlib. An `ajv`-shaped
// validator would be heavier than the hand-rolled checks for this surface
// (one map + two series) and would add a dev-dependency this project does
// not otherwise need.

import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MIN_EXPECTED_POINTS } from './benchmarkConfig.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

async function loadJson(relPath) {
  let txt
  try {
    txt = await readFile(join(ROOT, relPath), 'utf8')
  } catch (err) {
    throw new Error(`${relPath}: cannot read (${err.message})`)
  }
  try {
    return JSON.parse(txt)
  } catch (err) {
    throw new Error(`${relPath}: invalid JSON (${err.message})`)
  }
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

async function validateSectors() {
  const data = await loadJson('src/data/sectors.json')
  if (!isPlainObject(data)) {
    throw new Error('sectors.json: top-level must be an object')
  }
  const tickers = Object.keys(data)
  if (tickers.length === 0) {
    throw new Error('sectors.json: must contain at least one ticker')
  }
  for (const ticker of tickers) {
    const entry = data[ticker]
    if (typeof ticker !== 'string' || ticker.length === 0) {
      throw new Error(`sectors.json: invalid ticker key "${ticker}"`)
    }
    if (!isPlainObject(entry)) {
      throw new Error(`sectors.json[${ticker}]: entry must be an object`)
    }
    if (typeof entry.sector !== 'string' || entry.sector.length === 0) {
      throw new Error(`sectors.json[${ticker}].sector: must be non-empty string`)
    }
    if (entry.market !== 'INR' && entry.market !== 'USD') {
      throw new Error(
        `sectors.json[${ticker}].market: must be "INR" or "USD" (got ${JSON.stringify(entry.market)})`,
      )
    }
    if (entry.name !== undefined && typeof entry.name !== 'string') {
      throw new Error(`sectors.json[${ticker}].name: if present, must be a string`)
    }
  }
  console.log(`✓ src/data/sectors.json — ${tickers.length} tickers`)
}

async function validateBenchmark(relPath) {
  const data = await loadJson(relPath)
  if (!isPlainObject(data)) {
    throw new Error(`${relPath}: top-level must be an object`)
  }
  if (typeof data.index !== 'string' || data.index.length === 0) {
    throw new Error(`${relPath}.index: must be non-empty string`)
  }
  if (typeof data.rebaseLabel !== 'string' || data.rebaseLabel.length === 0) {
    throw new Error(`${relPath}.rebaseLabel: must be non-empty string`)
  }
  if (!Array.isArray(data.series) || data.series.length === 0) {
    throw new Error(`${relPath}.series: must be a non-empty array`)
  }
  // Mirror `refresh-benchmarks.mjs`'s floor so a hand-edited / truncated
  // file can't slip past `prebuild` with a stub series the chart would
  // render as a tiny reference line. Shared via `benchmarkConfig.mjs`.
  if (data.series.length < MIN_EXPECTED_POINTS) {
    throw new Error(
      `${relPath}.series: only ${data.series.length} points (expected ≥${MIN_EXPECTED_POINTS})`,
    )
  }
  let prevDate = ''
  for (let i = 0; i < data.series.length; i++) {
    const p = data.series[i]
    if (!isPlainObject(p)) {
      throw new Error(`${relPath}.series[${i}]: must be an object`)
    }
    if (typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
      throw new Error(`${relPath}.series[${i}].date: bad date "${p.date}"`)
    }
    if (p.date <= prevDate) {
      throw new Error(
        `${relPath}.series[${i}]: non-monotonic ${prevDate} → ${p.date}`,
      )
    }
    if (typeof p.close !== 'number' || !Number.isFinite(p.close)) {
      throw new Error(
        `${relPath}.series[${i}].close: must be a finite number (got ${JSON.stringify(p.close)})`,
      )
    }
    prevDate = p.date
  }
  console.log(
    `✓ ${relPath} — ${data.series.length} points (${data.series[0].date} → ${prevDate})`,
  )
}

async function main() {
  await validateSectors()
  await validateBenchmark('src/data/benchmarks/nifty50.json')
  await validateBenchmark('src/data/benchmarks/sp500.json')
  console.log('All bundled data files valid.')
}

main().catch((err) => {
  console.error(`✗ ${err.message}`)
  process.exit(1)
})
