import axios from 'axios';

// Environment variables for security
const CLIENT_ID = process.env.FAA_CLIENT_ID;
const CLIENT_SECRET = process.env.FAA_CLIENT_SECRET;

const ALLOWED_ORIGIN = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : '*';

export default async function handler(request, response) {
    response.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    const icao = (request.query.icao || '').toUpperCase();
    if (!icao || !/^[A-Z0-9]{4}$/.test(icao)) {
        return response.status(400).json({ error: "Invalid ICAO code provided" });
    }

    try {
        // Primary FAA Fetch
        const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=250`;
        let faaItems = [];
        try {
            const notamRes = await axios.get(faaUrl, {
                headers: { 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET },
                timeout: 10000
            });
            faaItems = notamRes.data?.items || [];
        } catch (e) {
            console.warn(`FAA fetch for ${icao} failed. Message: ${e.message}. Will try NAV CANADA if applicable.`);
        }

        let parsed = faaItems.map(item => {
            const core = item.properties?.coreNOTAMData?.notam || {};
            const trans = item.properties?.coreNOTAMData?.notamTranslation?.[0] || {};
            return {
                id: core.id || `${core.number}-${core.icaoLocation}`,
                number: core.number || 'N/A',
                summary: trans.simpleText || core.text || 'No summary.',
                validFrom: core.effectiveStart,
                validTo: core.effectiveEnd,
                source: 'FAA'
            };
        });

        // NAV CANADA Fallback/Augment for 'C' ICAOs
        if (icao.startsWith('C')) {
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { timeout: 5000 });
                const navNotams = navRes.data?.Alpha?.notam || [];
                const navParsed = navNotams.map(notam => ({
                    id: notam.id || `${icao}-navcanada-${notam.start}`,
                    number: notam.id || 'N/A',
                    summary: notam.text?.replace(/\\n/g, '\n') || 'No summary.',
                    validFrom: notam.start,
                    validTo: notam.end,
                    source: 'NAV CANADA'
                }));
                // Combine and remove duplicates, giving preference to FAA data if ID matches
                const navIds = new Set(navParsed.map(n => n.id));
                const filteredFaa = parsed.filter(n => !navIds.has(n.id));
                parsed = [...filteredFaa, ...navParsed];
            } catch (e) {
                console.warn(`NAV CANADA fetch for ${icao} failed: ${e.message}`);
            }
        }
        
        // Final filtering and sorting
        const now = new Date();
        const finalNotams = parsed
            .filter(n => !n.validTo || n.validTo === 'PERMANENT' || new Date(n.validTo) >= now)
            .sort((a, b) => (new Date(b.validFrom) || 0) - (new Date(a.validFrom) || 0));

        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return response.status(200).json(finalNotams);

    } catch (err) {
        console.error(`[API ERROR] for ${icao}:`, err.message);
        return response.status(500).json({ error: "Failed to fetch data." });
    }
}
