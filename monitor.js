const { chromium } = require('playwright');

const BASE_URL = 'https://ticket.vanillasky.ge/en/flights-form';
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Your specific itinerary
const FLIGHTS = [
    { from: 'Natakhtari', to: 'Mestia', date: '2026-06-13' },
    { from: 'Natakhtari', to: 'Mestia', date: '2026-06-14' },
    { from: 'Mestia', to: 'Natakhtari', date: '2026-06-17' },
    { from: 'Mestia', to: 'Natakhtari', date: '2026-06-18' }
];

async function sendDiscordAlert(message) {
    console.log(message);
    if (!WEBHOOK_URL) return;
    
    await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            content: `🏔️ **Vanilla Sky Alert:** ${message}\n🎫 **Book here:** ${BASE_URL}` 
        })
    });
}

async function checkFlights() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    for (const flight of FLIGHTS) {
        try {
            console.log(`Checking flights from ${flight.from} to ${flight.to} for ${flight.date}...`);
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

            // Select routing
            await page.selectOption('select[name="direction_from"]', { label: flight.from });
            await page.selectOption('select[name="direction_to"]', { label: flight.to });

            // Input date
            await page.fill('input[name="departure_date"]', flight.date);

            // Submit form and wait for the results to render
            await Promise.all([
                page.click('button[type="submit"]'),
                page.waitForLoadState('networkidle')
            ]);

            // Evaluate the output
            const pageText = await page.innerText('body');
            const noFlightsText = "Please choose different dates"; 

            if (pageText.includes(noFlightsText)) {
                console.log(`[${new Date().toISOString()}] No tickets yet for ${flight.from} -> ${flight.to} on ${flight.date}.`);
            } else {
                await sendDiscordAlert(`Tickets might be live! The standard error message is missing for **${flight.from} -> ${flight.to}** on **${flight.date}**.`);
            }

        } catch (error) {
            console.error(`Error checking ${flight.from} -> ${flight.to} on ${flight.date}:`, error);
        }
        
        // Wait 2 seconds between checks so Vanilla Sky doesn't block the IP
        await page.waitForTimeout(2000); 
    }

    await browser.close();
}

checkFlights();
