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
            
            await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForSelector('select[name="departure"]', { timeout: 10000 });

            // Select departure and arrival
            await page.selectOption('select[name="departure"]', { label: flight.from });
            await page.waitForTimeout(1000); 
            await page.selectOption('select[name="arrive"]', { label: flight.to });

            // FORCE FILL THE DATE: Bypass the custom calendar UI restrictions using JavaScript
            await page.evaluate((dateVal) => {
                const dateInput = document.querySelector('input[name="date_picker"]');
                if (dateInput) {
                    dateInput.removeAttribute('readonly'); // Remove UI block
                    dateInput.value = dateVal;             // Set our June date
                    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
                    dateInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, flight.date);

            // Playwright fallback just in case the element accepts direct input
            try {
                await page.fill('input[name="date_picker"]', flight.date, { force: true });
            } catch (e) {
                console.log("Normal fill skipped, relying on JavaScript injection.");
            }

            // Submit form
            await Promise.all([
                page.click('input[name="op"], button[type="submit"]'),
                page.waitForLoadState('domcontentloaded')
            ]);

            await page.waitForTimeout(2000);

            const pageText = await page.innerText('body');
            const noFlightsText = "There are no available tickets. Please choose different dates."; 

            if (pageText.includes(noFlightsText)) {
                console.log(`[${new Date().toISOString()}] No tickets yet for ${flight.from} -> ${flight.to} on ${flight.date}.`);
            } else {
                console.log(`🚨 TICKETS MAY BE LIVE! Printing snippet of page to verify date:\n${pageText.substring(0, 250)}`);
                await sendDiscordAlert(`Tickets might be live! The error message is missing for **${flight.from} -> ${flight.to}** on **${flight.date}**.`);
            }

        } catch (error) {
            console.error(`❌ Error checking ${flight.from} -> ${flight.to} on ${flight.date}:`);
            console.error(error.message);
        }
        
        await page.waitForTimeout(3000); 
    }

    await browser.close();
}

checkFlights();
