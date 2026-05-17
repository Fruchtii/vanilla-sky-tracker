const { chromium } = require('playwright');

// We need to start at the actual ticket search portal!
const SEARCH_URL = 'https://ticket.vanillasky.ge/en/tickets';
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

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
            content: `🏔️ **Vanilla Sky Alert:** ${message}\n🎫 **Book here:** ${SEARCH_URL}` 
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
            console.log(`\n--- Checking flights from ${flight.from} to ${flight.to} for ${flight.date}... ---`);
            
            await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 30000 });
            
            // Wait specifically for the first dropdown to appear
            console.log("Looking for the booking form...");
            
            // Check if the expected selectors exist
            const fromSelect = await page.$('select[name="direction_from"]');
            
            if (!fromSelect) {
                console.log("⚠️ Could not find the standard dropdown menu. Vanilla Sky might have updated their form structure.");
                
                // Debugging: Print all select elements and inputs on the page so we know exactly what they are called
                const allSelects = await page.$$eval('select', selects => selects.map(s => s.name || s.id));
                const allInputs = await page.$$eval('input', inputs => inputs.map(i => i.name || i.id));
                console.log(`Found Dropdowns on page: ${JSON.stringify(allSelects)}`);
                console.log(`Found Inputs on page: ${JSON.stringify(allInputs)}`);
                
                throw new Error("Form selectors mismatch.");
            }

            // Fill out the form
            console.log("Form found! Filling out details...");
            await page.selectOption('select[name="direction_from"]', { label: flight.from });
            await page.selectOption('select[name="direction_to"]', { label: flight.to });

            // Input date
            await page.fill('input[name="departure_date"]', flight.date);

            // Submit form and wait for the results page to render
            await Promise.all([
                page.click('button[type="submit"]'),
                page.waitForLoadState('networkidle')
            ]);

            // Evaluate the output on the next page
            const pageText = await page.innerText('body');
            const noFlightsText = "Please choose different dates"; 

            if (pageText.includes(noFlightsText)) {
                console.log(`[${new Date().toISOString()}] No tickets yet for ${flight.from} -> ${flight.to} on ${flight.date}.`);
            } else {
                await sendDiscordAlert(`Tickets might be live! The standard error message is missing for **${flight.from} -> ${flight.to}** on **${flight.date}**.`);
            }

        } catch (error) {
            console.error(`❌ Error checking ${flight.from} -> ${flight.to} on ${flight.date}:`);
            console.error(error.message);
        }
        
        // Wait 3 seconds between checks
        await page.waitForTimeout(3000); 
    }

    await browser.close();
}

checkFlights();
