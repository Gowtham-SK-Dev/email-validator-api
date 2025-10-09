import puppeteer, { type Browser, type Page } from "puppeteer"
import { findChromeExecutable } from "./puppeteer-setup"

const isNetlify = !!process.env.NETLIFY

// Browser pool for reusing browser instances
class BrowserPool {
  private browsers: Browser[] = []
  private maxBrowsers = 3
  private currentIndex = 0
  private isInitialized = false

  async initialize() {
    if (this.isInitialized) return

    console.log(`🔐 Initializing browser pool with ${this.maxBrowsers} browsers...`)

    const launchOptions = this.getLaunchOptions()

    // Launch browsers in parallel
    const browserPromises = Array(this.maxBrowsers)
      .fill(null)
      .map(() => puppeteer.launch(launchOptions))

    try {
      this.browsers = await Promise.all(browserPromises)
      this.isInitialized = true
      console.log(`🔐 Browser pool initialized successfully`)
    } catch (error) {
      console.error(`🔐 Failed to initialize browser pool:`, error)
      throw error
    }
  }

  // private getLaunchOptions() {
  //   let chromePath = findChromeExecutable()
  //   const launchOptions: any = {
  //     headless: "new",
  //     args: [
  //       "--no-sandbox",
  //       "--disable-setuid-sandbox",
  //       "--disable-dev-shm-usage",
  //       "--disable-accelerated-2d-canvas",
  //       "--no-first-run",
  //       "--no-zygote",
  //       "--disable-gpu",
  //       "--disable-web-security",
  //       "--disable-features=VizDisplayCompositor",
  //       "--disable-background-timer-throttling",
  //       "--disable-backgrounding-occluded-windows",
  //       "--disable-renderer-backgrounding",
  //       "--disable-field-trial-config",
  //       "--disable-back-forward-cache",
  //       "--disable-ipc-flooding-protection",
  //       "--window-size=1280,800",
  //       "--disable-blink-features=AutomationControlled",
  //       "--disable-extensions",
  //       "--disable-plugins",
  //       "--disable-default-apps",
  //       "--disable-sync",
  //       "--disable-translate",
  //       "--hide-scrollbars",
  //       "--mute-audio",
  //       "--no-default-browser-check",
  //       "--no-pings",
  //       "--disable-logging",
  //       "--disable-dev-tools",
  //       "--disable-crash-reporter",
  //       "--disable-in-process-stack-traces",
  //       "--disable-logging-redirect",
  //       "--log-level=3",
  //       "--silent",
  //     ],
  //   }

  //   if (isNetlify) {
  //     chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium-browser"
  //     launchOptions.executablePath = chromePath
  //   } else if (chromePath) {
  //     launchOptions.executablePath = chromePath
  //   }

  //   return launchOptions
  // }
  
 private getLaunchOptions() {
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
      "--disable-logging",
      "--disable-dev-tools",
      "--disable-crash-reporter",
      "--disable-in-process-stack-traces",
      "--disable-logging-redirect",
      "--log-level=3",
      "--silent",
    ],
  };

  if (isNetlify) {
    // On Netlify, use Puppeteer's bundled Chromium
    // Don't force an executablePath to a system Chrome
    // The bundled Chromium will be used automatically
    launchOptions.args.push("--no-sandbox", "--disable-setuid-sandbox");
  } else {
    // Locally, use system Chrome if found
    const chromePath = findChromeExecutable();
    if (chromePath) {
      launchOptions.executablePath = chromePath;
    }
  }

  return launchOptions;
}



  async getBrowser(): Promise<Browser> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const browser = this.browsers[this.currentIndex]
    this.currentIndex = (this.currentIndex + 1) % this.maxBrowsers

    // Check if browser is still connected
    if (!browser.isConnected()) {
      console.log(`🔐 Browser disconnected, relaunching...`)
      const newBrowser = await puppeteer.launch(this.getLaunchOptions())
      this.browsers[this.currentIndex] = newBrowser
      return newBrowser
    }

    return browser
  }

  async cleanup() {
    console.log(`🔐 Cleaning up browser pool...`)
    await Promise.all(
      this.browsers.map((browser) => browser.close().catch((err) => console.error("Error closing browser:", err))),
    )
    this.browsers = []
    this.isInitialized = false
  }
}

// Global browser pool instance
const browserPool = new BrowserPool()

// Cache for recent validations (5 minute cache)
const validationCache = new Map<string, { result: any; timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Enhanced element interaction utilities
async function waitForElementAndClick(page: Page, selectors: string[], timeout = 10000): Promise<boolean> {
  console.log(`🔐 Waiting for clickable element with selectors: ${selectors.join(", ")}`)

  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    for (const selector of selectors) {
      try {
        // Wait for element to exist
        const element = await page.$(selector)
        if (!element) continue

        // Check if element is visible and enabled
        const isVisible = await element.isIntersectingViewport()
        if (!isVisible) continue

        const isEnabled = await page.evaluate((el) => {
          const htmlEl = el as HTMLElement
          if (htmlEl instanceof HTMLButtonElement) {
            return !htmlEl.disabled
          }
          if (htmlEl instanceof HTMLInputElement) {
            return !htmlEl.disabled
          }
          return true
        }, element)

        if (!isEnabled) continue

        console.log(`🔐 Found clickable element with selector: ${selector}`)

        // Try multiple click methods
        try {
          // Method 1: Regular click
          await element.click()
          console.log(`🔐 Successfully clicked element using regular click`)
          return true
        } catch (clickError1) {
          console.log(`🔐 Regular click failed, trying evaluate click`)

          try {
            // Method 2: Evaluate click
            await page.evaluate((el) => {
              const htmlEl = el as HTMLElement
              if (htmlEl && typeof htmlEl.click === "function") {
                htmlEl.click()
              }
            }, element)
            console.log(`🔐 Successfully clicked element using evaluate click`)
            return true
          } catch (clickError2) {
            console.log(`🔐 Evaluate click failed, trying coordinate click`)

            try {
              // Method 3: Click at element coordinates
              const box = await element.boundingBox()
              if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
                console.log(`🔐 Successfully clicked element using coordinate click`)
                return true
              }
            } catch (clickError3) {
              console.log(`🔐 All click methods failed for selector ${selector}:`, clickError3)
            }
          }
        }
      } catch (error) {
        // Continue to next selector
        continue
      }
    }

    // Wait a bit before trying again
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  console.log(`🔐 Failed to find and click any element after ${timeout}ms`)
  return false
}

async function waitForElementAndType(page: Page, selectors: string[], text: string, timeout = 10000): Promise<boolean> {
  console.log(`🔐 Waiting for input element with selectors: ${selectors.join(", ")}`)

  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    for (const selector of selectors) {
      try {
        // Wait for element to exist
        const element = await page.$(selector)
        if (!element) continue

        // Check if element is visible
        const isVisible = await element.isIntersectingViewport()
        if (!isVisible) continue

        console.log(`🔐 Found input element with selector: ${selector}`)

        try {
          // Clear the field first
          await element.click({ clickCount: 3 })
          await page.keyboard.press("Backspace")
          await new Promise((resolve) => setTimeout(resolve, 200))

          // Type the text
          await element.type(text, { delay: 50 })
          console.log(`🔐 Successfully typed text into element`)
          return true
        } catch (typeError) {
          console.log(`🔐 Typing failed for selector ${selector}:`, typeError)

          try {
            // Alternative method: Focus and use keyboard
            await element.focus()
            await page.keyboard.down("Control")
            await page.keyboard.press("a")
            await page.keyboard.up("Control")
            await page.keyboard.type(text, { delay: 50 })
            console.log(`🔐 Successfully typed text using alternative method`)
            return true
          } catch (altTypeError) {
            console.log(`🔐 Alternative typing method also failed:`, altTypeError)
          }
        }
      } catch (error) {
        // Continue to next selector
        continue
      }
    }

    // Wait a bit before trying again
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  console.log(`🔐 Failed to find and type into any element after ${timeout}ms`)
  return false
}

// Robust helper to wait for the first visible selector among many
async function waitForFirstVisible(page: Page, selectors: string[], timeout = 15000): Promise<string | null> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    for (const selector of selectors) {
      try {
        const el = await page.$(selector)
        if (!el) continue
        const visible = await el.isIntersectingViewport()
        if (visible) return selector
      } catch {
        // ignore and continue
      }
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}

export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting optimized Google sign-in test for: ${email}`)

  // Check cache first
  const cached = validationCache.get(email)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`🔐 Returning cached result for: ${email}`)
    return cached.result
  }

  const startTime = Date.now()
  let page: Page | null = null
  let browser: Browser | null = null

  try {
    // Get browser from pool
    browser = await browserPool.getBrowser()

    // Create a fresh page for each validation to avoid state issues
    page = await browser.newPage()

    // Set user agent and viewport
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )

    await page.setViewport({ width: 1280, height: 800 })

    // Add script to remove automation indicators
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      })
      try {
        localStorage.clear()
        sessionStorage.clear()
      } catch (e) {}
    })

    console.log(`🔐 Browser and page ready in ${Date.now() - startTime}ms`)

    // Navigate to Google sign-in with optimized timeout
    const navigationStart = Date.now()
    const response = await page.goto(
      "https://accounts.google.com/signin/v2/identifier?flowName=GlifWebSignIn&flowEntry=ServiceLogin",
      {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      },
    )

    if (!response || !response.ok()) {
      throw new Error(`Navigation failed: HTTP ${response?.status()}`)
    }

    console.log(`🔐 Navigation completed in ${Date.now() - navigationStart}ms`)

    // Wait for page to stabilize
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Enhanced email input selectors
    const emailSelectors = [
      'input[type="email"]',
      'input[id="identifierId"]',
      'input[name="identifier"]',
      "#identifierId",
      'input[aria-label*="email" i]',
      'input[placeholder*="email" i]',
    ]

    // Type email with enhanced method
    const emailTyped = await waitForElementAndType(page, emailSelectors, email, 10000)

    if (!emailTyped) {
      throw new Error("Could not find or interact with email input field")
    }

    console.log(`🔐 Email entered in ${Date.now() - startTime}ms`)

    // Wait a moment for any dynamic updates
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Tighten Next button selectors (remove unsupported :contains) and rely on IDs/classes
    const nextButtonSelectors = [
      "#identifierNext",
      'button[jsname="LgbsSe"]',
      ".VfPpkd-LgbsSe", // Google primary buttons
      "[data-continue-button]",
      ".RveJvd",
    ]

    // Click Next button with enhanced method
    const nextClicked = await waitForElementAndClick(page, nextButtonSelectors, 10000)

    if (!nextClicked) {
      throw new Error("Could not find or click Next button")
    }

    console.log(`🔐 Next button clicked in ${Date.now() - startTime}ms`)

    // Wait shortly for any navigation, but don't rely on it exclusively
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 6000 }),
        new Promise((r) => setTimeout(r, 6000)),
      ])
    } catch {
      // ignore
    }

    // Include real Google password field names and structures
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="Passwd"]',
      '#password input[type="password"]',
      '#password input[name="Passwd"]',
      'input[aria-label*="Enter your password" i]',
    ]

    const challengeSelectors = [
      "[data-challenge-id]",
      "[data-challenge-type]",
      ".challenge-page",
      '[aria-label*="verify" i]',
      '[aria-label*="challenge" i]',
      ".tosPage",
      ".captcha",
    ]

    // Common error container near email field
    const errorSelectors = [
      'div[jsname="B34EJ"]',
      ".o6cuMc",
      '[data-error="true"]',
      ".Ekjuhf",
      ".dEOOab",
      '[role="alert"]',
      ".LXRPh",
      ".k6Zj8d",
      ".GQ8Pzc",
      '#identifierId[aria-invalid="true"] ~ div .jibhHc',
    ]

    // Try to detect outcome more deterministically with selector visibility checks
    const firstHit =
      (await waitForFirstVisible(page, passwordSelectors, 8000)) ||
      (await waitForFirstVisible(page, errorSelectors, 2000)) ||
      (await waitForFirstVisible(page, challengeSelectors, 2000))

    let errorMessage: string | null = null
    let passwordFound = false
    let challengeFound = false

    if (firstHit) {
      // Determine which bucket matched
      if (passwordSelectors.includes(firstHit)) {
        passwordFound = true
      } else if (challengeSelectors.includes(firstHit)) {
        challengeFound = true
      } else {
        // Attempt to extract the error text from whichever error node we can find
        try {
          errorMessage = await page.evaluate((selectors) => {
            for (const sel of selectors) {
              const el = document.querySelector(sel)
              if (el && el.textContent) {
                const txt = el.textContent.trim()
                if (txt) return txt
              }
            }
            return null
          }, errorSelectors)
        } catch {
          errorMessage = "An unknown error occurred"
        }
      }
    } else {
      // As a fallback, do one more pass checking for a password input by attribute (covers dynamic mounts)
      try {
        const hasPasswd = await page.evaluate(() => {
          const el =
            document.querySelector('input[name="Passwd"]') ||
            document.querySelector('#password input[type="password"]') ||
            document.querySelector('input[type="password"]')
          return !!el && (el as HTMLElement).offsetParent !== null
        })
        passwordFound = !!hasPasswd
      } catch {
        // ignore
      }
    }

    const totalTime = Date.now() - startTime
    console.log(`🔐 Validation completed in ${totalTime}ms`)

    let result: { status: string; message: string }
    if (errorMessage) {
      result = { status: "error", message: errorMessage }
    } else if (passwordFound) {
      result = { status: "success", message: "Email is valid (reached password step)" }
    } else if (challengeFound) {
      result = { status: "success", message: "Email is valid (reached challenge/verification step)" }
    } else {
      // Make unknown less likely and include hint about anti-bot if repeatedly failing
      result = {
        status: "unknown",
        message:
          "Could not determine result - no clear indicators found (try again; headless/automation may be challenged by Google)",
      }
    }

    // Cache the result
    validationCache.set(email, { result, timestamp: Date.now() })

    // Close the page
    await page.close()

    return result
  } catch (err: unknown) {
    console.error("🔐 Optimized validation error:", err)

    if (page) {
      try {
        await page.close()
      } catch (closeError) {
        console.error("Error closing page:", closeError)
      }
    }

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
      message: `Validation error: ${errorMessage}`,
    }
  }
}

// Batch processing for multiple emails
export async function testGoogleSigninBatch(
  emails: string[],
): Promise<Map<string, { status: string; message: string }>> {
  console.log(`🔐 Starting batch validation for ${emails.length} emails`)

  const results = new Map<string, { status: string; message: string }>()
  const batchSize = 3 // Process 3 emails concurrently

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize)
    const batchPromises = batch.map(async (email) => {
      const result = await testGoogleSignin(email)
      return { email, result }
    })

    const batchResults = await Promise.all(batchPromises)
    batchResults.forEach(({ email, result }) => {
      results.set(email, result)
    })
  }

  return results
}

// Enhanced version with retry logic and better error handling
export async function testGoogleSigninWithRetry(
  email: string,
  maxRetries = 2,
): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting optimized Google sign-in test with retry for: ${email} (max retries: ${maxRetries})`)

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
        console.log(`🔐 Technical error on attempt ${attempt}, retrying in 2 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        continue
      }

      // Return the result if it's the last attempt
      return result
    } catch (error) {
      console.error(`🔐 Attempt ${attempt} failed with error:`, error)

      if (attempt < maxRetries) {
        console.log(`🔐 Retrying after error in 2 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
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

// Cleanup function to be called on app shutdown
export async function cleanupGoogleSigninTest() {
  await browserPool.cleanup()
  validationCache.clear()
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
