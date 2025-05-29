import puppeteer from "puppeteer"
import fs from "fs"
import path from "path"

/**
 * Load Chrome configuration with comprehensive validation and fallbacks
 */
async function loadChromeConfig() {
  const configPath = path.join(process.cwd(), "puppeteer-config.json")

  // Step 1: Validate environment variable
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH
    console.log(`🔍 Checking PUPPETEER_EXECUTABLE_PATH: ${envPath}`)

    // Check for placeholder or invalid paths
    const invalidPaths = ["/path/to/chrome", "/path/to/chromium", "path/to/chrome", "C:\\path\\to\\chrome.exe"]

    if (invalidPaths.includes(envPath) || envPath.includes("placeholder") || envPath.includes("/path/to/")) {
      console.warn("⚠️ PUPPETEER_EXECUTABLE_PATH contains placeholder value, ignoring it")
      delete process.env.PUPPETEER_EXECUTABLE_PATH
    } else if (!fs.existsSync(envPath)) {
      console.warn(`⚠️ PUPPETEER_EXECUTABLE_PATH path doesn't exist: ${envPath}`)
      delete process.env.PUPPETEER_EXECUTABLE_PATH
    } else {
      console.log("✅ Using valid PUPPETEER_EXECUTABLE_PATH")
      return {
        headless: "new" as const,
        executablePath: envPath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
          "--no-first-run",
          "--disable-extensions",
          "--disable-plugins",
          "--disable-images",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--window-size=1280,720",
        ],
        defaultViewport: { width: 1280, height: 720 },
      }
    }
  }

  // Step 2: Try to load saved configuration
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"))
      console.log("✅ Using saved Chrome configuration")

      // Validate the saved executable path
      if (config.executablePath && !fs.existsSync(config.executablePath)) {
        console.warn("⚠️ Saved executable path is invalid, removing it")
        delete config.executablePath
      }

      return config
    } catch (error) {
      console.warn("⚠️ Could not load saved config, using auto-detection")
    }
  }

  // Step 3: Auto-detect and configure Chrome
  console.log("🔧 Auto-detecting Chrome configuration...")
  try {
    const { PuppeteerChromeManager } = await import("./puppeteer-setup")
    const chromeManager = new PuppeteerChromeManager()
    const config = await chromeManager.getChromeConfig()

    // Save the config for future use
    await chromeManager.saveConfig(config)

    return config
  } catch (error) {
    console.warn("⚠️ Auto-detection failed, using fallback config")
  }

  // Step 4: Fallback configuration (uses bundled Chromium)
  console.log("🔄 Using fallback configuration with bundled Chromium")

  // Explicitly unset any problematic environment variables
  delete process.env.PUPPETEER_EXECUTABLE_PATH
  delete process.env.PUPPETEER_CACHE_DIR

  return {
    headless: "new" as const,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--no-first-run",
      "--disable-extensions",
      "--disable-plugins",
      "--disable-images",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--window-size=1280,720",
      "--single-process",
      "--no-zygote",
      "--disable-gpu",
      "--disable-software-rasterizer",
    ],
    defaultViewport: { width: 1280, height: 720 },
    // Explicitly don't set executablePath to force bundled Chromium
  }
}

/**
 * Enhanced Google sign-in test with comprehensive error handling
 */
export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google sign-in test for: ${email}`)

  let browser: puppeteer.Browser | null = null
  let page: puppeteer.Page | null = null

  try {
    // Load Chrome configuration with all validations
    const chromeConfig = await loadChromeConfig()
    console.log(`🔧 Using Chrome: ${chromeConfig.executablePath ? "Custom installation" : "Bundled Chromium"}`)

    // Launch browser with timeout
    console.log("🚀 Launching browser...")
    browser = await puppeteer.launch({
      ...chromeConfig,
      timeout: 30000, // 30 second timeout for launch
    })

    page = await browser.newPage()

    // Set realistic user agent and headers to avoid detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    })

    // Remove webdriver property to avoid detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      })
    })

    console.log("🌐 Navigating to Google sign-in page...")

    // Navigate to Google sign-in page with specific parameters
    await page.goto(
      "https://accounts.google.com/v3/signin/identifier?authuser=0&continue=https%3A%2F%2Fmyaccount.google.com%2F&ec=GAlAwAE&hl=en&service=accountsettings&flowName=GlifWebSignIn&flowEntry=AddSession",
      {
        waitUntil: "networkidle0",
        timeout: 30000,
      },
    )

    // Wait for page to stabilize
    await page.waitForTimeout(2000)

    console.log("🔍 Looking for email input field...")

    // Find email input field with multiple selectors
    const emailSelectors = ["#identifierId", 'input[type="email"]', 'input[name="identifier"]']
    let emailInput: puppeteer.ElementHandle | null = null

    for (const selector of emailSelectors) {
      try {
        emailInput = await page.waitForSelector(selector, {
          visible: true,
          timeout: 10000,
        })
        if (emailInput) {
          console.log(`✅ Found email input with selector: ${selector}`)
          break
        }
      } catch (error) {
        console.log(`⚠️ Selector ${selector} not found, trying next...`)
      }
    }

    if (!emailInput) {
      console.log("❌ Could not find email input field")
      return {
        status: "technical_error",
        message: "Could not find email input field on Google sign-in page",
      }
    }

    // Clear and enter email
    console.log(`📝 Entering email: ${email}`)
    await emailInput.click({ clickCount: 3 }) // Select all existing text
    await emailInput.type(email, { delay: 100 }) // Slower typing to appear more human

    // Wait for input to register
    await page.waitForTimeout(1500)

    console.log("🔍 Looking for Next button...")

    // Find and click Next button with multiple selectors
    const nextSelectors = ["#identifierNext", 'button[type="submit"]', "[data-primary-action-label]"]
    let nextButton: puppeteer.ElementHandle | null = null

    for (const selector of nextSelectors) {
      try {
        nextButton = await page.waitForSelector(selector, {
          visible: true,
          timeout: 5000,
        })
        if (nextButton) {
          console.log(`✅ Found Next button with selector: ${selector}`)
          break
        }
      } catch (error) {
        console.log(`⚠️ Next button selector ${selector} not found, trying next...`)
      }
    }

    if (!nextButton) {
      console.log("❌ Could not find Next button")
      return {
        status: "technical_error",
        message: "Could not find Next button",
      }
    }

    console.log("👆 Clicking Next button...")
    await nextButton.click()

    // Wait for page response with longer timeout
    console.log("⏳ Waiting for page response...")
    await page.waitForTimeout(5000)

    // Get current URL for analysis
    const currentUrl = page.url()
    console.log(`📍 Current URL: ${currentUrl}`)

    // Analyze the result based on URL and page content
    if (
      currentUrl.includes("signin/v2/challenge/pwd") ||
      currentUrl.includes("signin/v2/sl/pwd") ||
      currentUrl.includes("challenge/password") ||
      currentUrl.includes("signin/challenge")
    ) {
      console.log("✅ Success: Reached password page - email exists!")
      return {
        status: "success",
        message: "Email exists - reached password step",
      }
    }

    // Check for other challenge pages (2FA, phone verification, etc.)
    if (
      currentUrl.includes("challenge/") ||
      currentUrl.includes("signin/v2/challenge/") ||
      currentUrl.includes("verification")
    ) {
      console.log("✅ Success: Reached challenge page - email exists with additional security")
      return {
        status: "success",
        message: "Email exists - reached security challenge",
      }
    }

    // Check for account selection page
    if (currentUrl.includes("accountchooser") || currentUrl.includes("ListAccounts")) {
      console.log("✅ Success: Reached account selection - email exists")
      return {
        status: "success",
        message: "Email exists - reached account selection",
      }
    }

    // If still on identifier page, check for errors
    if (currentUrl.includes("signin/identifier") || currentUrl.includes("signin/v2/identifier")) {
      console.log("⚠️ Still on identifier page, checking for errors...")

      // Wait a bit more for error messages to appear
      await page.waitForTimeout(3000)

      // Check for error elements with multiple selectors
      const errorSelectors = [
        'div[jsname="B34EJ"]',
        ".o6cuMc",
        ".Ekjuhf",
        ".dEOOab",
        '[role="alert"]',
        ".LXRPh",
        '[data-error="true"]',
      ]

      for (const selector of errorSelectors) {
        try {
          const errorElement = await page.$(selector)
          if (errorElement) {
            const errorText = await page.evaluate((el) => el.textContent?.trim(), errorElement)
            if (errorText && errorText.length > 0) {
              console.log(`❌ Found error: ${errorText}`)
              return {
                status: "error",
                message: errorText,
              }
            }
          }
        } catch (error) {
          // Continue checking other selectors
        }
      }

      // Check page text for error indicators
      try {
        const pageText = await page.evaluate(() => document.body.innerText.toLowerCase())

        if (
          pageText.includes("couldn't find") ||
          pageText.includes("doesn't exist") ||
          pageText.includes("invalid") ||
          pageText.includes("enter a valid email") ||
          pageText.includes("not found")
        ) {
          console.log("❌ Found error indicators in page text")
          return {
            status: "error",
            message: "Email appears to be invalid based on page content",
          }
        }
      } catch (error) {
        console.log("⚠️ Could not analyze page text")
      }

      console.log("❌ No error message found but still on identifier page")
      return {
        status: "error",
        message: "Email appears to be invalid - remained on identifier page",
      }
    }

    // Check if password input exists (alternative success detection)
    try {
      const passwordInput = await page.$('input[type="password"]')
      if (passwordInput) {
        console.log("✅ Success: Found password input - email exists!")
        return {
          status: "success",
          message: "Email exists - password input found",
        }
      }
    } catch (error) {
      // No password input found
    }

    // If we reach here, result is unclear
    console.log("❓ Could not determine result definitively")
    return {
      status: "technical_error",
      message: `Could not determine email validity. Current URL: ${currentUrl}`,
    }
  } catch (error) {
    console.error("💥 Google sign-in test error:", error)

    // Provide specific error handling for common issues
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    if (
      errorMessage.includes("Could not find expected browser") ||
      errorMessage.includes("Tried to find the browser at the configured path") ||
      errorMessage.includes("Failed to launch the browser")
    ) {
      return {
        status: "technical_error",
        message:
          "Chrome browser not found. Please run the setup script or remove PUPPETEER_EXECUTABLE_PATH environment variable.",
      }
    }

    if (errorMessage.includes("Navigation timeout")) {
      return {
        status: "technical_error",
        message: "Page load timeout. Please check your internet connection.",
      }
    }

    if (errorMessage.includes("net::ERR_")) {
      return {
        status: "technical_error",
        message: "Network error. Please check your internet connection.",
      }
    }

    return {
      status: "technical_error",
      message: `Puppeteer error: ${errorMessage}`,
    }
  } finally {
    // Cleanup resources
    try {
      if (page) {
        await page.close()
      }
      if (browser) {
        await browser.close()
      }
    } catch (cleanupError) {
      console.warn("⚠️ Error during cleanup:", cleanupError)
    }
  }
}

/**
 * Enhanced version with retry logic and exponential backoff
 */
export async function testGoogleSigninWithRetry(
  email: string,
  maxRetries = 2,
): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google sign-in test with retry for: ${email} (max retries: ${maxRetries})`)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔐 Attempt ${attempt}/${maxRetries} for email: ${email}`)

    try {
      const result = await testGoogleSignin(email)
      console.log(`🔐 Attempt ${attempt} result:`, result)

      // If we get a definitive result (success or error), return it
      if (result.status === "success" || result.status === "error") {
        console.log(`🔐 Definitive result on attempt ${attempt}: ${result.status}`)
        return result
      }

      // If technical error and we have retries left, try again
      if (result.status === "technical_error" && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000) // Exponential backoff, max 5s
        console.log(`🔐 Technical error on attempt ${attempt}, retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      // Return the result if it's the last attempt
      return result
    } catch (error) {
      console.error(`🔐 Attempt ${attempt} failed with error:`, error)

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        console.log(`🔐 Retrying after error in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      return {
        status: "technical_error",
        message: `All attempts failed. Last error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
  }

  return {
    status: "technical_error",
    message: "Max retries exceeded",
  }
}

/**
 * Batch test multiple emails with rate limiting
 */
export async function testMultipleEmails(
  emails: string[],
  delayBetweenTests = 2000,
): Promise<Array<{ email: string; result: { status: string; message: string } }>> {
  console.log(`🔐 Testing ${emails.length} emails with ${delayBetweenTests}ms delay between tests`)

  const results = []

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i]
    console.log(`🔐 Testing email ${i + 1}/${emails.length}: ${email}`)

    const result = await testGoogleSigninWithRetry(email)
    results.push({ email, result })

    // Add delay between tests to avoid rate limiting
    if (i < emails.length - 1) {
      console.log(`⏳ Waiting ${delayBetweenTests}ms before next test...`)
      await new Promise((resolve) => setTimeout(resolve, delayBetweenTests))
    }
  }

  return results
}
