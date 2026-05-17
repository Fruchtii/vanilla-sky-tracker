const { chromium } = require('playwright');
const fs = require('fs');

const SEARCH_URL = 'https://ticket.vanillasky.ge/en/tickets';
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// FIXED: Vanilla Sky expects MM/DD/YYYY format!
const FLIGHTS = [
    { from: 'Natakhtari', to: 'Mestia', date: '06/13/2026' },
    { from: 'Natakhtari', to: 'Mestia', date: '06/14/2026' },
    { from: 'Mestia', to: 'Natakhtari', date: '06/17/2026' },
    { from: 'Mestia', to: 'Natakhtari', date: '06/18/2026' }
];

async function sendDiscordAlert(message, imagePath = null) {
    console.log(message);
    if (!WEBHOOK_URL) return;

    const formData = new FormData();
    formData.append('payload_json', JSON.stringify({ 
        content: `🏔️ **Vanilla Sky Alert:** ${message}\n🎫 **Book here:** ${SEARCH_URL}` 
    }));

    if (imagePath && fs.existsSync(imagePath)) {
        const buffer = fs.readFileSync(imagePath);
        const blob = new Blob([buffer], { type: 'image/png' });
        formData.append('file', blob, 'screenshot.png');
    }
    
    await fetch(WEBHOOK_URL, {
        method: 'POST',
        body: formData
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

            // Force fill the date in MM/DD/YYYY format
            await page.evaluate((dateVal) => {
                const dateInput = document.querySelector('input[name="date_picker"]');
                if (dateInput) {
                    dateInput.removeAttribute('readonly'); 
                    dateInput.value = dateVal;             
                    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
                    dateInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, flight.date);

            // Submit form
            await Promise.all([
                page.click('input[name="op"], button[type="submit"]'),
                page.waitForLoadState('domcontentloaded')
            ]);

            await page.waitForTimeout(2000);

            const pageText = await page.innerText('body');
            
            // 1. Negative Check
            if (pageText.includes("There are no available tickets")) {
                console.log(`[${new Date().toISOString()}] No tickets yet for ${flight.date}.`);
            } 
            // 2. Positive Check
            else if (pageText.includes("GEL") || pageText.includes("Total price") || pageText.includes("Add passenger")) {
                console.log("🚨 TICKETS ARE LIVE! Taking screenshot...");
                const screenshotPath = `success_${flight.date.replace(/\//g, '-')}.png`;
                await page.screenshot({ path: screenshotPath, fullPage: true });
                
                await sendDiscordAlert(`Tickets are LIVE for **${flight.from} -> ${flight.to}** on **${flight.date}**!`, screenshotPath);
            } 
            // 3. Fallback
            else {
                console.log(`⚠️ Form submission failed for ${flight.date}. The website rejected the input and reloaded the page.`);
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
