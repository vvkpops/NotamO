const express = require('express');
const axios = require('axios');
const config = require('./config.json');
const basicAuth = require('express-basic-auth');

const CLIENT_ID = config.faa_client_id;
const CLIENT_SECRET = config.faa_client_secret;

const app = express();

// --- Basic Authentication Middleware ---
app.use(basicAuth({
    users: { 'vvkpops': 'vvkpops' },
    challenge: true,
    realm: 'NotamDashboard',
}));

// --- Serve Static Frontend Files ---
app.use(express.static('public'));

// --- API Endpoint for NOTAMs ---
app.get('/api/notams', async (req, res) => {
    const icao = (req.query.icao || '').toUpperCase();
    if (!icao || icao.length !== 4) {
        return res.status(400).json({ error: "Invalid ICAO code" });
    }

    try {
        const url = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${icao}&responseFormat=geoJson&pageSize=50`;
        const notamRes = await axios.get(url, {
            headers: {
                'client_id': CLIENT_ID,
                'client_secret': CLIENT_SECRET
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
        
        res.json(parsed);

    } catch (err) {
        console.error(`[ERROR] FAA API call for ${icao} failed:`, err.message);
        res.status(500).json({ error: "FAA API error", details: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`NOTAM app running at http://localhost:${PORT}`);
});
