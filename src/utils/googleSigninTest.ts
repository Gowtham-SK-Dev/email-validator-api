import puppeteer from "puppeteer"
import { execSync } from "child_process"
import fs from "fs"

// Helper function to install Chrome if needed
async function ensureChromiumInstalled(): Promise<string | undefined> {
  try {
    console.log("🔍 Checking for Chrome installation...")

    // Try to install Chrome using puppeteer's built-in installer
    try {
      console.log("📦 Installing Chrome via Puppeteer...")
      execSync("npx puppeteer browsers install chrome", { stdio: "inherit" })
      console.log("✅ Chrome installed successfully via Puppeteer")
    } catch (installError) {
      console.warn("⚠️ Could not install Chrome via Puppeteer:", installError)

      // If that fails, try to find Chrome in common locations
      const possiblePaths = [
        // Linux paths
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        // Mac paths
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        // Add more paths as needed
      ]

      for (const chromePath of possiblePaths) {
        if (fs.existsSync(chromePath)) {
          console.log(`✅ Found existing Chrome at: ${chromePath}`)
          return chromePath
        }
      }

      console.warn("⚠️ Could not find Chrome in common locations")
    }

    return undefined
  } catch (error) {
    console.error("❌ Error ensuring Chrome is installed:", error)
    return undefined
  }
}

export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google sign-in test for: ${email}`)

  let browser
  try {
    // Try to ensure Chrome is installed
    const executablePath = await ensureChromiumInstalled()

    // Launch options with fallbacks
    const launchOptions: puppeteer.LaunchOptions = {
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", // Helps in limited memory environments
        "--disable-blink-features=AutomationControlled",
        "--disable-features=VizDisplayCompositor",
        "--disable-web-security",
      ],
    }

    // Add executable path if found
    if (executablePath) {
      launchOptions.executablePath = executablePath
    }

    console.log("🚀 Launching browser with options:", JSON.stringify(launchOptions, null, 2))
    browser = await puppeteer.launch(launchOptions)

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
    await page.waitForTimeout(4000) // Increased wait time

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

    // Check for other success indicators
    const successSelectors = ['div[data-step="password"]', '[data-form-type="password"]', ".password-step"]

    for (const selector of successSelectors) {
      try {
        const element = await page.$(selector)
        if (element) {
          console.log(`🔐 ✅ Found success indicator: ${selector}`)
          await browser.close()
          return { status: "success", message: "Email is valid - password step detected" }
        }
      } catch (e) {
        continue
      }
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
    return {
      status: "technical_error",
      message: `Automation error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

// Enhanced version with retry logic and fallback to API-based validation
export async function testGoogleSigninWithRetry(
  email: string,
  maxRetries = 2,
): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google sign-in test for: ${email} (max retries: ${maxRetries})`)

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

      // If unknown and we have retries left, try again
      if (result.status === "unknown" && attempt < maxRetries) {
        console.log(`🔐 Attempt ${attempt} returned unknown, retrying in 2 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        continue
      }

      // Last attempt or non-retryable result
      console.log(`🔐 Final attempt ${attempt} result: ${result.status}`)
      return result
    } catch (error) {
      console.error(`🔐 Attempt ${attempt} failed with error:`, error)

      if (attempt < maxRetries) {
        console.log(`🔐 Retrying after error in 3 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 3000))
        continue
      }

      // Last attempt failed, try fallback validation
      return await fallbackEmailValidation(email)
    }
  }

  return { status: "technical_error", message: "Max retries exceeded" }
}

// Fallback validation when Puppeteer fails
async function fallbackEmailValidation(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔄 Using fallback validation for: ${email}`)

  if (!email.endsWith("@gmail.com")) {
    return {
      status: "unknown",
      message: "Fallback validation only works for Gmail addresses",
    }
  }

  try {
    // Simple check - valid Gmail addresses must:
    // - Be between 6-30 characters before the @ symbol
    // - Start with a letter
    // - Contain only letters, numbers, dots, and underscores
    // - Not have consecutive dots

    const localPart = email.split("@")[0]

    if (localPart.length < 6 || localPart.length > 30) {
      return {
        status: "error",
        message: "Gmail addresses must be between 6-30 characters before @gmail.com",
      }
    }

    if (!/^[a-z]/.test(localPart)) {
      return {
        status: "error",
        message: "Gmail addresses must start with a letter",
      }
    }

    if (!/^[a-z0-9._]+$/.test(localPart)) {
      return {
        status: "error",
        message: "Gmail addresses can only contain letters, numbers, dots, and underscores",
      }
    }

    if (localPart.includes("..")) {
      return {
        status: "error",
        message: "Gmail addresses cannot contain consecutive dots",
      }
    }

    // If it passes all these checks, we can't definitively say it exists,
    // but it's at least syntactically valid
    return {
      status: "unknown",
      message: "Email format is valid for Gmail, but existence couldn't be verified due to technical limitations",
    }
  } catch (error) {
    return {
      status: "technical_error",
      message: `Fallback validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}
