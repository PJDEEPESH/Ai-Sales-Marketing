// backend/workers/scrapingWorker.js

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const pool = require('../db');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- Initialize Gemini AI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

// --- AI Function to Guess Email ---
// This function takes a name and a company and asks the AI to guess the email format.
async function guessEmail(fullName, companyName) {
    const prompt = `Given the full name "${fullName}" and the company name "${companyName}", generate the most likely professional email address. Common formats are firstname.lastname@company.com, f.lastname@company.com, or firstname@company.com. Output ONLY the email address and nothing else.`;
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        // Clean up the response to make sure it's just an email.
        return response.text().trim().toLowerCase();
    } catch (error) {
        console.error("🔴 AI Email Guessing Failed:", error);
        return null;
    }
}


// --- The Main Scraping Function ---
async function scrapeLeads() {
    console.log('🤖 [Scraper] Starting the scraping process...');
    const browser = await puppeteer.launch({ headless: true }); // Use headless: false to watch it work
    const page = await browser.newPage();

    try {
        // We will scrape Clutch.co, a directory of B2B service providers. It's public and less likely to block us.
        // We are looking for "Marketing Agencies" in this example.
        const targetUrl = 'https://clutch.co/agencies/digital-marketing';
        console.log(`[Scraper] Navigating to: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'networkidle2' }); // Wait until the page is fully loaded

        // Get the HTML content of the page after it has loaded.
        const html = await page.content();
        const $ = cheerio.load(html); // Load the HTML into Cheerio for easy parsing.

        // Now we use Cheerio selectors to find the elements we want.
        // This is like using CSS selectors. You find these by using "Inspect Element" in your browser.
        const leadElements = $('li.provider-card'); // Each company is in a list item with the class 'provider-card'
        
        console.log(`[Scraper] Found ${leadElements.length} potential leads on the page.`);

        // Limit to 3 leads for this demo to be quick and avoid getting blocked.
        for (let i = 0; i < Math.min(leadElements.length, 3); i++) {
            const element = leadElements.eq(i);
            
            // Extract the data using Cheerio's find() and text() methods.
            const company = element.find('a.company_title').text().trim();
            const title = "Marketing Lead"; // We'll use a generic title for this example
            const fullName = "Decision Maker"; // And a generic name

            if (company) {
                console.log(`[Scraper] --- Processing Lead ${i + 1} ---`);
                console.log(`[Scraper] Company: ${company}`);

                // Step 1: Use AI to guess the email address.
                console.log(`[Scraper] 🧠 Asking AI to guess email for ${company}...`);
                const email = await guessEmail(fullName, company);
                
                if (email) {
                    console.log(`[Scraper] AI Guessed Email: ${email}`);
                    
                    // Step 2: Save the new lead to the database.
                    // We use "ON CONFLICT (email) DO NOTHING" to prevent adding duplicate leads.
                    const insertQuery = `
                        INSERT INTO leads (full_name, company, title, email, preferred_channel)
                        VALUES ($1, $2, $3, $4, 'email')
                        ON CONFLICT (email) DO NOTHING;
                    `;
                    await pool.query(insertQuery, [fullName, company, title, email]);
                    console.log(`[Scraper] ✅ Lead for ${company} saved to database (or already existed).`);
                } else {
                    console.log(`[Scraper] ❌ Could not guess an email for ${company}. Skipping.`);
                }
            }
             // Add a small delay to be respectful to the website
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

    } catch (error) {
        console.error('🔴 [Scraper] An error occurred during the scraping process:', error);
    } finally {
        await browser.close(); // ALWAYS close the browser.
        console.log('[Scraper] Scraping process finished. Browser closed.');
    }
}

// Export the function so we can call it from elsewhere.
module.exports = { scrapeLeads };