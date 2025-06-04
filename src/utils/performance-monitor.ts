interface ValidationMetrics {
  totalValidations: number
  successfulValidations: number
  failedValidations: number
  averageResponseTime: number
  cacheHits: number
  cacheMisses: number
  lastValidationTime: number
}

class PerformanceMonitor {
  private metrics: ValidationMetrics = {
    totalValidations: 0,
    successfulValidations: 0,
    failedValidations: 0,
    averageResponseTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    lastValidationTime: 0,
  }

  private responseTimes: number[] = []
  private maxStoredTimes = 100 // Keep last 100 response times

  recordValidation(responseTime: number, success: boolean) {
    this.metrics.totalValidations++
    this.metrics.lastValidationTime = Date.now()

    if (success) {
      this.metrics.successfulValidations++
    } else {
      this.metrics.failedValidations++
    }

    // Store response time
    this.responseTimes.push(responseTime)
    if (this.responseTimes.length > this.maxStoredTimes) {
      this.responseTimes.shift()
    }

    // Calculate average response time
    this.metrics.averageResponseTime =
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
  }

  recordCacheHit() {
    this.metrics.cacheHits++
  }

  recordCacheMiss() {
    this.metrics.cacheMisses++
  }

  getStats(): ValidationMetrics {
    return { ...this.metrics }
  }

  getDetailedStats() {
    const stats = this.getStats()
    const successRate = stats.totalValidations > 0 ? (stats.successfulValidations / stats.totalValidations) * 100 : 0
    const cacheHitRate =
      stats.cacheHits + stats.cacheMisses > 0 ? (stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100 : 0

    return {
      ...stats,
      successRate: Math.round(successRate * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      recentResponseTimes: this.responseTimes.slice(-10), // Last 10 response times
    }
  }

  reset() {
    this.metrics = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      averageResponseTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lastValidationTime: 0,
    }
    this.responseTimes = []
  }
}

export const performanceMonitor = new PerformanceMonitor()
