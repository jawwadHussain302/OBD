#!/usr/bin/env node
/**
 * Debug script — opens ChatGPT, waits 15s for the page to fully load,
 * then saves a screenshot + dumps all input/textarea/button selectors found.
 *
 * Usage:  node debug-chatgpt.js
 * Output: scripts/debug-screenshot.png  +  printed selector list
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIES_FILE = path.join(__dirname, '.chatgpt-session.json');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    await context.addCookies(cookies);
    console.log('🔑 Loaded saved session.');
  }

  const page = await context.newPage();

  console.log('🌐 Navigating to:', config.chatgptProjectUrl);
  await page.goto(config.chatgptProjectUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  console.log('⏳ Waiting for ChatGPT app to finish loading (up to 90s)...');
  try {
    await page.waitForFunction(() => {
      const selectors = ['#prompt-textarea', 'div[contenteditable="true"]', 'textarea[placeholder]'];
      return selectors.some(s => { const el = document.querySelector(s); return el && el.offsetParent !== null; });
    }, { timeout: 90_000, polling: 1_000 });
    console.log('✅ App loaded.');
  } catch {
    console.log('⚠️  App did not finish loading — taking screenshot of current state anyway.');
  }
  await page.waitForTimeout(1_000);

  // Screenshot
  const screenshotPath = path.join(__dirname, 'debug-screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`\n📸 Screenshot saved → ${screenshotPath}`);
  console.log('   Open it to see what the browser is showing.\n');

  // Dump current URL
  console.log('🔗 Current URL:', page.url());

  // Dump page title
  console.log('📄 Page title:', await page.title());

  // Find all editable / input elements
  console.log('\n🔍 Editable elements found on page:');
  const editables = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('textarea, input, [contenteditable]').forEach(el => {
      results.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        name: el.getAttribute('name') || null,
        placeholder: el.getAttribute('placeholder') || null,
        contenteditable: el.getAttribute('contenteditable') || null,
        dataTestid: el.getAttribute('data-testid') || null,
        classes: el.className?.toString().slice(0, 80) || null,
        visible: el.offsetParent !== null,
      });
    });
    return results;
  });

  if (editables.length === 0) {
    console.log('  (none found — page may not have loaded or login required)');
  } else {
    editables.forEach((el, i) => console.log(`  [${i}]`, JSON.stringify(el)));
  }

  // Find buttons
  console.log('\n🔍 Buttons found on page:');
  const buttons = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('button').forEach(el => {
      const text = el.innerText?.trim().slice(0, 40);
      const testid = el.getAttribute('data-testid');
      if (text || testid) {
        results.push({ text, dataTestid: testid, visible: el.offsetParent !== null });
      }
    });
    return results.slice(0, 20); // cap at 20
  });

  buttons.forEach((b, i) => console.log(`  [${i}]`, JSON.stringify(b)));

  console.log('\nDone. Check debug-screenshot.png to see what the page looks like.');
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
