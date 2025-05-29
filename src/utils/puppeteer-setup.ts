import { execSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

/**
 * Comprehensive Chrome detection and installation for Puppeteer
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
      process.env.HEROKU_APP_NAME
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
      ],
      darwin: [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/usr/local/bin/chrome",
      ],
      win32: [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Users\\%USERNAME%\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Chromium\\Application\\chrome.exe",
      ],
    }

    return paths[this.platform] || paths.linux
  }

  /**
   * Find existing Chrome installation
   */
  findChromeExecutable(): string | null {
    console.log(`🔍 Searching for Chrome executable on ${this.platform}...`)

    const possiblePaths = this.getChromePaths()

    for (const chromePath of possiblePaths) {
      const expandedPath = chromePath.replace("%USERNAME%", os.userInfo().username)

      try {
        if (fs.existsSync(expandedPath)) {
          // Verify it's executable
          fs.accessSync(expandedPath, fs.constants.F_OK | fs.constants.X_OK)
          console.log(`✅ Found Chrome at: ${expandedPath}`)
          this.chromeExecutablePath = expandedPath
          return expandedPath
        }
      } catch (error) {
        // Continue searching
      }
    }

    console.log("❌ No existing Chrome installation found")
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

      // Method 2: Platform-specific installation
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
   * Find Chrome installed by Puppeteer
   */
  private findPuppeteerChrome(): string | null {
    const possiblePuppeteerPaths = [
      // Local node_modules
      path.join(process.cwd(), "node_modules", "puppeteer", ".local-chromium"),
      // Global cache
      path.join(os.homedir(), ".cache", "puppeteer"),
      path.join(os.homedir(), ".cache", "ms-playwright"),
      // Windows
      path.join(os.homedir(), "AppData", "Local", "ms-playwright"),
    ]

    for (const basePath of possiblePuppeteerPaths) {
      try {
        if (fs.existsSync(basePath)) {
          // Look for Chrome executable in subdirectories
          const findChromeInDir = (dir: string): string | null => {
            try {
              const items = fs.readdirSync(dir)
              for (const item of items) {
                const itemPath = path.join(dir, item)
                const stat = fs.statSync(itemPath)

                if (stat.isDirectory()) {
                  const result = findChromeInDir(itemPath)
                  if (result) return result
                } else if (
                  (item === "chrome" || item === "chrome.exe" || item === "chromium") &&
                  stat.mode & Number.parseInt("111", 8) // Check if executable
                ) {
                  return itemPath
                }
              }
            } catch (error) {
              // Continue searching
            }
            return null
          }

          const chromeExe = findChromeInDir(basePath)
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
            execSync("sudo apt-get update && sudo apt-get install -y google-chrome-stable", { stdio: "inherit" })
          } catch {
            try {
              // Try yum (CentOS/RHEL)
              execSync("sudo yum install -y google-chrome-stable", { stdio: "inherit" })
            } catch {
              // Try snap
              execSync("sudo snap install chromium", { stdio: "inherit" })
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
          }
          break

        case "win32":
          console.log("🪟 Chrome installation on Windows requires manual download")
          console.log("Please download Chrome from: https://www.google.com/chrome/")
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

    // If not found, try to install
    if (!executablePath) {
      console.log("🔧 Chrome not found, attempting installation...")
      try {
        executablePath = await this.installChrome()
      } catch (error) {
        console.warn("⚠️ Chrome installation failed, will use bundled Chromium")
      }
    }

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

    // Add executable path if found
    if (executablePath) {
      config.executablePath = executablePath
      console.log(`✅ Using Chrome at: ${executablePath}`)
    } else {
      console.log("⚠️ No Chrome executable found - using Puppeteer's bundled Chromium")
    }

    // Additional args for serverless environments
    if (this.isServerless) {
      config.args.push("--single-process", "--no-zygote", "--disable-gpu", "--disable-software-rasterizer")
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
      await page.goto("https://example.com", { waitUntil: "networkidle0", timeout: 10000 })

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
}
