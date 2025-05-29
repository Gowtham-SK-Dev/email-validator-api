import { execSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

/**
 * Comprehensive Chrome detection and installation for Puppeteer
 * Handles invalid paths, auto-detection, and fallbacks
 */
export class PuppeteerChromeManager {
  private platform: string
  private isServerless: boolean
  private chromeExecutablePath: string | null

  constructor() {
    this.platform = os.platform()
    this.isServerless = this.detectServerlessEnvironment()
    this.chromeExecutablePath = null
  }

  private detectServerlessEnvironment(): boolean {
    return !!(
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL ||
      process.env.NETLIFY ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.RENDER ||
      process.env.HEROKU_APP_NAME ||
      process.env.FUNCTIONS_WORKER ||
      process.env.VERCEL_ENV
    )
  }

  /**
   * Get Chrome executable paths for different platforms
   */
  private getChromePaths(): string[] {
    const paths: { [key: string]: string[] } = {
      linux: [
        "/usr/bin/google-chrome-stable",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "/snap/bin/chromium",
        "/usr/local/bin/chrome",
        "/opt/google/chrome/chrome",
        "/usr/bin/google-chrome-unstable",
        "/usr/bin/chromium-browser-stable",
      ],
      darwin: [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/usr/local/bin/chrome",
        "/opt/homebrew/bin/chrome",
      ],
      win32: [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        `C:\\Users\\${os.userInfo().username}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
        "C:\\Program Files\\Chromium\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe",
      ],
    }

    return paths[this.platform] || paths.linux
  }

  /**
   * Validate and clean environment variable
   */
  private validateEnvironmentPath(): string | null {
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH

    if (!envPath) {
      return null
    }

    // Check for placeholder or invalid paths
    const invalidPaths = [
      "/path/to/chrome",
      "/path/to/chromium",
      "path/to/chrome",
      "C:\\path\\to\\chrome.exe",
      "/usr/bin/chrome-placeholder",
    ]

    if (invalidPaths.includes(envPath) || envPath.includes("placeholder") || envPath.includes("/path/to/")) {
      console.warn(`⚠️ PUPPETEER_EXECUTABLE_PATH contains placeholder value: ${envPath}`)
      console.warn("⚠️ Unsetting invalid environment variable")
      delete process.env.PUPPETEER_EXECUTABLE_PATH
      return null
    }

    // Check if path exists
    try {
      if (fs.existsSync(envPath)) {
        fs.accessSync(envPath, fs.constants.F_OK | fs.constants.X_OK)
        console.log(`✅ Using valid PUPPETEER_EXECUTABLE_PATH: ${envPath}`)
        return envPath
      } else {
        console.warn(`⚠️ PUPPETEER_EXECUTABLE_PATH path doesn't exist: ${envPath}`)
        delete process.env.PUPPETEER_EXECUTABLE_PATH
        return null
      }
    } catch (error) {
      console.warn(`⚠️ PUPPETEER_EXECUTABLE_PATH is not accessible: ${envPath}`)
      delete process.env.PUPPETEER_EXECUTABLE_PATH
      return null
    }
  }

  /**
   * Find existing Chrome installation
   */
  findChromeExecutable(): string | null {
    console.log(`🔍 Searching for Chrome executable on ${this.platform}...`)

    // First check environment variable
    const envPath = this.validateEnvironmentPath()
    if (envPath) {
      this.chromeExecutablePath = envPath
      return envPath
    }

    const possiblePaths = this.getChromePaths()

    for (const chromePath of possiblePaths) {
      try {
        if (fs.existsSync(chromePath)) {
          // Verify it's executable
          fs.accessSync(chromePath, fs.constants.F_OK | fs.constants.X_OK)
          console.log(`✅ Found Chrome at: ${chromePath}`)
          this.chromeExecutablePath = chromePath
          return chromePath
        }
      } catch (error) {
        // Continue searching
      }
    }

    console.log("❌ No existing Chrome installation found")
    return null
  }

  /**
   * Find Chrome installed by Puppeteer
   */
  private findPuppeteerChrome(): string | null {
    const possiblePuppeteerPaths = [
      // Local node_modules
      path.join(process.cwd(), "node_modules", "puppeteer", ".local-chromium"),
      path.join(process.cwd(), "node_modules", "@puppeteer", "browsers"),
      // Global cache
      path.join(os.homedir(), ".cache", "puppeteer"),
      path.join(os.homedir(), ".cache", "ms-playwright"),
      // Windows
      path.join(os.homedir(), "AppData", "Local", "ms-playwright"),
      // macOS
      path.join(os.homedir(), "Library", "Caches", "ms-playwright"),
    ]

    const findChromeInDir = (dir: string, depth = 0): string | null => {
      if (depth > 4) return null // Prevent deep recursion

      try {
        if (!fs.existsSync(dir)) return null

        const items = fs.readdirSync(dir)
        for (const item of items) {
          const itemPath = path.join(dir, item)

          try {
            const stat = fs.statSync(itemPath)

            if (stat.isDirectory()) {
              const result = findChromeInDir(itemPath, depth + 1)
              if (result) return result
            } else if (
              (item === "chrome" || item === "chrome.exe" || item === "chromium" || item === "chromium.exe") &&
              stat.mode & Number.parseInt("111", 8) // Check if executable
            ) {
              return itemPath
            }
          } catch (error) {
            // Skip files we can't access
          }
        }
      } catch (error) {
        // Directory not accessible
      }
      return null
    }

    for (const basePath of possiblePuppeteerPaths) {
      const chromeExe = findChromeInDir(basePath)
      if (chromeExe) {
        console.log(`✅ Found Puppeteer Chrome at: ${chromeExe}`)
        return chromeExe
      }
    }

    return null
  }

  /**
   * Install Chrome using various methods
   */
  async installChrome(): Promise<string | null> {
    console.log("📦 Attempting to install Chrome...")

    try {
      // Method 1: Use Puppeteer's built-in installer (recommended)
      console.log("📦 Method 1: Using Puppeteer's browser installer...")

      try {
        execSync("npx puppeteer browsers install chrome", {
          stdio: "inherit",
          timeout: 120000, // 2 minutes timeout
        })

        // Try to find the installed Chrome
        const puppeteerChrome = this.findPuppeteerChrome()
        if (puppeteerChrome) {
          console.log("✅ Chrome installed successfully via Puppeteer")
          this.chromeExecutablePath = puppeteerChrome
          return puppeteerChrome
        }
      } catch (error) {
        console.warn("⚠️ Puppeteer installer failed:", (error as Error).message)
      }

      // Method 2: Platform-specific installation (only if not serverless)
      if (!this.isServerless) {
        console.log("📦 Method 2: Platform-specific installation...")
        await this.installChromeByPlatform()

        const foundChrome = this.findChromeExecutable()
        if (foundChrome) {
          return foundChrome
        }
      }

      throw new Error("All Chrome installation methods failed")
    } catch (error) {
      console.error("❌ Chrome installation failed:", (error as Error).message)
      throw error
    }
  }

  /**
   * Install Chrome using platform-specific package managers
   */
  private async installChromeByPlatform(): Promise<void> {
    try {
      switch (this.platform) {
        case "linux":
          console.log("🐧 Installing Chrome on Linux...")
          try {
            // Try apt-get first (Ubuntu/Debian)
            execSync("sudo apt-get update && sudo apt-get install -y google-chrome-stable", {
              stdio: "inherit",
              timeout: 180000, // 3 minutes
            })
          } catch {
            try {
              // Try yum (CentOS/RHEL)
              execSync("sudo yum install -y google-chrome-stable", { stdio: "inherit" })
            } catch {
              try {
                // Try snap
                execSync("sudo snap install chromium", { stdio: "inherit" })
              } catch {
                console.warn("⚠️ All Linux installation methods failed")
              }
            }
          }
          break

        case "darwin":
          console.log("🍎 Installing Chrome on macOS...")
          try {
            // Try Homebrew
            execSync("brew install --cask google-chrome", { stdio: "inherit" })
          } catch {
            console.log("⚠️ Homebrew not available or failed")
            console.log("💡 Please install Chrome manually from: https://www.google.com/chrome/")
          }
          break

        case "win32":
          console.log("🪟 Chrome installation on Windows requires manual download")
          console.log("💡 Please download Chrome from: https://www.google.com/chrome/")
          break

        default:
          console.log(`⚠️ Unsupported platform: ${this.platform}`)
      }
    } catch (error) {
      console.warn(`⚠️ Platform-specific installation failed: ${(error as Error).message}`)
    }
  }

  /**
   * Get the best Chrome configuration for Puppeteer
   */
  async getChromeConfig(): Promise<any> {
    console.log("🔧 Getting Chrome configuration...")

    // First, try to find existing Chrome
    let executablePath = this.findChromeExecutable()

    // If not found and not serverless, try to install
    if (!executablePath && !this.isServerless) {
      console.log("🔧 Chrome not found, attempting installation...")
      try {
        executablePath = await this.installChrome()
      } catch (error) {
        console.warn("⚠️ Chrome installation failed, will use bundled Chromium")
      }
    }

    console.log("⚠️ No Chrome executable found - using Puppeteer's bundled Chromium")
    const config: any = {
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
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--window-size=1280,720",
      ],
      defaultViewport: { width: 1280, height: 720 },
    }

    // Force use of bundled Chromium if no executable path found
    if (!executablePath) {
      console.log("🔄 Forcing use of bundled Chromium")
      // Explicitly unset any Chrome-related environment variables
      delete process.env.PUPPETEER_EXECUTABLE_PATH
      delete process.env.PUPPETEER_CACHE_DIR

      // Don't set executablePath - let Puppeteer use its bundled version
      console.log("✅ Configuration set for bundled Chromium")
    } else {
      config.executablePath = executablePath
      console.log(`✅ Using Chrome at: ${executablePath}`)
    }

    // Additional args for serverless environments
    if (this.isServerless) {
      config.args.push(
        "--single-process",
        "--no-zygote",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-dev-tools",
      )
      console.log("🌐 Applied serverless optimizations")
    }

    return config
  }

  /**
   * Test Chrome installation
   */
  async testChrome(): Promise<boolean> {
    console.log("🧪 Testing Chrome installation...")

    try {
      const puppeteer = await import("puppeteer")
      const config = await this.getChromeConfig()

      console.log("🧪 Launching browser for test...")
      const browser = await puppeteer.launch(config)

      console.log("🧪 Creating test page...")
      const page = await browser.newPage()

      console.log("🧪 Navigating to test URL...")
      await page.goto("https://example.com", {
        waitUntil: "networkidle0",
        timeout: 15000,
      })

      const title = await page.title()
      console.log(`🧪 Page title: ${title}`)

      await browser.close()
      console.log("✅ Chrome test successful!")

      return true
    } catch (error) {
      console.error("❌ Chrome test failed:", (error as Error).message)
      return false
    }
  }

  /**
   * Save Chrome configuration to file
   */
  async saveConfig(config: any): Promise<void> {
    const configPath = path.join(process.cwd(), "puppeteer-config.json")
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
      console.log(`💾 Configuration saved to: ${configPath}`)
    } catch (error) {
      console.warn("⚠️ Could not save configuration:", (error as Error).message)
    }
  }
}

/**
 * Main setup function for Puppeteer environment
 */
export async function setupPuppeteerEnvironment(): Promise<any> {
  console.log("🚀 Setting up Puppeteer environment...")
  console.log("=".repeat(50))

  const chromeManager = new PuppeteerChromeManager()

  try {
    // Get Chrome configuration
    const config = await chromeManager.getChromeConfig()
    console.log("\n📋 Chrome Configuration:")
    console.log(JSON.stringify(config, null, 2))

    // Test the setup
    const testResult = await chromeManager.testChrome()

    if (testResult) {
      // Save configuration
      await chromeManager.saveConfig(config)

      console.log("\n🎉 Setup completed successfully!")
      console.log("=".repeat(50))
      console.log("✅ Chrome is ready for Puppeteer")
      console.log("✅ Configuration saved")
      console.log("✅ Test passed")
      console.log("\n💡 Your email validation is now ready to use!")

      return config
    } else {
      throw new Error("Chrome test failed")
    }
  } catch (error) {
    console.error("\n❌ Setup failed:", (error as Error).message)
    console.log("\n🔧 Troubleshooting:")
    console.log("1. Try: npx puppeteer browsers install chrome")
    console.log("2. Install Chrome manually for your platform")
    console.log("3. Check permissions and PATH environment")
    console.log("4. For serverless, bundled Chromium should work")

    // Return a basic config that might still work
    const fallbackConfig = {
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
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--window-size=1280,720",
        "--single-process",
        "--no-zygote",
        "--disable-gpu",
        "--disable-software-rasterizer",
      ],
      defaultViewport: { width: 1280, height: 720 },
    }

    // Save fallback config
    await chromeManager.saveConfig(fallbackConfig)
    return fallbackConfig
  }
}
