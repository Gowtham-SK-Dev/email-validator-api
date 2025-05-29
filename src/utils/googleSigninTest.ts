import puppeteer from "puppeteer"

/**
 * ROBUST VERSION - With detailed error handling and anti-bot measures
 */
export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔐 Testing email: ${email}`)

  let browser: puppeteer.Browser | null = null
  let page: puppeteer.Page | null = null

  try {
    // Force clear any Chrome-related environment variables
    delete process.env.PUPPETEER_EXECUTABLE_PATH
    delete process.env.PUPPETEER_CACHE_DIR
    delete process.env.CHROME_BIN
    delete process.env.CHROMIUM_PATH

    console.log("🚀 Launching browser...")

    // Launch with minimal configuration
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
      ],
      ignoreHTTPSErrors: true,
    })

    console.log("✅ Browser launched successfully!")

    // Create a new page with increased timeouts
    page = await browser.newPage()

    // Set a realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    )

    // Set extra HTTP headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    })

    // Disable webdriver to avoid detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      })
    })

    console.log("🌐 Navigating to Google sign-in page...")

    // Navigate with longer timeout and wait for network to be idle
    await page.goto("https://accounts.google.com/signin/v2/identifier", {
      waitUntil: "networkidle2",
      timeout: 60000, // 60 seconds
    })

    console.log("📄 Page loaded, waiting for stability...")
    await page.waitForTimeout(3000) // Wait for any animations/scripts to complete

    // Take screenshot for debugging (optional)
    // await page.screenshot({ path: 'google-signin.png' });

    console.log("🔍 Looking for email input field...")

    // Try multiple selector strategies
    let emailInput = null
    const emailSelectors = ['input[type="email"]', "#identifierId", 'input[name="identifier"]', "input.whsOnd"]

    for (const selector of emailSelectors) {
      try {
        emailInput = await page.waitForSelector(selector, {
          visible: true,
          timeout: 5000,
        })
        if (emailInput) {
          console.log(`✅ Found email input with selector: ${selector}`)
          break
        }
      } catch (e) {
        console.log(`⚠️ Selector not found: ${selector}`)
      }
    }

    if (!emailInput) {
      throw new Error("Could not find email input field")
    }

    console.log("📝 Entering email...")

    // Clear field and type with human-like delays
    await emailInput.click({ clickCount: 3 }) // Select all text
    await emailInput.type(email, { delay: 100 }) // Type with delay

    console.log("👆 Looking for Next button...")

    // Try multiple next button selectors
    let nextButton = null
    const nextButtonSelectors = [
      "#identifierNext",
      'button[jsname="LgbsSe"]',
      'div[jsname="Njthtb"]',
      'button[type="submit"]',
      "div.VfPpkd-RLmnJb",
    ]

    for (const selector of nextButtonSelectors) {
      try {
        nextButton = await page.waitForSelector(selector, {
          visible: true,
          timeout: 5000,
        })
        if (nextButton) {
          console.log(`✅ Found next button with selector: ${selector}`)
          break
        }
      } catch (e) {
        console.log(`⚠️ Next button selector not found: ${selector}`)
      }
    }

    if (!nextButton) {
      throw new Error("Could not find Next button")
    }

    console.log("👆 Clicking Next button...")
    await nextButton.click()

    // Wait for navigation to complete
    console.log("⏳ Waiting for response...")
    await page.waitForTimeout(5000)

    // Get current URL for analysis
    const currentUrl = page.url()
    console.log(`📍 Current URL: ${currentUrl}`)

    // Check for success indicators in URL
    if (
      currentUrl.includes("challenge/pwd") ||
      currentUrl.includes("challenge/password") ||
      currentUrl.includes("signin/v2/challenge") ||
      currentUrl.includes("signin/challenge") ||
      currentUrl.includes("signin/v2/sl/pwd")
    ) {
      console.log("✅ Success: Email exists!")
      return { status: "success", message: "Email exists - reached password step" }
    }

    // Check for account selection page
    if (currentUrl.includes("accountchooser") || currentUrl.includes("ListAccounts")) {
      console.log("✅ Success: Email exists (account selection page)")
      return { status: "success", message: "Email exists - reached account selection" }
    }

    // Check for error messages if still on identifier page
    if (currentUrl.includes("identifier")) {
      console.log("⚠️ Still on identifier page, checking for errors...")

      // Wait for error messages to appear
      await page.waitForTimeout(2000)

      // Check for error elements
      const errorSelectors = [
        'div[aria-live="polite"]',
        'div[jsname="B34EJ"]',
        ".o6cuMc",
        ".Ekjuhf",
        '[role="alert"]',
        ".LXRPh",
      ]

      for (const selector of errorSelectors) {
        try {
          const errorElement = await page.$(selector)
          if (errorElement) {
            const errorText = await page.evaluate((el) => el.textContent?.trim(), errorElement)
            if (errorText && errorText.length > 0) {
              console.log(`❌ Found error: ${errorText}`)
              return { status: "error", message: errorText }
            }
          }
        } catch (e) {
          // Continue checking other selectors
        }
      }

      // Check page content for error indicators
      const pageText = await page.evaluate(() => document.body.innerText.toLowerCase())
      if (
        pageText.includes("couldn't find") ||
        pageText.includes("doesn't exist") ||
        pageText.includes("invalid") ||
        pageText.includes("enter a valid email")
      ) {
        console.log("❌ Found error indicators in page text")
        return { status: "error", message: "Email appears to be invalid" }
      }

      console.log("❌ No specific error found but remained on identifier page")
      return { status: "error", message: "Email appears to be invalid - remained on identifier page" }
    }

    // Check for password input as alternative success indicator
    try {
      const passwordInput = await page.$('input[type="password"]')
      if (passwordInput) {
        console.log("✅ Success: Found password input!")
        return { status: "success", message: "Email exists - password input found" }
      }
    } catch (e) {
      // No password input found
    }

    // If we reach here, result is unclear
    console.log("❓ Could not determine result definitively")
    return {
      status: "technical_error",
      message: `Could not determine email validity. Current URL: ${currentUrl}`,
    }
  } catch (error) {
    console.error("💥 Error:", error)

    // Provide detailed error message
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    // Handle specific error types
    if (errorMessage.includes("Navigation timeout")) {
      return {
        status: "technical_error",
        message: "Page load timeout - Google may be blocking automated access",
      }
    }

    if (errorMessage.includes("net::ERR_")) {
      return {
        status: "technical_error",
        message: "Network error - check internet connection",
      }
    }

    return {
      status: "technical_error",
      message: `Error: ${errorMessage}`,
    }
  } finally {
    // Always cleanup resources
    try {
      if (page) await page.close().catch(() => {})
      if (browser) await browser.close().catch(() => {})
    } catch (e) {
      console.warn("⚠️ Cleanup error:", e)
    }
  }
}

/**
 * Enhanced retry logic with better error handling
 */
export async function testGoogleSigninWithRetry(
  email: string,
  maxRetries = 3,
): Promise<{ status: string; message: string }> {
  console.log(`🔄 Starting email check with ${maxRetries} retries: ${email}`)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔄 Attempt ${attempt}/${maxRetries}`)

    try {
      const result = await testGoogleSignin(email)

      // If we got a definitive result, return it
      if (result.status === "success" || result.status === "error") {
        return result
      }

      // If technical error and we have retries left, try again
      if (result.status === "technical_error" && attempt < maxRetries) {
        // Exponential backoff
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000)
        console.log(`⏳ Technical error, waiting ${delay}ms before retry...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      // Return the result if it's the last attempt
      return result
    } catch (error) {
      console.error(`💥 Attempt ${attempt} failed with error:`, error)

      if (attempt < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000)
        console.log(`⏳ Error caught, waiting ${delay}ms before retry...`)
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
    message: "Max retries exceeded without definitive result",
  }
}
