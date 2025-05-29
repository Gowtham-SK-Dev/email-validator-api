// Simple script to force Puppeteer to use bundled Chromium
const puppeteer = require("puppeteer")

async function testBundledChromium() {
  console.log("🧪 TESTING BUNDLED CHROMIUM")
  console.log("=".repeat(50))

  // Clear any problematic environment variables
  delete process.env.PUPPETEER_EXECUTABLE_PATH
  delete process.env.PUPPETEER_CACHE_DIR

  console.log("✅ Environment variables cleared")
  console.log("🚀 Launching browser with minimal options...")

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      // IMPORTANT: No executablePath - forces bundled Chromium
    })

    console.log("✅ Browser launched successfully!")
    console.log("🌐 Opening test page...")

    const page = await browser.newPage()
    await page.goto("https://example.com")

    const title = await page.title()
    console.log(`✅ Page loaded successfully! Title: ${title}`)

    await browser.close()
    console.log("✅ Test completed successfully!")

    console.log("\n💡 SOLUTION:")
    console.log("The bundled Chromium works! Use this approach in your code.")
    console.log("1. Delete PUPPETEER_EXECUTABLE_PATH environment variable")
    console.log("2. Use the simplified launch options from googleSigninTest.ts")
  } catch (error) {
    console.error("❌ Test failed:", error.message)
    console.log("\n🔧 TROUBLESHOOTING:")
    console.log("1. Make sure puppeteer is installed: npm install puppeteer")
    console.log("2. Try with even fewer launch options")
    console.log("3. Check for network connectivity issues")
  }
}

testBundledChromium()
