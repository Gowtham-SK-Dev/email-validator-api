import { execSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

/**
 * Automatic Puppeteer Environment Setup
 * Run this once to set up Chrome for your project
 */

console.log("🚀 Starting Puppeteer Environment Setup...")
console.log("=".repeat(50))

// Detect environment
const platform = os.platform()
const isServerless = !!(
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.VERCEL ||
  process.env.NETLIFY ||
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RENDER ||
  process.env.HEROKU_APP_NAME
)

console.log(`📋 Platform: ${platform}`)
console.log(`☁️ Serverless: ${isServerless ? "Yes" : "No"}`)

// Function to find Chrome
function findChrome(): string | null {
  console.log("\n🔍 Searching for existing Chrome installation...")

  const chromePaths: { [key: string]: string[] } = {
    linux: [
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/snap/bin/chromium",
    ],
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ],
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ],
  }

  const paths = chromePaths[platform] || chromePaths.linux

  for (const chromePath of paths) {
    try {
      if (fs.existsSync(chromePath)) {
        console.log(`✅ Found Chrome at: ${chromePath}`)
        return chromePath
      }
    } catch (error) {
      // Continue searching
    }
  }

  console.log("❌ No existing Chrome found")
  return null
}

// Function to install Chrome
async function installChrome(): Promise<string | null> {
  console.log("\n📦 Installing Chrome...")

  // Method 1: Puppeteer's built-in installer (works everywhere)
  try {
    console.log("📦 Using Puppeteer's Chrome installer...")
    execSync("npx puppeteer browsers install chrome", {
      stdio: "inherit",
      timeout: 180000, // 3 minutes
    })

    // Check if installation worked
    const installedChrome = findPuppeteerChrome()
    if (installedChrome) {
      console.log("✅ Chrome installed successfully!")
      return installedChrome
    }
  } catch (error) {
    console.warn("⚠️ Puppeteer installer failed, trying alternatives...")
  }

  // Method 2: Platform-specific installation (only if not serverless)
  if (!isServerless) {
    try {
      console.log("📦 Trying platform-specific installation...")

      switch (platform) {
        case "linux":
          try {
            execSync("sudo apt-get update && sudo apt-get install -y google-chrome-stable", { stdio: "inherit" })
          } catch {
            execSync("sudo snap install chromium", { stdio: "inherit" })
          }
          break
        case "darwin":
          execSync("brew install --cask google-chrome", { stdio: "inherit" })
          break
        case "win32":
          console.log("🪟 Please download Chrome manually from: https://www.google.com/chrome/")
          break
      }

      // Check again after installation
      const foundChrome = findChrome()
      if (foundChrome) {
        return foundChrome
      }
    } catch (error) {
      console.warn("⚠️ Platform installation failed")
    }
  }

  console.log("⚠️ Chrome installation failed, will use Puppeteer's bundled Chromium")
  return null
}

// Function to find Puppeteer's Chrome
function findPuppeteerChrome(): string | null {
  const searchPaths = [
    path.join(process.cwd(), "node_modules", "puppeteer"),
    path.join(os.homedir(), ".cache", "puppeteer"),
    path.join(os.homedir(), ".cache", "ms-playwright"),
  ]

  for (const basePath of searchPaths) {
    try {
      if (fs.existsSync(basePath)) {
        // Recursively search for chrome executable
        const findInDir = (dir: string): string | null => {
          try {
            const items = fs.readdirSync(dir)
            for (const item of items) {
              const itemPath = path.join(dir, item)
              const stat = fs.statSync(itemPath)

              if (stat.isDirectory()) {
                const result = findInDir(itemPath)
                if (result) return result
              } else if (
                (item === "chrome" || item === "chrome.exe" || item === "chromium") &&
                stat.mode & Number.parseInt("111", 8)
              ) {
                return itemPath
              }
            }
          } catch (error) {
            // Continue searching
          }
          return null
        }

        const chromeExe = findInDir(basePath)
        if (chromeExe) {
          console.log(`✅ Found Puppeteer Chrome at: ${chromeExe}`)
          return chromeExe
        }
      }
    } catch (error) {
      // Continue searching
    }
  }

  return null
}

// Function to create Chrome config
function createChromeConfig(executablePath: string | null) {
  const config = {
    headless: "new" as const,
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
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--window-size=1280,720",
    ],
    defaultViewport: { width: 1280, height: 720 },
  }

  // Add executable path if found
  if (executablePath) {
    ;(config as any).executablePath = executablePath
  }

  // Additional args for serverless
  if (isServerless) {
    config.args.push("--single-process", "--no-zygote", "--disable-gpu", "--disable-software-rasterizer")
  }

  return config
}

// Function to test Chrome
async function testChrome(config: any): Promise<boolean> {
  console.log("\n🧪 Testing Chrome installation...")

  try {
    const puppeteer = await import("puppeteer")
    const browser = await puppeteer.launch(config)
    const page = await browser.newPage()

    await page.goto("https://example.com", {
      waitUntil: "networkidle0",
      timeout: 10000,
    })

    const title = await page.title()
    console.log(`✅ Test successful! Page title: ${title}`)

    await browser.close()
    return true
  } catch (error) {
    console.error(`❌ Test failed: ${(error as Error).message}`)
    return false
  }
}

// Function to save config
function saveConfig(config: any) {
  const configPath = path.join(process.cwd(), "puppeteer-config.json")
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  console.log(`💾 Configuration saved to: ${configPath}`)
}

// Main setup function
async function setupEnvironment() {
  try {
    // Step 1: Find existing Chrome
    let chromePath = findChrome()

    // Step 2: Install if not found
    if (!chromePath) {
      chromePath = await installChrome()
    }

    // Step 3: Create configuration
    const config = createChromeConfig(chromePath)
    console.log("\n📋 Chrome Configuration:")
    console.log(JSON.stringify(config, null, 2))

    // Step 4: Test the setup
    const testResult = await testChrome(config)

    if (testResult) {
      // Step 5: Save configuration
      saveConfig(config)

      console.log("\n🎉 Setup completed successfully!")
      console.log("=".repeat(50))
      console.log("✅ Chrome is ready for Puppeteer")
      console.log("✅ Configuration saved")
      console.log("✅ Test passed")
      console.log("\n💡 Next steps:")
      console.log("1. Use the saved configuration in your code")
      console.log("2. Import and use the updated functions")
      console.log("3. Your email validation should now work!")

      return config
    } else {
      throw new Error("Chrome test failed")
    }
  } catch (error) {
    console.error("\n❌ Setup failed:", (error as Error).message)
    console.log("\n🔧 Troubleshooting:")
    console.log("1. Try running: npm install puppeteer")
    console.log("2. For manual Chrome install:")
    console.log("   - Linux: sudo apt-get install google-chrome-stable")
    console.log("   - macOS: brew install --cask google-chrome")
    console.log("   - Windows: Download from https://www.google.com/chrome/")
    console.log("3. Check if you have sufficient permissions")
    console.log("4. For serverless, the bundled Chromium should work")

    throw error
  }
}

// Run the setup
setupEnvironment()
  .then((config) => {
    console.log("\n🚀 Environment setup complete!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n💥 Setup failed:", error.message)
    process.exit(1)
  })
