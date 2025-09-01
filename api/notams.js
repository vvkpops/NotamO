import axios from 'axios';
import { parseRawNotam } from './parser.js'; // The parser is still useful for identifying cancellations

// Environment variables for security
const CLIENT_ID = process.env.FAA_CLIENT_ID;
const CLIENT_SECRET = process.env.FAA_CLIENT_SECRET;

const ALLOWED_ORIGIN = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:5173';

// A more robust date parser
const parseDate = (s) => {
    if (!s || s === 'PERMANENT') return null;
    let iso = s.trim().replace(' ', 'T');
    if (!/Z$|[+-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
};

export default async function handler(request, response) {
    response.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Vary', 'Origin');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    const icao = (request.query.icao || '').toUpperCase();
    if (!icao || !/^[A-Z0-9]{4}$/.test(icao)) {
        return response.status(400).json({ error: "Invalid ICAO code provided" });
    }

    try {
        let faaItems = [];
        try {
            const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=250`;
            const notamRes = await axios.get(faaUrl, {
                headers: { 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET },
                timeout: 10000
            });
            faaItems = notamRes.data?.items || [];
        } catch (e) {
            console.warn(`FAA fetch for ${icao} failed. Message: ${e.message}.`);
        }

        let combinedNotams = faaItems.map(item => {
            const core = item.properties?.coreNOTAMData?.notam || {};
            const rawText = core.text || 'Full NOTAM text not available from source.';
            const parsed = parseRawNotam(rawText);

            return {
                id: core.id || `${core.number}-${core.icaoLocation}`,
                number: core.number || 'N/A',
                summary: rawText, 
                rawText: rawText, // Ensure rawText is always populated
                validFrom: core.effectiveStart,
                validTo: core.effectiveEnd,
                source: 'FAA',
                isCancellation: parsed?.isCancellation || false,
                cancels: parsed?.cancelsNotam || null
            };
        });

        if (icao.startsWith('C')) {
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { timeout: 5000 });
                const navNotams = navRes.data?.Alpha?.notam || [];
                
                const navParsed = navNotams.map(notam => {
                    const rawText = notam.text?.replace(/\\n/g, '\n') || 'Full NOTAM text not available from source.';
                    const parsed = parseRawNotam(rawText);

                    return {
                        id: notam.id || `${icao}-navcanada-${notam.start}`,
                        number: notam.id || 'N/A',
                        summary: rawText,
                        rawText: rawText, // Ensure rawText is always populated
                        validFrom: notam.start,
                        validTo: notam.end,
                        source: 'NAV CANADA',
                        isCancellation: parsed?.isCancellation || false,
                        cancels: parsed?.cancelsNotam || null
                    };
                });
                
                const faaNumbers = new Set(combinedNotams.map(n => n.number));
                const uniqueNavNotams = navParsed.filter(n => !faaNumbers.has(n.number));
                combinedNotams.push(...uniqueNavNotams);

            } catch (e) {
                console.warn(`NAV CANADA fetch for ${icao} failed: ${e.message}`);
            }
        }
        
        const cancelledNotamNumbers = new Set();
        combinedNotams.forEach(n => {
            if (n.isCancellation && n.cancels) {
                cancelledNotamNumbers.add(n.cancels);
            }
        });

        const now = new Date();
        const finalNotams = combinedNotams
            .filter(n => {
                if (cancelledNotamNumbers.has(n.number)) {
                    return false;
                }
                if (n.isCancellation) return true;
                if (!n.validTo || n.validTo === 'PERMANENT') return true;
                const validToDate = parseDate(n.validTo);
                return validToDate ? validToDate >= now : true;
            })
            .sort((a, b) => {
                const dateA = parseDate(a.validFrom);
                const dateB = parseDate(b.validFrom);
                if (!dateA) return 1;
                if (!dateB) return -1;
                return dateB - dateA;
            });

        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return response.status(200).json(finalNotams);

    } catch (err) {
        console.error(`[API ERROR] for ${icao}:`, err.message);
        return response.status(500).json({ error: "An internal server error occurred." });
    }
}
