import puppeteer from "puppeteer"

/**
 * Google email existence check - NO PASSWORD REQUIRED
 * Only checks if email is accepted by Google's sign-in page
 */
export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google email existence check for: ${email}`)

  let browser: puppeteer.Browser | null = null
  let page: puppeteer.Page | null = null

  try {
    // FORCE USE OF BUNDLED CHROMIUM - No Chrome installation needed
    console.log("🚀 Launching browser with bundled Chromium...")

    // Clear any problematic environment variables
    delete process.env.PUPPETEER_EXECUTABLE_PATH
    delete process.env.PUPPETEER_CACHE_DIR

    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--no-first-run",
        "--disable-extensions",
        "--disable-images",
        "--window-size=1280,720",
      ],
      // CRITICAL: No executablePath - forces bundled Chromium
    })

    page = await browser.newPage()

    // Set realistic user agent to avoid detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )

    console.log("🌐 Navigating to Google sign-in page...")
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
    const emailInput = await page.waitForSelector('#identifierId, input[type="email"]', {
      visible: true,
      timeout: 10000,
    })

    if (!emailInput) {
      console.log("❌ Could not find email input field")
      return {
        status: "technical_error",
        message: "Could not find email input field on Google sign-in page",
      }
    }

    // Enter email address only
    console.log(`📝 Entering email: ${email}`)
    await emailInput.click({ clickCount: 3 }) // Select all existing text
    await emailInput.type(email, { delay: 100 }) // Type email slowly

    // Wait for input to register
    await page.waitForTimeout(1500)

    console.log("🔍 Looking for Next button...")
    const nextButton = await page.waitForSelector('#identifierNext, button[type="submit"]', {
      visible: true,
      timeout: 5000,
    })

    if (!nextButton) {
      console.log("❌ Could not find Next button")
      return {
        status: "technical_error",
        message: "Could not find Next button",
      }
    }

    console.log("👆 Clicking Next button...")
    await nextButton.click()

    // Wait for Google's response
    console.log("⏳ Waiting for Google's response...")
    await page.waitForTimeout(5000)

    // Get current URL to analyze Google's response
    const currentUrl = page.url()
    console.log(`📍 Current URL: ${currentUrl}`)

    // SUCCESS CASES - Email exists and is valid
    if (
      currentUrl.includes("signin/v2/challenge/pwd") ||
      currentUrl.includes("signin/v2/sl/pwd") ||
      currentUrl.includes("challenge/password") ||
      currentUrl.includes("signin/challenge")
    ) {
      console.log("✅ SUCCESS: Google accepted the email - proceeding to password page")
      return {
        status: "success",
        message: "Email exists - Google accepted it and is asking for password",
      }
    }

    // SUCCESS CASES - Other challenge pages (2FA, phone verification, etc.)
    if (
      currentUrl.includes("challenge/") ||
      currentUrl.includes("signin/v2/challenge/") ||
      currentUrl.includes("verification")
    ) {
      console.log("✅ SUCCESS: Google accepted the email - showing security challenge")
      return {
        status: "success",
        message: "Email exists - Google is asking for additional verification",
      }
    }

    // SUCCESS CASES - Account selection page
    if (currentUrl.includes("accountchooser") || currentUrl.includes("ListAccounts")) {
      console.log("✅ SUCCESS: Google accepted the email - showing account selection")
      return {
        status: "success",
        message: "Email exists - Google is showing account selection",
      }
    }

    // ERROR CASES - Still on identifier page means email was rejected
    if (currentUrl.includes("signin/identifier") || currentUrl.includes("signin/v2/identifier")) {
      console.log("⚠️ Still on identifier page - checking for error messages...")

      // Wait a bit more for error messages to appear
      await page.waitForTimeout(3000)

      // Check for specific error elements
      const errorElement = await page.$('div[jsname="B34EJ"], .o6cuMc, .Ekjuhf, [role="alert"], .LXRPh')
      if (errorElement) {
        const errorText = await page.evaluate((el) => el.textContent?.trim(), errorElement)
        if (errorText && errorText.length > 0) {
          console.log(`❌ REJECTED: Google showed error - ${errorText}`)
          return {
            status: "error",
            message: `Email rejected by Google: ${errorText}`,
          }
        }
      }

      // Check page content for error indicators
      try {
        const pageText = await page.evaluate(() => document.body.innerText.toLowerCase())

        if (
          pageText.includes("couldn't find") ||
          pageText.includes("doesn't exist") ||
          pageText.includes("invalid") ||
          pageText.includes("enter a valid email") ||
          pageText.includes("not found")
        ) {
          console.log("❌ REJECTED: Found error indicators in page content")
          return {
            status: "error",
            message: "Email rejected - Google indicates it doesn't exist or is invalid",
          }
        }
      } catch (error) {
        console.log("⚠️ Could not analyze page text")
      }

      console.log("❌ REJECTED: No error message but remained on identifier page")
      return {
        status: "error",
        message: "Email appears to be invalid - Google did not accept it",
      }
    }

    // Alternative success detection - check if password input exists
    try {
      const passwordInput = await page.$('input[type="password"]')
      if (passwordInput) {
        console.log("✅ SUCCESS: Found password input - email was accepted")
        return {
          status: "success",
          message: "Email exists - Google is asking for password",
        }
      }
    } catch (error) {
      // No password input found
    }

    // If we reach here, result is unclear
    console.log("❓ UNCLEAR: Could not determine result definitively")
    return {
      status: "technical_error",
      message: `Could not determine email validity. Current URL: ${currentUrl}`,
    }
  } catch (error) {
    console.error("💥 Google email check failed:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    // Provide helpful error messages
    if (errorMessage.includes("Navigation timeout")) {
      return {
        status: "technical_error",
        message: "Page load timeout - please check internet connection",
      }
    }

    if (errorMessage.includes("net::ERR_")) {
      return {
        status: "technical_error",
        message: "Network error - please check internet connection",
      }
    }

    return {
      status: "technical_error",
      message: `Email check failed: ${errorMessage}`,
    }
  } finally {
    // Always cleanup browser resources
    try {
      if (page) {
        await page.close().catch(() => {})
      }
      if (browser) {
        await browser.close().catch(() => {})
      }
    } catch (cleanupError) {
      console.warn("⚠️ Error during cleanup:", cleanupError)
    }
  }
}

/**
 * Enhanced version with retry logic for better reliability
 */
export async function testGoogleSigninWithRetry(
  email: string,
  maxRetries = 2,
): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google email check with retry for: ${email} (max retries: ${maxRetries})`)

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
