import axios from 'axios';

// Environment variables for security
const CLIENT_ID = process.env.FAA_CLIENT_ID;
const CLIENT_SECRET = process.env.FAA_CLIENT_SECRET;

// Restrict to your production domain for better security
const ALLOWED_ORIGIN = process.env.NODE_ENV === 'production' 
    ? 'https://your-production-domain.com' // Replace with your actual domain
    : '*'; // Allow all for local development

export default async function handler(request, response) {
    // Set CORS headers for all responses
    response.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS requests for CORS
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    const icao = (request.query.icao || '').toUpperCase();
    if (!icao || !/^[A-Z]{4}$/.test(icao)) {
        return response.status(400).json({ error: "Invalid ICAO code provided" });
    }

    try {
        const url = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=50`;
        
        const notamRes = await axios.get(url, {
            headers: {
                'client_id': CLIENT_ID,
                'client_secret': CLIENT_SECRET,
                'Accept': 'application/json'
            },
            timeout: 15000 // Good practice to have a timeout
        });

        const items = notamRes.data?.items || [];
        const parsed = items.map(item => {
            const core = item.properties?.coreNOTAMData?.notam || {};
            const translation = item.properties?.coreNOTAMData?.notamTranslation?.[0] || {};
            const qLine = translation.formattedText?.split('\n')[0] || '';
            const key = core.id || core.number || qLine; // More robust unique key

            return {
                id: key,
                number: core.number || '',
                type: core.type || '',
                classification: core.classification || '',
                icao: core.icaoLocation || core.location || '',
                location: core.location || '',
                validFrom: core.effectiveStart || core.issued || '',
                validTo: core.effectiveEnd || '',
                summary: translation.simpleText || translation.formattedText || '',
                body: core.text || '',
                qLine: qLine,
            };
        });
        
        return response.status(200).json(parsed);

    } catch (err) {
        // Log the detailed error on the server
        console.error(`[ERROR] FAA API call for ${icao} failed:`, err.message);
        
        // Return a generic error to the client
        const statusCode = err.response?.status || 500;
        return response.status(statusCode).json({ error: "Failed to fetch data from FAA API." });
    }
}
