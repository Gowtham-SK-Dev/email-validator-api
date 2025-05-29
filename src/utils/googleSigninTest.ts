import puppeteer from "puppeteer"

export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google sign-in test for: ${email}`)

  let browser
  try {
    // Launch browser with optimized configuration
    browser = await puppeteer.launch({
      headless: "new",
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
        "--disable-javascript-harmony-shipping",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--window-size=1280,720",
      ],
      defaultViewport: { width: 1280, height: 720 },
    })

    const page = await browser.newPage()

    // Set realistic user agent and headers
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    })

    // Remove webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      })
    })

    console.log(`🔐 Navigating to Google sign-in page...`)

    // Navigate to Google sign-in page
    await page.goto(
      "https://accounts.google.com/v3/signin/identifier?authuser=0&continue=https%3A%2F%2Fmyaccount.google.com%2F&ec=GAlAwAE&hl=en&service=accountsettings&flowName=GlifWebSignIn&flowEntry=AddSession",
      { waitUntil: "networkidle0", timeout: 30000 },
    )

    // Wait for page to stabilize
    await page.waitForTimeout(3000)

    // Find email input field
    console.log(`🔐 Looking for email input field...`)

    let emailInput
    try {
      // Wait for the email input to be visible and interactable
      emailInput = await page.waitForSelector("#identifierId", {
        visible: true,
        timeout: 10000,
      })
    } catch (error) {
      console.log("❌ Could not find email input field")
      await browser.close()
      return { status: "technical_error", message: "Could not find email input field on Google sign-in page" }
    }

    // Clear and enter email
    console.log(`🔐 Entering email: ${email}`)
    await emailInput.click({ clickCount: 3 }) // Select all existing text
    await emailInput.type(email, { delay: 50 })

    // Wait a moment for the input to register
    await page.waitForTimeout(1000)

    // Find and click Next button
    console.log(`🔐 Looking for Next button...`)

    let nextButton
    try {
      // Wait for Next button to be clickable
      nextButton = await page.waitForSelector("#identifierNext", {
        visible: true,
        timeout: 5000,
      })
    } catch (error) {
      console.log("❌ Could not find Next button")
      await browser.close()
      return { status: "technical_error", message: "Could not find Next button" }
    }

    console.log(`🔐 Clicking Next button...`)
    await nextButton.click()

    // Wait for page response
    console.log(`🔐 Waiting for page response...`)
    await page.waitForTimeout(5000)

    // Check current URL first
    const currentUrl = page.url()
    console.log(`🔐 Current URL: ${currentUrl}`)

    // Check if we're on password page (success)
    if (
      currentUrl.includes("signin/v2/challenge/pwd") ||
      currentUrl.includes("signin/v2/sl/pwd") ||
      currentUrl.includes("challenge/password")
    ) {
      console.log(`🔐 ✅ Reached password page - email exists!`)
      await browser.close()
      return { status: "success", message: "Email exists - reached password step" }
    }

    // Check if still on identifier page (likely invalid email)
    if (currentUrl.includes("signin/identifier") || currentUrl.includes("signin/v2/identifier")) {
      // Look for error messages
      console.log(`🔐 Still on identifier page, checking for errors...`)

      try {
        // Wait a bit more for error messages to appear
        await page.waitForTimeout(2000)

        // Check for error elements
        const errorSelectors = ['div[jsname="B34EJ"]', ".o6cuMc", ".Ekjuhf", ".dEOOab", '[role="alert"]']

        for (const selector of errorSelectors) {
          const errorElement = await page.$(selector)
          if (errorElement) {
            const errorText = await page.evaluate((el) => el.textContent?.trim(), errorElement)
            if (errorText && errorText.length > 0) {
              console.log(`🔐 ❌ Found error: ${errorText}`)
              await browser.close()
              return { status: "error", message: errorText }
            }
          }
        }

        // If no specific error found but still on identifier page
        console.log(`🔐 ❌ No error message found but still on identifier page`)
        await browser.close()
        return { status: "error", message: "Email appears to be invalid - remained on identifier page" }
      } catch (error) {
        console.log(`🔐 ❌ Error while checking for error messages: ${error}`)
        await browser.close()
        return { status: "error", message: "Email appears to be invalid" }
      }
    }

    // Check for other challenge pages (2FA, phone verification, etc.)
    if (currentUrl.includes("challenge/") || currentUrl.includes("signin/v2/challenge/")) {
      console.log(`🔐 ✅ Reached challenge page - email exists but has additional security`)
      await browser.close()
      return { status: "success", message: "Email exists - reached security challenge" }
    }

    // Check for account selection page
    if (currentUrl.includes("accountchooser") || currentUrl.includes("ListAccounts")) {
      console.log(`🔐 ✅ Reached account selection - email exists`)
      await browser.close()
      return { status: "success", message: "Email exists - reached account selection" }
    }

    // If we reach here, check page content for clues
    console.log(`🔐 Checking page content for validation clues...`)

    try {
      // Check if password input exists (another way to detect success)
      const passwordInput = await page.$('input[type="password"]')
      if (passwordInput) {
        console.log(`🔐 ✅ Found password input - email exists!`)
        await browser.close()
        return { status: "success", message: "Email exists - password input found" }
      }

      // Check page text for error indicators
      const pageText = await page.evaluate(() => document.body.innerText.toLowerCase())

      if (
        pageText.includes("couldn't find") ||
        pageText.includes("doesn't exist") ||
        pageText.includes("invalid") ||
        pageText.includes("enter a valid email")
      ) {
        console.log(`🔐 ❌ Found error in page text`)
        await browser.close()
        return { status: "error", message: "Email appears to be invalid based on page content" }
      }
    } catch (error) {
      console.log(`🔐 Error checking page content: ${error}`)
    }

    // If we can't determine the result, it's likely a technical issue
    console.log(`🔐 ❓ Could not determine result definitively`)
    await browser.close()
    return {
      status: "technical_error",
      message: `Could not determine email validity. URL: ${currentUrl}`,
    }
  } catch (error) {
    console.error(`🔐 💥 Google sign-in test error:`, error)
    if (browser) {
      await browser.close().catch((e) => console.error("Error closing browser:", e))
    }
    return {
      status: "technical_error",
      message: `Puppeteer error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

// Enhanced version with retry logic
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
        console.log(`🔐 Technical error on attempt ${attempt}, retrying in 3 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 3000))
        continue
      }

      // Return the result if it's the last attempt
      return result
    } catch (error) {
      console.error(`🔐 Attempt ${attempt} failed with error:`, error)

      if (attempt < maxRetries) {
        console.log(`🔐 Retrying after error in 3 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 3000))
        continue
      }

      return {
        status: "technical_error",
        message: `All attempts failed. Last error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
  }

  return { status: "technical_error", message: "Max retries exceeded" }
}

// Alternative Gmail validation (simplified - only for format checking)
async function alternativeGmailValidation(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔄 Using alternative Gmail validation for: ${email}`)

  if (!email.endsWith("@gmail.com")) {
    return {
      status: "error",
      message: "Not a Gmail address",
    }
  }

  const localPart = email.split("@")[0]

  // Basic Gmail format validation
  if (localPart.length < 6 || localPart.length > 30) {
    return {
      status: "error",
      message: "Gmail addresses must be between 6-30 characters",
    }
  }

  if (!/^[a-z0-9._]+$/i.test(localPart)) {
    return {
      status: "error",
      message: "Gmail addresses can only contain letters, numbers, dots, and underscores",
    }
  }

  if (localPart.includes("..") || localPart.startsWith(".") || localPart.endsWith(".")) {
    return {
      status: "error",
      message: "Invalid dot placement in Gmail address",
    }
  }

  // If format is valid but we can't verify existence
  return {
    status: "unknown",
    message: "Gmail format is valid but existence could not be verified",
  }
}
