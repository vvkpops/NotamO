/**
 * Simple NOTAM Translation API using Groq
 * Same as before but with better error handling
 */

// Pattern-based translations for instant responses
const NOTAM_PATTERNS = {
  runway_closed: {
    pattern: /RWY\s+(\d+[LRC]?)\s+(CLSD|CLOSED)/i,
    template: (match) => `Runway ${match[1]} is closed`,
    confidence: 0.95
  },
  taxiway_closed: {
    pattern: /TWY\s+([A-Z\d]+)\s+(CLSD|CLOSED)/i,
    template: (match) => `Taxiway ${match[1]} is closed`,
    confidence: 0.95
  },
  ils_out: {
    pattern: /ILS\s+RWY\s+(\d+[LRC]?)\s+(U\/S|OUT OF SERVICE)/i,
    template: (match) => `ILS approach for runway ${match[1]} is out of service`,
    confidence: 0.90
  },
  fuel_unavailable: {
    pattern: /(FUEL|AVGAS|JET\s*A1?)\s+(NOT\s+AVAILABLE|UNAVAILABLE)/i,
    template: (match) => `${match[1]} fuel is not available`,
    confidence: 0.85
  }
};

function tryPatternTranslation(notamText) {
  for (const [key, pattern] of Object.entries(NOTAM_PATTERNS)) {
    const match = notamText.match(pattern.pattern);
    if (match) {
      return {
        success: true,
        translation: pattern.template(match),
        method: 'pattern',
        confidence: pattern.confidence,
        severity: key.includes('closed') ? 'critical' : 'medium'
      };
    }
  }
  return { success: false };
}

async function translateWithGroq(notamText) {
  const groqApiKey = process.env.GROQ_API_KEY;
  
  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: 'You are an aviation expert. Convert technical ICAO NOTAMs into clear, plain English that pilots can easily understand. Be concise but complete.'
        },
        {
          role: 'user',
          content: `Convert this aviation NOTAM to plain English:

"${notamText}"

Rules:
- Use simple, clear language
- Explain the operational impact on pilots
- Include timing information if present
- Keep it under 3 sentences
- Don't repeat the original NOTAM number

Plain English:`
        }
      ],
      max_tokens: 200,
      temperature: 0.3
    })
  });

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
    translation: translation.replace(/^(Plain English:|Translation:|Result:)\s*/i, ''),
    method: 'ai',
    confidence: 0.8,
    severity: 'medium'
  };
}

function basicCleanup(notamText) {
  return notamText
    .replace(/\b(RWY|TWY)\b/g, match => match === 'RWY' ? 'Runway' : 'Taxiway')
    .replace(/\bCLSD\b/g, 'closed')
    .replace(/\bU\/S\b/g, 'out of service')
    .replace(/\bWEF\b/g, 'from')
    .replace(/\bTIL\b/g, 'until');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { notamText } = req.body;

    if (!notamText || typeof notamText !== 'string') {
      return res.status(400).json({ 
        error: 'notamText is required and must be a string' 
      });
    }

    const startTime = Date.now();

    // Step 1: Try pattern-based translation (instant)
    const patternResult = tryPatternTranslation(notamText);
    if (patternResult.success) {
      return res.status(200).json({
        translation: patternResult.translation,
        method: patternResult.method,
        confidence: patternResult.confidence,
        severity: patternResult.severity,
        processingTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    }

    // Step 2: Use Groq AI for complex NOTAMs
    try {
      const aiResult = await translateWithGroq(notamText);
      return res.status(200).json({
        translation: aiResult.translation,
        method: aiResult.method,
        confidence: aiResult.confidence,
        severity: aiResult.severity,
        processingTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    } catch (aiError) {
      console.warn('Groq AI failed, using fallback:', aiError.message);
      
      // Step 3: Fallback to basic cleanup
      return res.status(200).json({
        translation: basicCleanup(notamText),
        method: 'fallback',
        confidence: 0.3,
        severity: 'unknown',
        processingTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        warning: 'AI translation unavailable, using basic cleanup'
      });
    }

  } catch (error) {
    console.error('Translation API error:', error);
    
    return res.status(500).json({ 
      error: 'Translation failed',
      details: error.message
    });
  }
}