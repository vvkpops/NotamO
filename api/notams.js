import axios from 'axios';

// Environment variables for security
const CLIENT_ID = process.env.FAA_CLIENT_ID;
const CLIENT_SECRET = process.env.FAA_CLIENT_SECRET;

export default async function handler(request, response) {
    const icao = (request.query.icao || '').toUpperCase();
    if (!icao || icao.length !== 4) {
        return response.status(400).json({ error: "Invalid ICAO code" });
    }

    try {
        const url = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=50`;
        
        const notamRes = await axios.get(url, {
            headers: {
                'client_id': CLIENT_ID,
                'client_secret': CLIENT_SECRET,
                'Accept': 'application/json'
            },
            timeout: 15000
        });

        const items = notamRes.data.items || [];
        const parsed = items.map(item => {
            const core = item.properties?.coreNOTAMData?.notam || {};
            const translation = (item.properties?.coreNOTAMData?.notamTranslation || [])[0] || {};
            return {
                number: core.number || '',
                type: core.type || '',
                classification: core.classification || '',
                icao: core.icaoLocation || core.location || '',
                location: core.location || '',
                validFrom: core.effectiveStart || core.issued || '',
                validTo: core.effectiveEnd || '',
                summary: translation.simpleText || translation.formattedText || '',
                body: core.text || '',
                qLine: translation.formattedText?.split('\n')[0] || '',
            };
        });
        
        // Set CORS headers to allow requests from your domain
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        return response.status(200).json(parsed);

    } catch (err) {
        console.error(`[ERROR] FAA API call for ${icao} failed:`, err.message);
        return response.status(500).json({ error: "FAA API error", details: err.message });
    }
}
