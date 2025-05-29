import puppeteer from "puppeteer"

// Alternative approach: Use chrome-aws-lambda for serverless environments
// or implement a non-Puppeteer solution
export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google sign-in test for: ${email}`)

  // Check if we're in a serverless environment
  const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY

  if (isServerless) {
    console.log("🌩️ Detected serverless environment, using alternative validation")
    return await alternativeGmailValidation(email)
  }
  return {
        status: "error",
        message: "1",
      }
  let browser
  try {
    // Try different Chrome installation approaches
    const chromeConfig = await getChromeConfiguration()

    console.log("🚀 Launching browser with configuration:", chromeConfig)
    browser = await puppeteer.launch(chromeConfig)

    const page = await browser.newPage()

    // Set realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )

    console.log(`🔐 Navigating to Google sign-in page...`)
    await page.goto(
      "https://accounts.google.com/v3/signin/identifier?authuser=0&continue=https%3A%2F%2Fmyaccount.google.com%2F&ec=GAlAwAE&hl=en&service=accountsettings&flowName=GlifWebSignIn&flowEntry=AddSession",
      { waitUntil: "networkidle0", timeout: 30000 },
    )

    // Wait for email input field with multiple selectors
    console.log(`🔐 Looking for email input field...`)
    const emailInputSelectors = [
      'input[type="email"]',
      'input[id="identifierId"]',
      'input[name="identifier"]',
      "#identifierId",
    ]

    let emailInputFound = false
    for (const selector of emailInputSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 })
        emailInputFound = true
        console.log(`🔐 Found email input with selector: ${selector}`)
        break
      } catch (e) {
        continue
      }
    }

    if (!emailInputFound) {
      await browser.close()
      return { status: "technical_error", message: "Could not find email input field on Google sign-in page" }
    }

    // Clear and enter email
    console.log(`🔐 Entering email: ${email}`)
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="email"], #identifierId')
      inputs.forEach((input) => {
        if (input instanceof HTMLInputElement) {
          input.value = ""
          input.focus()
        }
      })
    })

    await page.type('#identifierId, input[type="email"]', email, { delay: 100 })
    await page.waitForTimeout(1000)

    // Find and click Next button
    console.log(`🔐 Looking for Next button...`)
    const nextButtonSelectors = [
      "#identifierNext",
      'button[jsname="LgbsSe"]',
      '[data-primary-action-label="Next"]',
      ".VfPpkd-LgbsSe",
      'div[role="button"]:has-text("Next")',
    ]

    let nextButtonFound = false
    for (const selector of nextButtonSelectors) {
      try {
        const button = await page.$(selector)
        if (button) {
          console.log(`🔐 Found and clicking Next button with selector: ${selector}`)
          await button.click()
          nextButtonFound = true
          break
        }
      } catch (e) {
        continue
      }
    }

    if (!nextButtonFound) {
      await browser.close()
      return { status: "technical_error", message: "Could not find or click Next button" }
    }

    // Wait for page response
    console.log(`🔐 Waiting for page response after clicking Next...`)
    await page.waitForTimeout(4000)

    // Check for error messages first
    console.log(`🔐 Checking for error messages...`)
    const errorSelectors = [
      'div[jsname="B34EJ"]',
      '[data-error="true"]',
      ".Ekjuhf",
      ".dEOOab",
      "span[jsslot]",
      ".LXRPh",
      '[role="alert"]',
    ]

    for (const selector of errorSelectors) {
      try {
        const errorElement = await page.$(selector)
        if (errorElement) {
          const errorText = await page.evaluate((el) => el.textContent?.trim(), errorElement)
          if (errorText && errorText.length > 0) {
            console.log(`🔐 ❌ Found error message: ${errorText}`)
            await browser.close()
            return { status: "error", message: errorText }
          }
        }
      } catch (e) {
        continue
      }
    }

    // Check for password input (success)
    console.log(`🔐 Checking for password input field...`)
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      "#password",
      '[data-form-type="password"]',
    ]

    for (const selector of passwordSelectors) {
      try {
        const passwordInput = await page.$(selector)
        if (passwordInput) {
          console.log(`🔐 ✅ Found password input - email is valid!`)
          await browser.close()
          return { status: "success", message: "Email is valid - reached password step" }
        }
      } catch (e) {
        continue
      }
    }

    // Check current URL to determine state
    const currentUrl = page.url()
    console.log(`🔐 Current URL after Next click: ${currentUrl}`)

    if (currentUrl.includes("signin/identifier")) {
      console.log(`🔐 ❌ Still on identifier page - likely invalid email`)
      await browser.close()
      return { status: "error", message: "Email appears to be invalid - remained on identifier page" }
    }

    // If we reach here, we couldn't determine the result
    console.log(`🔐 ❓ Could not determine result definitively`)
    await browser.close()
    return {
      status: "unknown",
      message: `Could not determine result. Current URL: ${currentUrl}`,
    }
  } catch (error) {
    console.error(`🔐 💥 Google sign-in test error:`, error)
    if (browser) {
      await browser.close().catch((e) => console.error("Error closing browser:", e))
    }

    // If Puppeteer fails, fall back to alternative validation
    console.log("🔄 Puppeteer failed, using alternative validation")
    return await alternativeGmailValidation(email)
  }
}

// Get Chrome configuration based on environment
async function getChromeConfiguration(): Promise<puppeteer.LaunchOptions> {
  const baseConfig: puppeteer.LaunchOptions = {
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=VizDisplayCompositor",
      "--disable-web-security",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
  }

  // Try to use chrome-aws-lambda if available
  try {
    const chromium = require("chrome-aws-lambda")
    console.log("📦 Using chrome-aws-lambda")
    return {
      ...baseConfig,
      executablePath: await chromium.executablePath,
      args: [...(baseConfig.args || []), ...chromium.args],
    }
  } catch (e) {
    console.log("📦 chrome-aws-lambda not available, trying other options")
  }

  // Try to find Chrome in system paths
  const fs = require("fs")
  const possiblePaths = [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ]

  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`✅ Found Chrome at: ${chromePath}`)
      return {
        ...baseConfig,
        executablePath: chromePath,
      }
    }
  }

  // If no Chrome found, let Puppeteer try to use its bundled Chromium
  console.log("🔍 No Chrome found, using Puppeteer's bundled Chromium")
  return baseConfig
}

// Alternative Gmail validation without Puppeteer
async function alternativeGmailValidation(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔄 Using alternative Gmail validation for: ${email}`)

  if (!email.endsWith("@gmail.com")) {
    return {
      status: "unknown",
      message: "Alternative validation only works for Gmail addresses",
    }
  }

  try {
    const localPart = email.split("@")[0]

    // Enhanced Gmail validation rules
    const validationResults = []

    // 1. Length check (Gmail allows 6-30 characters)
    if (localPart.length < 6 || localPart.length > 30) {
      return {
        status: "error",
        message: "Gmail addresses must be between 6-30 characters before @gmail.com",
      }
    }
    validationResults.push("✅ Length valid")

    // 2. Must start with a letter or number
    if (!/^[a-z0-9]/i.test(localPart)) {
      return {
        status: "error",
        message: "Gmail addresses must start with a letter or number",
      }
    }
    validationResults.push("✅ Start character valid")

    // 3. Valid characters only
    if (!/^[a-z0-9._]+$/i.test(localPart)) {
      return {
        status: "error",
        message: "Gmail addresses can only contain letters, numbers, dots, and underscores",
      }
    }
    validationResults.push("✅ Characters valid")

    // 4. No consecutive dots
    if (localPart.includes("..")) {
      return {
        status: "error",
        message: "Gmail addresses cannot contain consecutive dots",
      }
    }
    validationResults.push("✅ No consecutive dots")

    // 5. Cannot start or end with dots
    if (localPart.startsWith(".") || localPart.endsWith(".")) {
      return {
        status: "error",
        message: "Gmail addresses cannot start or end with dots",
      }
    }
    validationResults.push("✅ Dot placement valid")

    // 6. Check for common invalid patterns
    const invalidPatterns = [
      { pattern: /^test/i, reason: "starts with 'test'" },
      { pattern: /^fake/i, reason: "starts with 'fake'" },
      { pattern: /^spam/i, reason: "starts with 'spam'" },
      { pattern: /^noreply/i, reason: "starts with 'noreply'" },
      { pattern: /^admin$/i, reason: "is 'admin'" },
      { pattern: /^root$/i, reason: "is 'root'" },
      { pattern: /^[0-9]+$/, reason: "is only numbers" },
    ]

    for (const { pattern, reason } of invalidPatterns) {
      if (pattern.test(localPart)) {
        return {
          status: "error",
          message: `Gmail address appears invalid - ${reason}`,
        }
      }
    }
    validationResults.push("✅ No invalid patterns")

    // 7. Check for realistic name patterns
    const hasRealisticPattern =
      /^[a-z]+\.[a-z]+$/i.test(localPart) || // firstname.lastname
      /^[a-z]+[0-9]{1,4}$/i.test(localPart) || // name with numbers
      /^[a-z]{3,}$/i.test(localPart) // simple name

    if (hasRealisticPattern) {
      validationResults.push("✅ Realistic pattern")
    }

    // 8. Try a simple HTTP check to Gmail (this won't verify existence but checks if Gmail is reachable)
    try {
      const response = await fetch("https://accounts.google.com/signin", {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        validationResults.push("✅ Gmail service reachable")
      }
    } catch (e) {
      validationResults.push("⚠️ Gmail service check failed")
    }

    // If all checks pass, we can't definitively say it exists, but it's syntactically valid
    return {
      status: "unknown",
      message: `Gmail format validation passed (${validationResults.length} checks). Existence couldn't be verified due to technical limitations. Checks: ${validationResults.join(", ")}`,
    }
  } catch (error) {
    return {
      status: "technical_error",
      message: `Alternative validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

// Enhanced version with retry logic and immediate fallback
export async function testGoogleSigninWithRetry(
  email: string,
  maxRetries = 1, // Reduced retries since we have good fallback
): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google sign-in test for: ${email} (max retries: ${maxRetries})`)

  // Check if we should skip Puppeteer entirely
  const skipPuppeteer = process.env.SKIP_PUPPETEER === "true" || process.env.VERCEL === "1"

  if (skipPuppeteer) {
    console.log("🔄 Skipping Puppeteer due to environment configuration")
    // return await alternativeGmailValidation(email)
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔐 Attempt ${attempt}/${maxRetries} for email: ${email}`)

    try {
      const result = await testGoogleSignin(email)
      console.log(`🔐 Attempt ${attempt} result:`, result)

      // If we get a clear success or error, return it
      if (result.status === "success" || result.status === "error") {
        console.log(`🔐 Definitive result on attempt ${attempt}: ${result.status}`)
        return result
      }

      // If technical error or unknown, try alternative validation
      if (result.status === "technical_error" || result.status === "unknown") {
        console.log(`🔐 Attempt ${attempt} had issues, trying alternative validation`)
        // return await alternativeGmailValidation(email)
      }

      // If unknown and we have retries left, try again
      if (attempt < maxRetries) {
        console.log(`🔐 Attempt ${attempt} returned unknown, retrying in 2 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        continue
      }

      return result
    } catch (error) {
      console.error(`🔐 Attempt ${attempt} failed with error:`, error)

      if (attempt < maxRetries) {
        console.log(`🔐 Retrying after error in 3 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 3000))
        continue
      }

      // Last attempt failed, use alternative validation
      console.log(`🔐 All attempts failed, using alternative validation`)
    //   return await alternativeGmailValidation(email)
    }
  }

  return { status: "technical_error", message: "Max retries exceeded" }
}
