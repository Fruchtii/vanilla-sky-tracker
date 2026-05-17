const { chromium } = require('playwright');

const BASE_URL = 'https://ticket.vanillasky.ge/en/flights-form';
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
            content: `🏔️ **Vanilla Sky Alert:** ${message}\n🎫 **Book here:** ${BASE_URL}` 
        })
    });
}

async function checkFlights() {
    const browser = await chromium.launch({ headless: true });
    // Adding extra stealth headers to look less like a bot
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
        }
    });
    
    const page = await context.newPage();

    for (const flight of FLIGHTS) {
        try {
            console.log(`\n--- Checking flights from ${flight.from} to ${flight.to} for ${flight.date}... ---`);
            
            // Wait until the network is mostly quiet, not just the DOM
            const response = await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
            
            console.log(`HTTP Status: ${response.status()}`);
            console.log(`Page Title: ${await page.title()}`);

            // Quick check if we are blocked
            const html = await page.content();
            if (html.toLowerCase().includes('cloudflare') || html.toLowerCase().includes('checking your browser')) {
                console.log("🚨 ALERT: GitHub Actions IP is being blocked by a security firewall (Cloudflare).");
            }

            // Wait specifically for the dropdown to appear before trying to interact with it
            console.log("Waiting for form dropdowns to render...");
            await page.waitForSelector('select[name="direction_from"]', { timeout: 15000 });

            // Select routing
            console.log("Filling out form...");
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
            console.error(`❌ Error checking ${flight.from} -> ${flight.to} on ${flight.date}:`);
            console.error(error.message);
            
            // Print a snippet of what the page actually says to help us debug
            const currentText = await page.innerText('body').catch(() => 'Could not retrieve page text.');
            console.log(`\nWhat the page currently says (First 200 chars):\n${currentText.substring(0, 200)}...`);
        }
        
        // Wait 3 seconds between checks
        await page.waitForTimeout(3000); 
    }

    await browser.close();
}

checkFlights();
