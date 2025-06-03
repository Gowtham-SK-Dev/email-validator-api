// Netlify/Serverless Chrome support note:
// Netlify does not support installing Chrome via `npx puppeteer browsers install chrome` at build/runtime.
// You must use a serverless-compatible Chromium binary and set the executable path for Puppeteer.

import puppeteer from "puppeteer"
import { findChromeExecutable } from "./puppeteer-setup"

const isNetlify = !!process.env.NETLIFY

export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google sign-in test for: ${email}`)

  let browser
  let page
  try {
    let chromePath = findChromeExecutable()
    const launchOptions: any = {
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-field-trial-config",
        "--disable-back-forward-cache",
        "--disable-ipc-flooding-protection",
        "--window-size=1280,800",
        "--disable-blink-features=AutomationControlled",
        "--disable-extensions",
        "--disable-plugins",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--hide-scrollbars",
        "--mute-audio",
        "--no-default-browser-check",
        "--no-pings",
      ],
    }

    // Netlify: Use a serverless Chromium binary if available
    if (isNetlify) {
      chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium-browser"
      launchOptions.executablePath = chromePath
    } else if (chromePath) {
      launchOptions.executablePath = chromePath
    }

    console.log(`🔐 Launching browser...`)
    browser = await puppeteer.launch(launchOptions)

    console.log(`🔐 Creating new page...`)
    page = await browser.newPage()

    // Set user agent before any navigation
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )

    // Set viewport
    await page.setViewport({
      width: 1280,
      height: 800,
    })

    // Add script to remove automation indicators
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      })

      // Clear storage
      try {
        localStorage.clear()
        sessionStorage.clear()
      } catch (e) {
        // Ignore errors
      }
    })

    // Wait a bit to ensure page is ready
    await new Promise((resolve) => setTimeout(resolve, 1000))

    console.log(`🔐 Navigating to Google sign-in page...`)

    // Navigate with robust error handling
    let navigationSuccess = false
    let navigationError = null

    try {
      const response = await page.goto(
        "https://accounts.google.com/signin/v2/identifier?flowName=GlifWebSignIn&flowEntry=ServiceLogin",
        {
          waitUntil: ["domcontentloaded"],
          timeout: 30000,
        },
      )

      if (response && response.ok()) {
        navigationSuccess = true
        console.log(`🔐 Navigation successful`)
      } else {
        navigationError = `HTTP ${response?.status()} - ${response?.statusText()}`
      }
    } catch (navError) {
      navigationError = navError instanceof Error ? navError.message : "Unknown navigation error"
      console.error("🔐 Navigation failed:", navigationError)
    }

    if (!navigationSuccess) {
      await browser.close()
      return {
        status: "technical_error",
        message: `Failed to load Google sign-in page: ${navigationError}`,
      }
    }

    // Wait for page to stabilize after navigation
    await new Promise((resolve) => setTimeout(resolve, 3000))

    console.log(`🔐 Looking for email input field...`)

    // Wait for and find email input with multiple attempts
    const emailSelectors = [
      'input[type="email"]',
      'input[id="identifierId"]',
      'input[name="identifier"]',
      "#identifierId",
    ]

    let emailInput = null
    let inputFound = false

    for (let attempt = 0; attempt < 3 && !inputFound; attempt++) {
      console.log(`🔐 Email input search attempt ${attempt + 1}`)

      for (const selector of emailSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 })
          emailInput = await page.$(selector)
          if (emailInput) {
            const isVisible = await emailInput.isIntersectingViewport()
            if (isVisible) {
              console.log(`🔐 Found email input with selector: ${selector}`)
              inputFound = true
              break
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!inputFound) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    if (!emailInput || !inputFound) {
      await browser.close()
      return {
        status: "technical_error",
        message: "Could not find email input field on Google sign-in page",
      }
    }

    console.log(`🔐 Entering email address...`)

    // Clear and enter email
    try {
      await emailInput.click({ clickCount: 3 })
      await new Promise((resolve) => setTimeout(resolve, 200))
      await page.keyboard.press("Backspace")
      await new Promise((resolve) => setTimeout(resolve, 200))
      await emailInput.type(email, { delay: 50 })
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } catch (inputError) {
      await browser.close()
      return {
        status: "technical_error",
        message: `Failed to enter email: ${inputError instanceof Error ? inputError.message : "Unknown error"}`,
      }
    }

    console.log(`🔐 Looking for Next button...`)

    // Find and click Next button
    const nextButtonSelectors = [
      "#identifierNext",
      'button[jsname="LgbsSe"]',
      'button[type="button"]:not([disabled])',
      ".VfPpkd-LgbsSe",
    ]

    let nextButton = null
    let buttonFound = false

    for (const selector of nextButtonSelectors) {
      try {
        nextButton = await page.$(selector)
        if (nextButton) {
          const isVisible = await nextButton.isIntersectingViewport()
          const isEnabled = await page.evaluate((el: HTMLButtonElement) => !el.disabled, nextButton as any)

          if (isVisible && isEnabled) {
            console.log(`🔐 Found Next button with selector: ${selector}`)
            buttonFound = true
            break
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!nextButton || !buttonFound) {
      await browser.close()
      return {
        status: "technical_error",
        message: "Could not find Next button on Google sign-in page",
      }
    }

    console.log(`🔐 Clicking Next button...`)

    // Click Next button with error handling
    try {
      await nextButton.click()
      console.log(`🔐 Next button clicked successfully`)
    } catch (clickError) {
      try {
        await page.evaluate((button: HTMLElement) => button.click(), nextButton as any)
        console.log(`🔐 Next button clicked using evaluate method`)
      } catch (evalError) {
        await browser.close()
        return {
          status: "technical_error",
          message: `Failed to click Next button: ${evalError instanceof Error ? evalError.message : "Unknown error"}`,
        }
      }
    }

    // Wait for response
    console.log(`🔐 Waiting for response...`)
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Check for error messages
    const errorSelectors = [
      'div[jsname="B34EJ"]',
      ".o6cuMc",
      '[data-error="true"]',
      ".Ekjuhf",
      ".dEOOab",
      '[role="alert"]',
    ]

    let errorMessage = null
    for (const selector of errorSelectors) {
      try {
        const errorElement = await page.$(selector)
        if (errorElement) {
          errorMessage = await page.evaluate((el) => el.textContent?.trim(), errorElement)
          if (errorMessage && errorMessage.length > 0) {
            console.log(`🔐 Found error message: ${errorMessage}`)
            break
          }
        }
      } catch (e) {
        // Continue checking other selectors
      }
    }

    if (errorMessage) {
      await browser.close()
      return { status: "error", message: errorMessage }
    }

    // Check for password field (success indicator)
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      "#password",
      '[aria-label*="password" i]',
    ]

    let passwordFound = false
    for (const selector of passwordSelectors) {
      try {
        const passwordInput = await page.$(selector)
        if (passwordInput) {
          const isVisible = await passwordInput.isIntersectingViewport()
          if (isVisible) {
            passwordFound = true
            console.log(`🔐 Found password input - email is valid`)
            break
          }
        }
      } catch (e) {
        // Continue checking other selectors
      }
    }

    // Check for challenge/verification page by looking for specific elements instead of URL
    let isChallengePage = false
    try {
      const challengeSelectors = [
        "[data-challenge-id]",
        "[data-challenge-type]",
        ".challenge-page",
        '[aria-label*="verify" i]',
        '[aria-label*="challenge" i]',
      ]

      for (const selector of challengeSelectors) {
        const challengeElement = await page.$(selector)
        if (challengeElement) {
          isChallengePage = true
          console.log(`🔐 Found challenge page indicator`)
          break
        }
      }
    } catch (e) {
      // Ignore errors when checking for challenge page
    }

    await browser.close()

    if (passwordFound) {
      return {
        status: "success",
        message: "Email is valid (reached password step)",
      }
    }

    if (isChallengePage) {
      return {
        status: "success",
        message: "Email is valid (reached challenge/verification step)",
      }
    }

    return {
      status: "unknown",
      message: "Could not determine result - no error or password field found",
    }
  } catch (err: unknown) {
    console.error("🔐 Puppeteer error:", err)

    if (browser) {
      try {
        await browser.close()
      } catch (closeError) {
        console.error("Error closing browser:", closeError)
      }
    }

    // Handle specific error types
    const errorMessage = err instanceof Error ? err.message : "Unknown error"

    if (errorMessage.includes("Could not find Chrome") || errorMessage.includes("Executable doesn't exist")) {
      return {
        status: "chrome_not_found",
        message:
          "Chrome browser not found for Puppeteer. Please install Chrome or run `npx puppeteer browsers install chrome`.",
      }
    }

    if (errorMessage.includes("Navigation timeout") || errorMessage.includes("net::ERR_")) {
      return {
        status: "technical_error",
        message: "Network error: Could not connect to Google sign-in page",
      }
    }

    return {
      status: "technical_error",
      message: `Puppeteer error: ${errorMessage}`,
    }
  }
}

// Enhanced version with retry logic and better error handling
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

      // If Chrome not found, don't retry
      if (result.status === "chrome_not_found") {
        console.log(`🔐 Chrome not found - no point in retrying`)
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
export async function alternativeGmailValidation(email: string): Promise<{ status: string; message: string }> {
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

  // Check for common test patterns that are unlikely to be real
  if (
    /^test[0-9]*$/i.test(localPart) ||
    /^user[0-9]*$/i.test(localPart) ||
    /^example[0-9]*$/i.test(localPart) ||
    /^sample[0-9]*$/i.test(localPart) ||
    /^fake[0-9]*$/i.test(localPart) ||
    /^dummy[0-9]*$/i.test(localPart)
  ) {
    return {
      status: "error",
      message: "Gmail address appears to be a test account",
    }
  }

  // Check for keyboard patterns
  if (/qwerty/i.test(localPart) || /asdfg/i.test(localPart) || /12345/i.test(localPart) || /abcde/i.test(localPart)) {
    return {
      status: "error",
      message: "Gmail address contains keyboard pattern",
    }
  }

  // Check for realistic patterns that are likely valid
  if (/^[a-z]+\.[a-z]+[0-9]{0,3}$/i.test(localPart)) {
    return {
      status: "success",
      message: "Gmail format appears valid (firstname.lastname pattern)",
    }
  }

  // If format is valid but we can't verify existence
  return {
    status: "unknown",
    message: "Gmail format is valid but existence could not be verified",
  }
}
