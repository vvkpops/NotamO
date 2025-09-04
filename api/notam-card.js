import axios from 'axios';
import { parseRawNotam } from './parser.js';
// Correctly import from the new shared utilities file in the /src directory
import { getHeadClass, getHeadTitle, extractRunways, getTimeStatus } from '../src/notam-shared-utils.js';

// Environment variables for security
const CLIENT_ID = process.env.FAA_CLIENT_ID;
const CLIENT_SECRET = process.env.FAA_CLIENT_SECRET;

// Allow requests from any origin.
const ALLOWED_ORIGIN = '*';

const TIMEZONE_OFFSETS = {
    'EST': -5, 'CST': -6, 'MST': -7, 'PST': -8, 'AST': -4, 'NST': -3.5, 'AKST': -9, 'HST': -10,
    'EDT': -4, 'CDT': -5, 'MDT': -6, 'PDT': -7, 'ADT': -3, 'NDT': -2.5, 'AKDT': -8,
    'UTC': 0, 'GMT': 0, 'Z': 0, 'ZULU': 0,
    'CET': 1, 'EET': 2, 'WET': 0, 'CEST': 2, 'EEST': 3, 'WEST': 1, 'BST': 1,
    'JST': 9, 'AEST': 10, 'AEDT': 11, 'AWST': 8, 'NZST': 12, 'NZDT': 13,
};

function parseNotamDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    const upperDateString = dateString.toUpperCase().trim();
    if (upperDateString === 'PERM' || upperDateString === 'PERMANENT') return 'PERMANENT';
    if (upperDateString.includes('T')) {
        let isoString = dateString;
        if (!upperDateString.endsWith('Z')) isoString += 'Z';
        const d = new Date(isoString);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    const match = upperDateString.match(/^(\d{10})([A-Z]{2,4})?$/);
    if (match) {
        const dt = match[1];
        const timezoneCode = match[2] || 'UTC';
        const year = `20${dt.substring(0, 2)}`;
        const month = dt.substring(2, 4);
        const day = dt.substring(4, 6);
        const hour = dt.substring(6, 8);
        const minute = dt.substring(8, 10);
        if (parseInt(month) < 1 || parseInt(month) > 12 || parseInt(day) < 1 || parseInt(day) > 31 || parseInt(hour) < 0 || parseInt(hour) > 23 || parseInt(minute) < 0 || parseInt(minute) > 59) return null;
        const offsetHours = TIMEZONE_OFFSETS[timezoneCode] || 0;
        const tempDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute)));
        if (isNaN(tempDate.getTime())) return null;
        const utcTime = tempDate.getTime() - (offsetHours * 60 * 60 * 1000);
        const utcDate = new Date(utcTime);
        return isNaN(utcDate.getTime()) ? null : utcDate.toISOString();
    }
    return null;
}

const formatToIcaoDate = (isoDate) => {
    if (!isoDate || isoDate.toString().toUpperCase().includes('PERM')) return 'PERM';
    try {
        const date = new Date(isoDate);
        if (isNaN(date.getTime())) return isoDate;
        const year = date.getUTCFullYear().toString().slice(-2);
        const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = date.getUTCDate().toString().padStart(2, '0');
        const hour = date.getUTCHours().toString().padStart(2, '0');
        const minute = date.getUTCMinutes().toString().padStart(2, '0');
        return `${year}${month}${day}${hour}${minute}`;
    } catch (e) { return isoDate; }
};

const formatNotamToIcao = (notam, originalRawText) => {
    if (originalRawText && originalRawText.includes('Q)') && originalRawText.includes('A)')) {
        return originalRawText;
    }
    const parsed = parseRawNotam(originalRawText) || {};
    let icaoFormatted = '';
    if (notam.number && notam.number !== 'N/A') {
        icaoFormatted += `${notam.number}`;
        if (parsed.isCancellation && parsed.cancelsNotam) {
            icaoFormatted += ` NOTAMC ${parsed.cancelsNotam}`;
        }
        icaoFormatted += '\n';
    }
    const airportCode = parsed.aerodrome || notam.icao || 'XXXX';
    icaoFormatted += `Q) ${parsed.qLine || `${airportCode}/QXXXX/IV/M/A/000/999/0000N00000W000`}\n`;
    icaoFormatted += `A) ${parsed.aerodrome || notam.icao}\n`;
    icaoFormatted += `B) ${parsed.validFromRaw || formatToIcaoDate(notam.validFrom)}\n`;
    const toDate = parsed.validToRaw || formatToIcaoDate(notam.validTo);
    if (toDate) icaoFormatted += `C) ${toDate}\n`;
    if (parsed.schedule) icaoFormatted += `D) ${parsed.schedule}\n`;
    icaoFormatted += `E) ${parsed.body || originalRawText.replace(/\n/g, ' ').trim()}`;
    return icaoFormatted.trim();
};

const formatDisplayDate = (rawDate, fallbackDate) => {
    if (!rawDate && !fallbackDate) return 'N/A';
    const dateToUse = rawDate || fallbackDate;
    if (dateToUse === 'PERMANENT' || dateToUse === 'PERM') return 'PERM';
    try {
        const date = new Date(dateToUse);
        if (isNaN(date.getTime())) return dateToUse; // Return original string if invalid
        return date.toLocaleString('en-GB', {
            timeZone: 'UTC',
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }) + 'Z';
    } catch {
        return dateToUse;
    }
};

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
        let notamsFromSource = [];

        // Main FAA fetch
        try {
            const faaUrl = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=250`;
            const notamRes = await axios.get(faaUrl, { headers: { 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET }, timeout: 10000 });
            notamsFromSource = (notamRes.data?.items || []).map(item => {
                const core = item.properties?.coreNOTAMData?.notam || {};
                const formattedIcaoText = item.properties?.coreNOTAMData?.notamTranslation?.[0]?.formattedText;
                const originalRawText = formattedIcaoText || core.text || 'Full NOTAM text not available from source.';
                const parsed = parseRawNotam(originalRawText);
                return {
                    id: core.id || `${core.number}-${core.icaoLocation}`,
                    number: core.number || 'N/A',
                    validFrom: parseNotamDate(core.effectiveStart),
                    validTo: parseNotamDate(core.effectiveEnd),
                    source: 'FAA',
                    icao: core.icaoLocation || icao,
                    summary: originalRawText,
                    rawText: originalRawText,
                    isCancellation: parsed?.isCancellation || false,
                    cancels: parsed?.cancelsNotam || null,
                };
            });
        } catch (e) {
            console.warn(`FAA fetch for ${icao} failed. Message: ${e.message}.`);
        }

        // NAV CANADA Fallback
        if (icao.startsWith('C') && notamsFromSource.length === 0) {
            console.log(`FAA returned no NOTAMs for Canadian ICAO ${icao}. Falling back to NAV CANADA.`);
            try {
                const navUrl = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=notam`;
                const navRes = await axios.get(navUrl, { timeout: 10000 });
                notamsFromSource = (navRes.data?.data || []).map(notam => {
                    let originalRawText = 'Full NOTAM text not available from source.';
                    try {
                        const parsedText = JSON.parse(notam.text);
                        originalRawText = parsedText.raw?.replace(/\\n/g, '\n') || originalRawText;
                    } catch (e) {
                        if (typeof notam.text === 'string') originalRawText = notam.text;
                    }
                    const parsed = parseRawNotam(originalRawText);
                    return {
                        id: notam.pk || `${icao}-navcanada-${notam.startValidity}`,
                        number: parsed?.notamNumber || 'N/A',
                        validFrom: parseNotamDate(parsed?.validFromRaw) || parseNotamDate(notam.startValidity),
                        validTo: parseNotamDate(parsed?.validToRaw) || parseNotamDate(notam.endValidity),
                        source: 'NAV CANADA',
                        icao: parsed?.aerodrome?.split(' ')[0] || icao,
                        summary: originalRawText,
                        rawText: originalRawText,
                        isCancellation: parsed?.isCancellation || false,
                        cancels: parsed?.cancelsNotam || null,
                    };
                });
            } catch (e) {
                console.warn(`NAV CANADA fallback for ${icao} also failed: ${e.message}`);
            }
        }
        
        const finalNotams = notamsFromSource.map(notam => {
            const parsed = parseRawNotam(notam.rawText);
            const icaoFormattedText = formatNotamToIcao(notam, notam.rawText);
            
            const cardData = {
                headClass: getHeadClass(notam),
                headTitle: getHeadTitle(notam),
                runways: extractRunways(icaoFormattedText),
                timeStatus: getTimeStatus(notam),
                displayValidFrom: formatDisplayDate(parsed?.validFromRaw, notam.validFrom),
                displayValidTo: formatDisplayDate(parsed?.validToRaw, notam.validTo),
                icaoFormattedText: icaoFormattedText
            };

            return { ...notam, cardData };
        });

        const cancelledNotamNumbers = new Set(finalNotams.filter(n => n.isCancellation && n.cancels).map(n => n.cancels));
        const activeNotams = finalNotams
            .filter(n => !cancelledNotamNumbers.has(n.number))
            .sort((a, b) => {
                if (a.validFrom === 'PERMANENT') return 1;
                if (b.validFrom === 'PERMANENT') return -1;
                const dateA = new Date(a.validFrom || 0);
                const dateB = new Date(b.validFrom || 0);
                return isNaN(dateA.getTime()) ? 1 : isNaN(dateB.getTime()) ? -1 : dateB - dateA;
            });

        response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return response.status(200).json(activeNotams);

    } catch (err) {
        console.error(`[API ERROR] for ${icao}:`, err);
        return response.status(500).json({ error: "An internal server error occurred." });
    }
}