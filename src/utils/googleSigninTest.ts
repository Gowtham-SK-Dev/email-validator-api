import puppeteer from "puppeteer"

export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=VizDisplayCompositor",
    ],
  })

  const page = await browser.newPage()

  try {
    // Set user agent to avoid detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )

    // Navigate to Google sign-in page
    await page.goto(
      "https://accounts.google.com/v3/signin/identifier?authuser=0&continue=https%3A%2F%2Fmyaccount.google.com%2F&ec=GAlAwAE&hl=en&service=accountsettings&flowName=GlifWebSignIn&flowEntry=AddSession",
      { waitUntil: "networkidle0", timeout: 30000 },
    )

    // Wait for page to fully load and find email input with multiple possible selectors
    const emailInputSelectors = [
      'input[type="email"]',
      'input[id="identifierId"]',
      'input[name="identifier"]',
      "#identifierId",
    ]

    let emailInput = null
    for (const selector of emailInputSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 })
        emailInput = await page.$(selector)
        if (emailInput) {
          console.log(`Found email input with selector: ${selector}`)
          break
        }
      } catch (e) {
        continue
      }
    }

    if (!emailInput) {
      await browser.close()
      return { status: "error", message: "Could not find email input field" }
    }

    // Clear any existing value and enter the email
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="email"], #identifierId')
      inputs.forEach((input) => {
        if (input instanceof HTMLInputElement) {
          input.value = ""
          input.focus()
        }
      })
    })

    // Type the email with realistic delay
    await page.type('#identifierId, input[type="email"]', email, { delay: 100 })

    // Wait a moment for any validation
    await page.waitForTimeout(1000)

    // Find and click the Next button with multiple possible selectors
    const nextButtonSelectors = [
      "#identifierNext",
      'button[jsname="LgbsSe"]',
      '[data-primary-action-label="Next"]',
      'button:has-text("Next")',
      'div[role="button"]:has-text("Next")',
      ".VfPpkd-LgbsSe",
    ]

    let nextButton = null
    for (const selector of nextButtonSelectors) {
      try {
        nextButton = await page.$(selector)
        if (nextButton) {
          console.log(`Found next button with selector: ${selector}`)
          break
        }
      } catch (e) {
        continue
      }
    }

    if (!nextButton) {
      await browser.close()
      return { status: "error", message: "Could not find Next button" }
    }

    // Click the Next button
    await nextButton.click()

    // Wait for navigation/response with longer timeout
    await page.waitForTimeout(3000)

    // Check for various error conditions with multiple selectors
    const errorSelectors = [
      'div[jsname="B34EJ"]', // Main error container
      '[data-error="true"]',
      ".Ekjuhf", // Error text class
      ".dEOOab", // Another error class
      "span[jsslot]", // Error span
      ".LXRPh", // Error message class
    ]

    let errorMessage = null
    for (const selector of errorSelectors) {
      try {
        const errorElement = await page.$(selector)
        if (errorElement) {
          const text = await page.evaluate((el) => el.textContent?.trim(), errorElement)
          if (text && text.length > 0) {
            errorMessage = text
            console.log(`Found error with selector ${selector}: ${text}`)
            break
          }
        }
      } catch (e) {
        continue
      }
    }

    // If we found an error message, return it
    if (errorMessage) {
      await browser.close()
      return { status: "error", message: errorMessage }
    }

    // Check for password input (success condition) with multiple selectors
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      "#password",
      '[data-form-type="password"]',
    ]

    let passwordInput = null
    for (const selector of passwordSelectors) {
      try {
        passwordInput = await page.$(selector)
        if (passwordInput) {
          console.log(`Found password input with selector: ${selector}`)
          break
        }
      } catch (e) {
        continue
      }
    }

    // Check if we're on the password page
    if (passwordInput) {
      await browser.close()
      return { status: "success", message: "Email is valid - reached password step" }
    }

    // Check if we're still on the same page (might indicate an error)
    const currentUrl = page.url()
    if (currentUrl.includes("signin/identifier")) {
      // Still on identifier page, likely an error
      await browser.close()
      return { status: "error", message: "Email appears to be invalid - remained on identifier page" }
    }

    // Check for other possible success indicators
    const successIndicators = ['div[data-step="password"]', '[data-form-type="password"]', ".password-step"]

    for (const selector of successIndicators) {
      try {
        const element = await page.$(selector)
        if (element) {
          await browser.close()
          return { status: "success", message: "Email is valid - password step detected" }
        }
      } catch (e) {
        continue
      }
    }

    // If we can't determine the state, return unknown
    await browser.close()
    return {
      status: "unknown",
      message: `Could not determine result. Current URL: ${currentUrl}`,
    }
  } catch (err: any) {
    await browser.close()
    console.error("Google sign-in test error:", err)
    return {
      status: "error",
      message: `Automation error: ${err.message}`,
    }
  }
}

// Enhanced version with retry logic
export async function testGoogleSigninWithRetry(
  email: string,
  maxRetries = 2,
): Promise<{ status: string; message: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Google sign-in test attempt ${attempt} for email: ${email}`)

    const result = await testGoogleSignin(email)

    // If we get a clear success or error, return it
    if (result.status === "success" || result.status === "error") {
      return result
    }

    // If unknown and we have retries left, try again
    if (result.status === "unknown" && attempt < maxRetries) {
      console.log(`Attempt ${attempt} returned unknown, retrying...`)
      await new Promise((resolve) => setTimeout(resolve, 2000)) // Wait 2 seconds before retry
      continue
    }

    return result
  }

  return { status: "error", message: "Max retries exceeded" }
}
