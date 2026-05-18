#!/usr/bin/env node
/**
 * ChatGPT → Claude Code automation
 *
 * Usage:
 *   node chatgpt-to-claude.js          # fetch next task and run claude
 *   node chatgpt-to-claude.js --fetch  # fetch only, print prompt, don't run claude
 *   node chatgpt-to-claude.js --loop   # keep going: fetch → claude → done → repeat
 */

const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const COOKIES_FILE = path.join(__dirname, '.chatgpt-session.json');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const FETCH_ONLY = process.argv.includes('--fetch');
const LOOP_MODE = process.argv.includes('--loop');

// ─── helpers ────────────────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

function saveCookies(cookies) {
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

function loadCookies() {
  if (fs.existsSync(COOKIES_FILE)) {
    return JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
  }
  return null;
}

// ─── ChatGPT interaction ─────────────────────────────────────────────────────

async function ensureLoggedIn(page, context) {
  await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded' });

  // If redirected to auth, wait for the user to log in manually
  if (page.url().includes('/auth') || page.url().includes('login')) {
    console.log('\n⚠️  Not logged in. Browser window is open — please log in to ChatGPT.');
    console.log('   The script will continue automatically once you are logged in.\n');
    await page.waitForURL(url => !url.includes('/auth') && !url.includes('login'), {
      timeout: 120_000,
    });
    const cookies = await context.cookies();
    saveCookies(cookies);
    console.log('✅ Session saved to .chatgpt-session.json\n');
  }
}

// All known ChatGPT composer selectors (ordered by specificity)
const COMPOSER_SELECTORS = [
  '#prompt-textarea',
  'div[contenteditable="true"][data-lexical-editor="true"]',
  'div[contenteditable="true"]',
  'textarea[placeholder]',
];

async function findComposer(page, timeout = 60_000) {
  const selector = COMPOSER_SELECTORS.join(', ');
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout });
  return locator;
}

async function sendMessage(page, message) {
  const input = await findComposer(page);
  await input.click();
  // Clear via keyboard shortcut in case fill() doesn't work on contenteditable
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(message, { delay: 20 });

  // Prefer the send button; fall back to Enter
  const sendBtn = page.locator('button[data-testid="send-button"]');
  if (await sendBtn.isVisible().catch(() => false)) {
    await sendBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }
}

async function waitForResponse(page) {
  console.log('⏳ Waiting for ChatGPT response...');

  // Wait for streaming to start (stop button appears) then finish (stop button gone)
  try {
    await page.locator('button[data-testid="stop-button"]').waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    // Response may have been near-instant
  }
  try {
    await page.locator('button[data-testid="stop-button"]').waitFor({ state: 'hidden', timeout: 120_000 });
  } catch {
    // Button may never have appeared — that's fine, fall through
  }

  // Small settle delay for DOM to finish rendering
  await page.waitForTimeout(1_000);

  // Grab the last assistant message
  const messages = page.locator('[data-message-author-role="assistant"]');
  const count = await messages.count();
  if (count === 0) throw new Error('No assistant message found in the conversation.');

  const lastMessage = messages.nth(count - 1);
  const text = await lastMessage.innerText();
  return text.trim();
}

async function navigateToProject(page) {
  const url = config.chatgptProjectUrl;
  if (!url || url.startsWith('PASTE_')) {
    throw new Error(
      'Set your ChatGPT project URL in scripts/config.json → "chatgptProjectUrl"'
    );
  }

  console.log('🌐 Navigating to ChatGPT project…');
  // networkidle gives React more time to mount the composer
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });

  // If ChatGPT redirected us (e.g. login wall), detect and bail early
  if (page.url().includes('/auth') || page.url().includes('login')) {
    throw new Error('Session expired — delete .chatgpt-session.json and re-run to log in again.');
  }

  await findComposer(page, 60_000);
  console.log('✅ Composer ready.\n');
}

// ─── Claude Code runner ──────────────────────────────────────────────────────

function runClaude(prompt) {
  console.log('\n─────────────────────────────────────────────');
  console.log('🤖 Handing off to Claude Code…');
  console.log('─────────────────────────────────────────────\n');

  // Inherit stdio so the user sees full interactive Claude output
  const result = spawnSync('claude', [prompt], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    shell: false,
  });

  if (result.error) {
    throw new Error(`Failed to run claude: ${result.error.message}`);
  }

  return result.status === 0;
}

// ─── main loop ───────────────────────────────────────────────────────────────

async function main() {
  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext();

  // Restore saved session if available
  const savedCookies = loadCookies();
  if (savedCookies) {
    await context.addCookies(savedCookies);
    console.log('🔑 Loaded saved session.\n');
  }

  const page = await context.newPage();

  try {
    await ensureLoggedIn(page, context);
    await navigateToProject(page);

    let iteration = 0;

    do {
      iteration++;
      if (LOOP_MODE) console.log(`\n══════════ Task #${iteration} ══════════`);

      // 1. Ask ChatGPT for the next task
      console.log('💬 Asking ChatGPT for the next task…');
      await sendMessage(page, config.nextTaskPrompt);
      const prompt = await waitForResponse(page);

      console.log('\n📋 Prompt received:\n');
      console.log('  ' + prompt.split('\n').join('\n  '));
      console.log('');

      // Stop signal — ChatGPT says there's nothing left
      if (/all (tasks|steps) (are )?complete|nothing (left|remaining)|no more tasks/i.test(prompt)) {
        console.log('🎉 ChatGPT says all tasks are complete. Stopping.\n');
        break;
      }

      if (FETCH_ONLY) {
        console.log('(--fetch mode: not running Claude)\n');
        break;
      }

      // 2. Run Claude Code with the prompt
      const success = runClaude(prompt);

      // 3. Tell ChatGPT we're done (so it advances its state)
      if (config.autoConfirmDone) {
        const doneMsg = success
          ? config.doneMessage
          : 'Claude encountered an issue with that task. Please note it and give me the next task.';

        console.log(`\n💬 Sending to ChatGPT: "${doneMsg}"`);
        await sendMessage(page, doneMsg);
        await waitForResponse(page); // consume the acknowledgement
      }

    } while (LOOP_MODE);

  } finally {
    // Persist any refreshed cookies
    const cookies = await context.cookies();
    saveCookies(cookies);
    await browser.close();
  }
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
