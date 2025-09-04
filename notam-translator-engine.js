/**
 * NOTAM Translation Engine with Groq API
 * Converts technical ICAO NOTAM language to plain English
 */

// Configuration
const GROQ_CONFIG = {
  API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  MODEL: 'llama-3.1-8b-instant', // Fast and free model
  MAX_TOKENS: 300,
  TEMPERATURE: 0.3 // Lower temperature for more consistent translations
};

// Pattern-based translation templates for common NOTAMs
const NOTAM_PATTERNS = {
  runway_closed: {
    pattern: /RWY\s+(\d+[LRC]?)\s+(CLSD|CLOSED)/i,
    template: (match) => `Runway ${match[1]} is closed`,
    severity: 'critical'
  },
  runway_closure_scheduled: {
    pattern: /RWY\s+(\d+[LRC]?)\s+CLSD\s+(.+)\s+(WEF|FM|FROM)\s+(\d+)\s+(TIL|TO|UNTIL)\s+(\d+)/i,
    template: (match) => `Runway ${match[1]} is closed ${match[2]} from ${formatNotamDate(match[4])} until ${formatNotamDate(match[6])}`,
    severity: 'critical'
  },
  ils_out: {
    pattern: /ILS\s+RWY\s+(\d+[LRC]?)\s+(U\/S|OUT OF SERVICE|UNSERVICEABLE)/i,
    template: (match) => `ILS approach for runway ${match[1]} is out of service`,
    severity: 'high'
  },
  taxiway_closed: {
    pattern: /TWY\s+([A-Z\d]+)\s+(CLSD|CLOSED)/i,
    template: (match) => `Taxiway ${match[1]} is closed`,
    severity: 'medium'
  },
  fuel_unavailable: {
    pattern: /(FUEL|AVGAS|JET\s*A1?)\s+(NOT\s+AVAILABLE|UNAVAILABLE|U\/S)/i,
    template: (match) => `${match[1]} fuel is not available`,
    severity: 'medium'
  },
  lighting_out: {
    pattern: /(PAPI|VASI|ALS|REIL|EDGE\s+LGT|LIGHTING)\s+(U\/S|OUT OF SERVICE|UNSERVICEABLE)/i,
    template: (match) => `${match[1]} lighting system is out of service`,
    severity: 'medium'
  },
  construction: {
    pattern: /(CONSTRUCTION|CONST|WORK)\s+(.+)/i,
    template: (match) => `Construction work in progress: ${match[2].toLowerCase()}`,
    severity: 'medium'
  }
};

/**
 * NOTAM Translation Engine Class
 */
class NotamTranslationEngine {
  constructor(groqApiKey) {
    this.apiKey = groqApiKey;
    this.requestQueue = [];
    this.isProcessing = false;
    this.rateLimitDelay = 1100; // Groq free tier: ~14,400 requests/day
  }

  /**
   * Main translation method
   */
  async translateNotam(notamText, options = {}) {
    const {
      includeContext = true,
      priority = 'normal',
      timeout = 10000
    } = options;

    try {
      // Step 1: Try pattern-based translation first (instant)
      const patternResult = this.tryPatternTranslation(notamText);
      if (patternResult.success) {
        return {
          translation: patternResult.translation,
          method: 'pattern',
          confidence: patternResult.confidence,
          severity: patternResult.severity,
          processingTime: patternResult.processingTime
        };
      }

      // Step 2: Use Groq AI for complex NOTAMs
      const aiResult = await this.translateWithGroq(notamText, includeContext, timeout);
      return {
        translation: aiResult.translation,
        method: 'ai',
        confidence: aiResult.confidence,
        severity: this.assessSeverity(notamText),
        processingTime: aiResult.processingTime,
        usage: aiResult.usage
      };

    } catch (error) {
      console.error('Translation failed:', error);
      
      // Fallback to basic cleanup
      return {
        translation: this.basicCleanup(notamText),
        method: 'fallback',
        confidence: 0.3,
        severity: 'unknown',
        error: error.message
      };
    }
  }

  /**
   * Pattern-based translation for common NOTAMs
   */
  tryPatternTranslation(notamText) {
    const startTime = Date.now();
    
    for (const [key, pattern] of Object.entries(NOTAM_PATTERNS)) {
      const match = notamText.match(pattern.pattern);
      if (match) {
        const translation = pattern.template(match);
        return {
          success: true,
          translation: translation,
          confidence: 0.9,
          severity: pattern.severity,
          processingTime: Date.now() - startTime,
          pattern: key
        };
      }
    }

    return { success: false };
  }

  /**
   * AI translation using Groq
   */
  async translateWithGroq(notamText, includeContext, timeout) {
    const startTime = Date.now();

    // Add to queue for rate limiting
    await this.addToQueue();

    const prompt = this.buildPrompt(notamText, includeContext);

    const requestBody = {
      model: GROQ_CONFIG.MODEL,
      messages: [
        {
          role: "system",
          content: "You are an aviation expert who translates technical ICAO NOTAMs into clear, plain English that pilots can easily understand. Be concise but complete."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: GROQ_CONFIG.MAX_TOKENS,
      temperature: GROQ_CONFIG.TEMPERATURE,
      top_p: 1,
      stream: false
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(GROQ_CONFIG.API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Groq API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const translation = data.choices[0]?.message?.content?.trim();

      if (!translation) {
        throw new Error('Empty response from Groq API');
      }

      return {
        translation: this.postProcessTranslation(translation),
        confidence: this.calculateConfidence(translation, notamText),
        processingTime: Date.now() - startTime,
        usage: data.usage
      };

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Build optimized prompt for Groq
   */
  buildPrompt(notamText, includeContext) {
    const basePrompt = `Convert this aviation NOTAM to plain English:

"${notamText}"

Rules:
- Use simple, clear language
- Explain the operational impact on pilots
- Include timing information if present
- Mention safety implications
- Keep it concise (2-3 sentences max)
- Don't repeat the original NOTAM number

Plain English:`;

    if (includeContext) {
      return `${basePrompt}

Context: This is an official aviation Notice to Airmen (NOTAM) that pilots use for flight planning and safety.`;
    }

    return basePrompt;
  }

  /**
   * Post-process AI translation
   */
  postProcessTranslation(translation) {
    return translation
      .replace(/^(Plain English:|Translation:|Result:)\s*/i, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate confidence score
   */
  calculateConfidence(translation, originalText) {
    let confidence = 0.7; // Base confidence for AI translation

    // Boost confidence if translation contains key elements
    if (translation.toLowerCase().includes('runway') && originalText.toUpperCase().includes('RWY')) {
      confidence += 0.1;
    }
    if (translation.toLowerCase().includes('closed') && originalText.toUpperCase().includes('CLSD')) {
      confidence += 0.1;
    }
    if (translation.length > 20 && translation.length < 200) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Assess severity from NOTAM text
   */
  assessSeverity(notamText) {
    const text = notamText.toUpperCase();
    
    if (text.includes('CLOSED') || text.includes('CLSD') || text.includes('OUT OF SERVICE')) {
      return 'critical';
    }
    if (text.includes('RWY') || text.includes('ILS') || text.includes('DANGEROUS')) {
      return 'high';
    }
    if (text.includes('TWY') || text.includes('FUEL') || text.includes('LIGHTING')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Basic cleanup fallback
   */
  basicCleanup(notamText) {
    return notamText
      .replace(/\b(RWY|TWY)\b/g, match => match === 'RWY' ? 'Runway' : 'Taxiway')
      .replace(/\bCLSD\b/g, 'closed')
      .replace(/\bU\/S\b/g, 'out of service')
      .replace(/\bWEF\b/g, 'from')
      .replace(/\bTIL\b/g, 'until');
  }

  /**
   * Rate limiting queue
   */
  async addToQueue() {
    return new Promise((resolve) => {
      this.requestQueue.push(resolve);
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) return;

    this.isProcessing = true;
    const resolve = this.requestQueue.shift();
    
    // Rate limiting delay
    setTimeout(() => {
      this.isProcessing = false;
      resolve();
      this.processQueue(); // Process next item
    }, this.rateLimitDelay);
  }

  /**
   * Batch translation for multiple NOTAMs
   */
  async translateBatch(notams, options = {}) {
    const {
      maxConcurrent = 3,
      progressCallback = null
    } = options;

    const results = [];
    const chunks = this.chunkArray(notams, maxConcurrent);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkPromises = chunk.map(async (notam) => {
        try {
          const result = await this.translateNotam(notam.rawText || notam.summary);
          return { ...notam, translation: result };
        } catch (error) {
          return { ...notam, translation: { error: error.message, method: 'error' } };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      if (progressCallback) {
        progressCallback(results.length, notams.length);
      }
    }

    return results;
  }

  /**
   * Utility: Chunk array
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get usage statistics
   */
  getUsageStats() {
    return {
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessing,
      rateLimitDelay: this.rateLimitDelay
    };
  }
}

/**
 * Utility functions
 */
function formatNotamDate(dateStr) {
  if (!dateStr) return dateStr;
  
  // Handle YYMMDDHHMM format
  if (/^\d{10}$/.test(dateStr)) {
    const year = 2000 + parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4)) - 1;
    const day = parseInt(dateStr.substring(4, 6));
    const hour = parseInt(dateStr.substring(6, 8));
    const minute = parseInt(dateStr.substring(8, 10));
    
    const date = new Date(year, month, day, hour, minute);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' UTC';
  }
  
  return dateStr;
}

// Export for use in your NotamO application
export default NotamTranslationEngine;

// For CommonJS environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NotamTranslationEngine;
}