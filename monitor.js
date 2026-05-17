const { chromium } = require('playwright');

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
            
            // Using 'domcontentloaded' prevents the script from timing out if background trackers hang
            await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            console.log("Looking for the booking form...");
            await page.waitForSelector('select[name="departure"]', { timeout: 10000 });

            console.log("Form found! Filling out details...");
            
            // Select departure
            await page.selectOption('select[name="departure"]', { label: flight.from });
            
            // Wait 1 second in case the arrival options dynamically populate based on departure
            await page.waitForTimeout(1000); 
            
            // Select arrival
            await page.selectOption('select[name="arrive"]', { label: flight.to });

            // Input date
            await page.fill('input[name="date_picker"]', flight.date);

            // Submit form using Drupal's 'op' button or any submit button
            await Promise.all([
                page.click('input[name="op"], button[type="submit"]'),
                page.waitForLoadState('domcontentloaded')
            ]);

            // Give the results page 2 seconds to fully render its content
            await page.waitForTimeout(2000);

            // Evaluate the output on the next page
            const pageText = await page.innerText('body');
            const noFlightsText = "There are no available tickets. Please choose different dates."; 

            if (pageText.includes(noFlightsText)) {
                console.log(`[${new Date().toISOString()}] No tickets yet for ${flight.from} -> ${flight.to} on ${flight.date}.`);
            } else {
                await sendDiscordAlert(`Tickets might be live! The standard error message is missing for **${flight.from} -> ${flight.to}** on **${flight.date}**.`);
            }

        } catch (error) {
            console.error(`❌ Error checking ${flight.from} -> ${flight.to} on ${flight.date}:`);
            console.error(error.message);
        }
        
        // Wait 3 seconds before checking the next date to avoid overloading their server
        await page.waitForTimeout(3000); 
    }

    await browser.close();
}

checkFlights();
