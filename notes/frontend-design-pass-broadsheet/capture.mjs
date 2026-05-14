// Capture Playwright MCP evidence for the broadsheet design pass.
// Bypasses the MCP wrapper (which hit a 5s RPC timeout repeatedly in this
// session) and drives Chromium directly. Outputs into .playwright-mcp/.

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const OUT_DIR = '.playwright-mcp'
const ROOT = process.cwd()
const APP_URL = 'http://localhost:5173/investment-dashboard/'
const VESTED_FIXTURE = resolve(ROOT, 'tests/fixtures/vested-sample.xlsx')
const GROWW_FIXTURE = resolve(ROOT, 'tests/fixtures/groww-sample.xlsx')

if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR)

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' })

async function shot(page, file) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `${OUT_DIR}/${file}`, fullPage: true })
  console.log(`  → ${file}`)
}

async function clearIDB(page) {
  await page.evaluate(
    () =>
      new Promise((res) => {
        const req = indexedDB.deleteDatabase('investment-dashboard')
        req.onsuccess = req.onerror = req.onblocked = () => res(null)
      }),
  )
}

async function capture(viewport, tag) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text())
    if (m.type() === 'warning') consoleErrors.push(`WARN: ${m.text()}`)
  })

  console.log(`\n== Viewport ${tag} (${viewport.width}×${viewport.height}) ==`)

  // Empty state — / redirects to /import → SourcePicker
  await page.goto(APP_URL)
  await page.waitForLoadState('networkidle')
  await clearIDB(page)
  await page.goto(APP_URL)
  await page.waitForLoadState('networkidle')
  await shot(page, `${tag}-01-empty-state-source-picker.png`)

  // Vested instructions
  await page.getByRole('button', { name: /Vested/i }).click()
  await page.waitForTimeout(300)
  await shot(page, `${tag}-02-instructions-vested.png`)

  // Back, then Groww instructions
  await page.getByRole('button', { name: /Back/i }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Groww/i }).click()
  await page.waitForTimeout(300)
  await shot(page, `${tag}-03-instructions-groww.png`)

  // Continue to upload — empty state
  await page.getByRole('button', { name: /I have the file/i }).click()
  await page.waitForTimeout(300)
  await shot(page, `${tag}-04-upload-empty-groww.png`)

  // Force a parse error — upload the vested file to the groww parser
  const fileChooserPromise1 = page.waitForEvent('filechooser')
  await page.getByText(/Choose a file/i).click()
  const fc1 = await fileChooserPromise1
  await fc1.setFiles(VESTED_FIXTURE)
  await page.waitForTimeout(800)
  await shot(page, `${tag}-05-upload-parse-error.png`)

  // Back, switch source to Vested, upload Vested sample → preview no-missing
  await page.getByRole('button', { name: /Back/i }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /Vested/i }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /I have the file/i }).click()
  await page.waitForTimeout(200)
  const fileChooserPromise2 = page.waitForEvent('filechooser')
  await page.getByText(/Choose a file/i).click()
  const fc2 = await fileChooserPromise2
  await fc2.setFiles(VESTED_FIXTURE)
  await page.waitForTimeout(800)
  await shot(page, `${tag}-06-preview-no-missing.png`)

  // Commit it → success
  await page.getByRole('button', { name: /Commit changes/i }).click()
  await page.waitForTimeout(800)
  await shot(page, `${tag}-07-commit-success.png`)

  // View dashboard → list view (single source: Vested)
  await page.getByRole('button', { name: /View dashboard/i }).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  await shot(page, `${tag}-08-list-single-source-vested.png`)

  // Import more → groww, upload, preview (no missing since storage scoped by source)
  await page.getByRole('link', { name: /Import more/i }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Groww/i }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /I have the file/i }).click()
  await page.waitForTimeout(200)
  const fileChooserPromise3 = page.waitForEvent('filechooser')
  await page.getByText(/Choose a file/i).click()
  const fc3 = await fileChooserPromise3
  await fc3.setFiles(GROWW_FIXTURE)
  await page.waitForTimeout(800)
  await shot(page, `${tag}-09-preview-groww.png`)
  await page.getByRole('button', { name: /Commit changes/i }).click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /View dashboard/i }).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  await shot(page, `${tag}-10-list-both-sources.png`)

  // Re-upload Vested with a missing-rows scenario: drop one row by re-uploading
  // groww as vested — actually simpler: re-upload Vested file unmodified → no missing.
  // To force missing, we'd need a modified fixture. Skip the with-missing variant
  // unless a modified fixture is at hand. Document this in the implementation doc.

  console.log(
    `  Console errors/warnings: ${consoleErrors.length === 0 ? 'none' : consoleErrors.join('; ')}`,
  )
  await ctx.close()
  return consoleErrors
}

const desktopErrs = await capture({ width: 1440, height: 900 }, 'desktop')
const mobileErrs = await capture({ width: 390, height: 844 }, 'mobile')

await browser.close()

console.log('\n== Summary ==')
console.log(`Desktop errors: ${desktopErrs.length}`)
console.log(`Mobile errors:  ${mobileErrs.length}`)
process.exit(desktopErrs.length + mobileErrs.length > 0 ? 1 : 0)
