/**
 * API endpoint for NOTAM translation
 * Integrates with your existing NotamO API structure
 */

import NotamTranslationEngine from '../notam-translator-engine.js';

// Initialize the translation engine
let translationEngine = null;

function getTranslationEngine() {
  if (!translationEngine) {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY environment variable is required');
    }
    translationEngine = new NotamTranslationEngine(groqApiKey);
  }
  return translationEngine;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { notamText, options = {} } = req.body;

    if (!notamText || typeof notamText !== 'string') {
      return res.status(400).json({ 
        error: 'notamText is required and must be a string' 
      });
    }

    const engine = getTranslationEngine();
    const result = await engine.translateNotam(notamText, options);

    // Add metadata
    result.timestamp = new Date().toISOString();
    result.originalLength = notamText.length;
    result.translationLength = result.translation.length;

    return res.status(200).json(result);

  } catch (error) {
    console.error('Translation API error:', error);
    
    return res.status(500).json({ 
      error: 'Translation failed',
      details: error.message,
      fallback: error.message.includes('API') ? 'API service unavailable' : 'Internal error'
    });
  }
}