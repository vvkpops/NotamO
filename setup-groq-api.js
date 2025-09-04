/**
 * Setup script and configuration for Groq API
 */

// Environment Variables Setup Guide
const ENV_SETUP = `
# Add this to your .env file or Vercel environment variables

GROQ_API_KEY=your_groq_api_key_here

# Get your free API key from: https://console.groq.com/
# Free tier includes: 14,400 requests per day
# Rate limit: ~1 request per second
`;

// Vercel Environment Variables Setup
const VERCEL_SETUP = `
1. Go to your Vercel dashboard
2. Select your NotamO project
3. Go to Settings > Environment Variables
4. Add: GROQ_API_KEY = your_actual_api_key
5. Redeploy your application
`;

// Installation Commands
const INSTALLATION = `
# 1. Get your Groq API key
echo "Visit https://console.groq.com/ to get your free API key"

# 2. Add the translation engine files to your project
# - Copy notam-translator-engine.js to your project root
# - Copy api/translate-notam.js to your api directory
# - Copy the React components to src/components/
# - Add the CSS to your stylesheets

# 3. Set environment variables
echo "GROQ_API_KEY=your_key_here" >> .env

# 4. Import the CSS in your main index.jsx
# Add: import './css/notam-translation.css';

# 5. Test the translation API
curl -X POST http://localhost:3000/api/translate-notam \\
  -H "Content-Type: application/json" \\
  -d '{"notamText":"RWY 09/27 CLSD DUE CONST"}'
`;

console.log('Groq API Setup Instructions:');
console.log('==============================');
console.log(ENV_SETUP);
console.log('\nVercel Setup:');
console.log('=============');
console.log(VERCEL_SETUP);
console.log('\nInstallation:');
console.log('=============');
console.log(INSTALLATION);

export { ENV_SETUP, VERCEL_SETUP, INSTALLATION };