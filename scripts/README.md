# ChatGPT → Claude Code Automation

Fetches the next task prompt from your ChatGPT Project and hands it off to the `claude` CLI automatically.

## First-time setup (run once)

```bash
cd scripts
npm install
npm run setup        # downloads Chromium for Playwright
```

## Configure

Edit `config.json`:

```json
{
  "chatgptProjectUrl": "https://chatgpt.com/c/YOUR-CONVERSATION-ID"
}
```

Paste the URL from your browser's address bar while the ChatGPT Project conversation is open.

## Run

```bash
# From the scripts/ folder:

node chatgpt-to-claude.js           # fetch next task → run Claude → tell ChatGPT "done"
node chatgpt-to-claude.js --fetch   # fetch prompt only, print it, don't run Claude
node chatgpt-to-claude.js --loop    # keep looping until ChatGPT says all tasks are done
```

## First run — login

On the first run a browser window opens. Log into ChatGPT normally. The session is saved to `.chatgpt-session.json` so you won't need to log in again.

## How the loop works

1. Script navigates to your ChatGPT Project URL
2. Sends the configured `nextTaskPrompt` ("What is the next task…")
3. ChatGPT replies with the raw task prompt
4. `claude` CLI is launched with that prompt (full interactive output in your terminal)
5. After Claude finishes, script sends `"Done. What's next?"` to ChatGPT so it advances its internal state
6. In `--loop` mode, repeats from step 2

## Files

| File | Purpose |
|------|---------|
| `config.json` | URL, prompts, and behaviour settings |
| `.chatgpt-session.json` | Saved browser session (gitignored) |
| `chatgpt-to-claude.js` | The automation script |
