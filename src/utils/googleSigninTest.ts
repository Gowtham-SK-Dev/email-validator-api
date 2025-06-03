// Netlify/Serverless Chrome support note:
// Netlify does not support installing Chrome via `npx puppeteer browsers install chrome` at build/runtime.
// You must use a serverless-compatible Chromium binary and set the executable path for Puppeteer.

import puppeteer from "puppeteer"
import { findChromeExecutable } from "./puppeteer-setup"

const isNetlify = !!process.env.NETLIFY

export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google sign-in test for: ${email}`)

  let browser
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
        // Add randomization to avoid fingerprinting
        `--window-size=${1200 + Math.floor(Math.random() * 400)},${800 + Math.floor(Math.random() * 300)}`,
        "--disable-blink-features=AutomationControlled",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-plugins",
        "--disable-sync",
        "--disable-translate",
        "--hide-scrollbars",
        "--mute-audio",
        "--no-default-browser-check",
        "--no-pings",
        "--disable-background-networking",
      ],
    }

    // Netlify: Use a serverless Chromium binary if available
    if (isNetlify) {
      chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium-browser"
      launchOptions.executablePath = chromePath
    } else if (chromePath) {
      launchOptions.executablePath = chromePath
    }

    browser = await puppeteer.launch(launchOptions)
    const page = await browser.newPage()

    // Clear any existing data and set fresh context
    await page.evaluateOnNewDocument(() => {
      // Clear localStorage and sessionStorage
      localStorage.clear()
      sessionStorage.clear()

      // Remove automation indicators
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      })

      // Randomize some properties to avoid fingerprinting
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      })

      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      })
    })

    // Set a realistic user agent with slight randomization
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ]
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)])

    // Set viewport with randomization
    await page.setViewport({
      width: 1200 + Math.floor(Math.random() * 400),
      height: 800 + Math.floor(Math.random() * 300),
    })

    // Add random delay to avoid pattern detection
    await page.waitForTimeout(1000 + Math.floor(Math.random() * 2000))

    // Navigate to Google sign-in page
    await page.goto("https://accounts.google.com/signin/v2/identifier?flowName=GlifWebSignIn&flowEntry=ServiceLogin", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })

    // Wait for page to stabilize
    await page.waitForTimeout(2000 + Math.floor(Math.random() * 1000))

    // Wait for page to load and try multiple selectors for email input
    const emailSelectors = [
      'input[type="email"]',
      'input[id="identifierId"]',
      'input[name="identifier"]',
      "#identifierId",
      '[data-initial-value=""]',
    ]

    let emailInput = null
    for (const selector of emailSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 })
        emailInput = await page.$(selector)
        if (emailInput) {
          console.log(`🔐 Found email input with selector: ${selector}`)
          break
        }
      } catch (e) {
        console.log(`🔐 Selector ${selector} not found, trying next...`)
        continue
      }
    }

    if (!emailInput) {
      await browser.close()
      return {
        status: "technical_error",
        message: "Could not find email input field on Google sign-in page",
      }
    }

    // Clear and type email with human-like behavior
    await emailInput.click({ clickCount: 3 }) // Triple click to select all
    await page.waitForTimeout(200 + Math.floor(Math.random() * 300))
    await page.keyboard.press("Backspace") // Clear any existing text
    await page.waitForTimeout(100 + Math.floor(Math.random() * 200))

    // Type with human-like delays
    for (const char of email) {
      await page.keyboard.type(char, { delay: 50 + Math.floor(Math.random() * 100) })
    }

    // Wait for input to register
    await page.waitForTimeout(1000 + Math.floor(Math.random() * 500))

    // Try multiple selectors for the Next button
    const nextButtonSelectors = [
      "#identifierNext",
      'button[jsname="LgbsSe"]',
      '[data-primary-action-label="Next"]',
      'button:has-text("Next")',
      'button[type="button"]:not([disabled])',
      ".VfPpkd-LgbsSe",
    ]

    let nextButton = null
    for (const selector of nextButtonSelectors) {
      try {
        nextButton = await page.$(selector)
        if (nextButton) {
          // Check if button is visible and enabled
          const isVisible = await nextButton.isIntersectingViewport()
          const isEnabled = await page.evaluate((el: HTMLButtonElement) => !el.disabled, nextButton as any)

          if (isVisible && isEnabled) {
            console.log(`🔐 Found Next button with selector: ${selector}`)
            break
          }
        }
      } catch (e) {
        continue
      }
    }

    if (!nextButton) {
      await browser.close()
      return {
        status: "technical_error",
        message: "Could not find or click Next button on Google sign-in page",
      }
    }

    // Add small delay before clicking
    await page.waitForTimeout(500 + Math.floor(Math.random() * 500))

    // Click the Next button with human-like behavior
    try {
      await nextButton.click()
      console.log(`🔐 Clicked Next button successfully`)
    } catch (clickError) {
      // Try alternative click method
      try {
        await page.evaluate((button: HTMLElement) => button.click(), nextButton as any)
        console.log(`🔐 Clicked Next button using evaluate method`)
      } catch (evalError: unknown) {
        await browser.close()
        const errorMessage = evalError instanceof Error ? evalError.message : "Unknown error"
        return {
          status: "technical_error",
          message: "Failed to click Next button: " + errorMessage,
        }
      }
    }

    // Wait for response with longer timeout
    await page.waitForTimeout(4000 + Math.floor(Math.random() * 2000))

    // Check for error messages with multiple selectors
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
        continue
      }
    }

    if (errorMessage) {
      await browser.close()
      return { status: "error", message: errorMessage }
    }

    // Check if we reached password step (multiple selectors)
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      "#password",
      '[data-initial-value][type="password"]',
      '[aria-label*="password" i]',
    ]

    let passwordFound = false
    for (const selector of passwordSelectors) {
      try {
        const passwordInput = await page.$(selector)
        if (passwordInput) {
          passwordFound = true
          console.log(`🔐 Found password input - email is valid`)
          break
        }
      } catch (e) {
        continue
      }
    }

    await browser.close()

    if (passwordFound) {
      return {
        status: "success",
        message: "Email is valid (reached password step)",
      }
    }

    // Check if we're still on the same page or got redirected
    const currentUrl = page.url()
    if (currentUrl.includes("challenge") || currentUrl.includes("signin/v2/challenge")) {
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
    if (browser) {
      try {
        await browser.close()
      } catch (closeError) {
        console.error("Error closing browser:", closeError)
      }
    }

    // Distinguish Chrome not found error
    if (
      err &&
      typeof err === "object" &&
      "message" in err &&
      typeof err.message === "string" &&
      err.message.includes("Could not find Chrome")
    ) {
      return {
        status: "chrome_not_found",
        message:
          "Chrome browser not found for Puppeteer. Please install Chrome or run `npx puppeteer browsers install chrome`.",
      }
    }

    console.error("🔐 Puppeteer error details:", err)
    const errorMessage = err instanceof Error ? err.message : "Unknown error"
    return {
      status: "technical_error",
      message: "Puppeteer error: " + errorMessage,
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
        console.log(`🔐 Technical error on attempt ${attempt}, retrying in 5 seconds...`)
        // Longer delay between retries to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 5000 + Math.floor(Math.random() * 3000)))
        continue
      }

      // Return the result if it's the last attempt
      return result
    } catch (error) {
      console.error(`🔐 Attempt ${attempt} failed with error:`, error)

      if (attempt < maxRetries) {
        console.log(`🔐 Retrying after error in 5 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 5000 + Math.floor(Math.random() * 3000)))
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
