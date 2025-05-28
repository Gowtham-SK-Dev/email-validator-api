// Make sure to install puppeteer: npm install puppeteer
import puppeteer from "puppeteer"

export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] })
  const page = await browser.newPage()
  try {
    await page.goto(
      "https://accounts.google.com/v3/signin/identifier?authuser=0&continue=https%3A%2F%2Fmyaccount.google.com%2F&ec=GAlAwAE&hl=en&service=accountsettings&flowName=GlifWebSignIn&flowEntry=AddSession",
      { waitUntil: "domcontentloaded", timeout: 20000 }
    )

    await page.waitForSelector('input[type="email"]', { timeout: 10000 })
    await page.evaluate(() => {
      // Clear any pre-filled value
      const input = document.querySelector('input[type="email"]') as HTMLInputElement
      if (input) input.value = ""
    })
    await page.type('input[type="email"]', email, { delay: 30 })

    // Click the Next button
    await page.waitForSelector("#identifierNext button, button[jsname='LgbsSe']", { timeout: 5000 })
    await page.click("#identifierNext button, button[jsname='LgbsSe']")

    // Wait for either error message or password input or a change in the page
    await page.waitForTimeout(2500)

    // Check for error message
    const error = await page.$eval('div[jsname="B34EJ"]', el => el.textContent).catch(() => null)
    if (error && error.trim()) {
      await browser.close()
      return { status: "error", message: error.trim() }
    }

    // Check if password input is present (means email is valid)
    const passwordInput = await page.$('input[type="password"]')
    await browser.close()
    if (passwordInput) {
      return { status: "success", message: "Email is valid (password step reached, no error after Next)." }
    }

    // If neither error nor password input, treat as unknown
    return { status: "unknown", message: "Could not determine result (no error or password field found)." }
  } catch (err: any) {
    await browser.close()
    return { status: "unknown", message: "Automation or network error: " + err.message }
  }
}
