
import { google } from 'googleapis';

export default async function handler(req, res) {
    try {
        const { calendarId = 'primary', date } = req.query; // Default to 'primary' or use a specific ID if known

        // SECURITY: Use environment variables. Never hardcode keys.
        const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
        // Robustly handle the private key from various ENV formats
        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        let key = process.env.GOOGLE_PRIVATE_KEY;

        console.log('--- Env Debug ---');
        console.log('Email defined:', !!email);
        console.log('Key defined:', !!key);
        if (email) console.log('Email length:', email.length);
        if (key) {
            console.log('Key length:', key.length);
            console.log('Key starts with:', key.substring(0, 30));
        }
        console.log('-----------------');

        if (!key || !email) {
            const missing = !key ? 'GOOGLE_PRIVATE_KEY' : 'GOOGLE_SERVICE_ACCOUNT_EMAIL';
            console.error(`Missing Google Credential: ${missing}`);
            return res.status(500).json({
                error: `Server configuration error: Missing ${missing}`,
                debug: {
                    emailDefined: !!email,
                    keyDefined: !!key,
                    emailLen: email ? email.length : 0,
                    keyLen: key ? key.length : 0
                }
            });
        }

        // Format key
        key = key.replace(/^["']|["']$/g, '');
        key = key.replace(/\\n/g, '\n');

        const auth = new google.auth.JWT({
            email: email,
            key: key,
            scopes: SCOPES,
        });

        const calendar = google.calendar({ version: 'v3', auth });

        // Calculate timeMin and timeMax
        const targetDate = date ? new Date(date) : new Date();
        const timeMin = new Date(targetDate.setHours(0, 0, 0, 0)).toISOString();

        // Use endDate if provided, otherwise default to the same targetDate (for a single day)
        const targetEndDate = req.query.endDate ? new Date(req.query.endDate) : new Date(targetDate);
        const timeMax = new Date(targetEndDate.setHours(23, 59, 59, 999)).toISOString();

        const response = await calendar.events.list({
            calendarId: calendarId, // Use the ID from query or env
            timeMin: timeMin,
            timeMax: timeMax,
            singleEvents: true,
            orderBy: 'startTime',
        });

        res.status(200).json(response.data.items);
    } catch (error) {
        console.error('Google Calendar API Error:', error);
        res.status(500).json({ error: 'Failed to fetch calendar events', details: error.message });
    }
}
