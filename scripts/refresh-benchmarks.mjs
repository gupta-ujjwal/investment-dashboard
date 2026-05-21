#!/usr/bin/env node
// Refresh bundled benchmark history JSON for the analytics-depth feature
// (issue #24, PR B). Invoked by the weekly `refresh-benchmarks.yml` GitHub
// Actions workflow and runnable locally to seed initial data.
//
// Fetches ~5y of daily closes for NIFTY 50 and S&P 500 from Yahoo Finance's
// `/v8/finance/chart` JSON endpoint (no auth required), validates the
// fetched series (non-empty, monotonic dates, finite closes, last point
// within 7d of today), and writes the result to
// `src/data/benchmarks/{nifty50,sp500}.json`.
//
// Failure policy: any validation failure aborts the run with exit code 1.
// The workflow file does NOT retry — a red CI run is acceptable; the
// previous-good JSON stays on disk and the user-facing UI shows the
// "as of <date>" / "stale" banner (per the plan's CI escalation policy).
//
// NOT a runtime data source. R10 (privacy doctrine) forbids runtime
// external calls; this script runs at build/refresh time only.

import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MIN_EXPECTED_POINTS } from './benchmarkConfig.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'src', 'data', 'benchmarks')

const BENCHMARKS = [
  {
    file: 'nifty50.json',
    symbol: '^NSEI',
    index: 'NIFTY 50',
    rebaseLabel: 'NIFTY 50 (rebased)',
  },
  {
    file: 'sp500.json',
    symbol: '^GSPC',
    index: 'S&P 500',
    rebaseLabel: 'S&P 500 (rebased)',
  },
]

const RANGE = '5y'
const INTERVAL = '1d'
// Yahoo's `/v8/finance/chart` endpoint rejects empty / generic user-agents.
// The string here is the smallest UA Yahoo accepts; not a deception, just a
// gate-pass.
const USER_AGENT = 'Mozilla/5.0 (compatible; investment-dashboard-refresh)'

const MAX_AGE_DAYS = 7

async function fetchSeries(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}?interval=${INTERVAL}&range=${RANGE}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${symbol}`)
  }
  const body = await res.json()
  if (body?.chart?.error) {
    throw new Error(
      `Yahoo error for ${symbol}: ${body.chart.error.description ?? 'unknown'}`,
    )
  }
  const result = body?.chart?.result?.[0]
  if (!result) {
    throw new Error(`No chart result for ${symbol}`)
  }
  const timestamps = result.timestamp
  const closes = result?.indicators?.quote?.[0]?.close
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) {
    throw new Error(`Malformed response shape for ${symbol}`)
  }
  if (timestamps.length !== closes.length) {
    throw new Error(
      `Length mismatch for ${symbol}: ${timestamps.length} timestamps vs ` +
        `${closes.length} closes`,
    )
  }
  const series = []
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i]
    if (close == null || !Number.isFinite(close)) continue // skip holiday gaps
    const ts = timestamps[i]
    if (!Number.isFinite(ts)) continue
    const date = new Date(ts * 1000).toISOString().slice(0, 10)
    series.push({ date, close: Number(close.toFixed(2)) })
  }
  return series
}

function validate(series, label) {
  if (!Array.isArray(series) || series.length === 0) {
    throw new Error(`${label}: series is empty`)
  }
  if (series.length < MIN_EXPECTED_POINTS) {
    throw new Error(
      `${label}: only ${series.length} points (expected ≥${MIN_EXPECTED_POINTS})`,
    )
  }
  let prevDate = ''
  for (let i = 0; i < series.length; i++) {
    const p = series[i]
    if (typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
      throw new Error(`${label}: bad date at index ${i}: ${p.date}`)
    }
    if (p.date <= prevDate) {
      throw new Error(
        `${label}: non-monotonic dates at index ${i}: ${prevDate} → ${p.date}`,
      )
    }
    if (!Number.isFinite(p.close)) {
      throw new Error(`${label}: non-finite close at ${p.date}: ${p.close}`)
    }
    prevDate = p.date
  }
  const last = series[series.length - 1]
  const ageDays = (Date.now() - new Date(last.date).getTime()) / (24 * 3600 * 1000)
  if (ageDays > MAX_AGE_DAYS) {
    throw new Error(
      `${label}: latest date ${last.date} is ${Math.round(ageDays)}d old ` +
        `(max ${MAX_AGE_DAYS}d)`,
    )
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  for (const b of BENCHMARKS) {
    console.log(`Fetching ${b.index} (${b.symbol})…`)
    const series = await fetchSeries(b.symbol)
    validate(series, b.index)
    const payload = {
      index: b.index,
      rebaseLabel: b.rebaseLabel,
      series,
    }
    const path = join(OUT_DIR, b.file)
    await writeFile(path, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    console.log(
      `  ✓ ${series.length} points (${series[0].date} → ${series[series.length - 1].date}) → ${path}`,
    )
  }
  console.log('Done.')
}

main().catch((err) => {
  console.error(`✗ ${err.message}`)
  process.exit(1)
})
