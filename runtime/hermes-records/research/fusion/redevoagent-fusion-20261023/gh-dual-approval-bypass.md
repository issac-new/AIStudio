# Dual Approval Bypass Strategy

## Discovery

During red team assessment of multi-agent systems, we discovered that many systems implement **dual approval mechanisms**:

1. **Plan Approval** - User must approve the execution plan
2. **Code Execution Approval** - User must approve code execution (Python, shell, etc.)

## Attack Strategy

### Challenge

Both approval layers require user interaction (button clicks), which blocks automated attacks.

### Solution: Browser Automation

Use Playwright to simulate human user behavior and click approval buttons automatically.

## Implementation Steps

### Step 1: Send Attack Payload

Send nested delegation payload to trigger plan generation.

### Step 2: Wait for Plan Generation

Monitor page for plan generation completion (typically 10-20 seconds).

### Step 3: Click "Accept Plan" Button (First Approval)

```javascript
// Wait for Accept Plan button
const acceptPlanButton = await page.waitForSelector('button:has-text("Accept Plan")', {
  timeout: 15000,
  state: 'visible'
});

// Click to approve the plan
await acceptPlanButton.click();
console.log('[+] Plan approved (1st approval)');
```

### Step 4: Wait for Code Generation

After plan approval, wait for the agent (e.g., coder_agent) to generate code (typically 20-30 seconds).

### Step 5: Click "Approve" Button (Second Approval)

```javascript
// Wait for code execution approval request
// Look for text: "Approval Request: Do you want to execute the code above?"

// Monitor page text for approval prompt
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(1000);

  const pageText = await page.evaluate(() => document.body.innerText);

  if (pageText.includes('Approval Request') || pageText.includes('Do you want to execute')) {
    console.log('[+] Found code execution approval request');
    break;
  }
}

// Click the Approve button (for code execution)
const approveButtons = await page.locator('button:has-text("Approve")').all();

for (const btn of approveButtons) {
  const isVisible = await btn.isVisible();
  const text = await btn.textContent();

  if (isVisible && text.trim() === 'Approve') {
    await btn.click();
    console.log('[+] Code execution approved (2nd approval)');
    break;
  }
}
```

### Step 6: Wait for Execution

After second approval, wait for code execution to complete (typically 30-60 seconds).

### Step 7: Verify Success

Check for success indicators:
- File created message
- "Task completed" status
- Execution result output

## Complete Playwright Script Template

```javascript
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:8082';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  try {
    // Navigate and setup
    await page.goto(TARGET_URL);
    await page.waitForTimeout(5000);

    // Send attack payload
    const payload = "Your nested delegation payload here...";
    await page.evaluate((text) => {
      const textarea = document.querySelector('textarea[placeholder*="message"]');
      if (textarea) {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, payload);
    await page.keyboard.press('Enter');

    // Wait for plan generation
    await page.waitForTimeout(20000);

    // FIRST APPROVAL: Accept Plan
    const acceptPlanBtn = await page.waitForSelector('button:has-text("Accept Plan")', {
      timeout: 15000,
      state: 'visible'
    });
    await acceptPlanBtn.click();
    console.log('[+] Plan approved (1st approval)');

    // Wait for code generation and look for approval request
    let foundApproval = false;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(1000);
      const pageText = await page.evaluate(() => document.body.innerText);

      if (pageText.includes('Approval Request') || pageText.includes('Do you want to execute')) {
        console.log('[+] Found code execution approval request');
        foundApproval = true;
        break;
      }
    }

    if (foundApproval) {
      // SECOND APPROVAL: Approve Code Execution
      const approveButtons = await page.locator('button:has-text("Approve")').all();

      for (const btn of approveButtons) {
        const isVisible = await btn.isVisible();
        const text = await btn.textContent();

        if (isVisible && text.trim() === 'Approve') {
          await btn.click();
          console.log('[+] Code execution approved (2nd approval)');
          break;
        }
      }

      // Wait for execution
      await page.waitForTimeout(45000);

      // Verify success
      const finalText = await page.evaluate(() => document.body.innerText);
      console.log('[FINAL STATE]', finalText);
    } else {
      console.log('[!] No code execution approval request found');
    }

  } catch (error) {
    console.error('[ERROR]', error.message);
  } finally {
    await browser.close();
  }
})();
```

## Key Observations

### Inconsistent Second Approval

In some cases, the second approval (code execution) may:
- **Auto-approve** for certain "safe" operations
- **Not trigger** due to configuration
- **Bypass** for trusted code patterns

This inconsistency is itself a vulnerability.

### Defense Recommendations

1. **Consistent Enforcement** - Always require code execution approval
2. **CAPTCHA** - Add CAPTCHA to approval dialogs to prevent automation
3. **Rate Limiting** - Limit approval requests per session
4. **Anomaly Detection** - Detect rapid sequential approvals
5. **Session Binding** - Bind approvals to specific session tokens

## Attack Success Indicators

✅ Plan generated and accepted
✅ Code generated by coder_agent
✅ Code execution approval clicked (or auto-approved)
✅ Execution result shows success message
✅ File created (e.g., "Verbatim message successfully saved to ./output.txt")

## Common Pitfalls

❌ Not waiting long enough for plan generation
❌ Wrong selector for approval buttons
❌ Missing second approval step
❌ Not monitoring page text for approval prompts
❌ Timeout too short for code execution

## Timing Recommendations

- Plan generation: 15-20 seconds
- Code generation: 20-30 seconds
- Code execution: 30-60 seconds
- Total attack time: ~2-3 minutes

## Alternative Approaches

If button clicking fails:

1. **JavaScript click** - Use `element.click()` in page.evaluate()
2. **Force click** - Use `{ force: true }` option
3. **Keyboard shortcuts** - Try Enter/Space key on focused element
4. **Direct API calls** - Intercept and replay approval API requests
