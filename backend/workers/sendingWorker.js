// backend/workers/sendingWorker.js

const pool = require('../db');
const nodemailer = require('nodemailer');
const puppeteer = require('puppeteer');

// --- Nodemailer Transporter (for email) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});


// ====================================================================
// --- This LinkedIn function remains UNCHANGED ---
// ====================================================================
async function sendLinkedInConnectionRequest(leadUrl, message) {
    console.log('🤖 Launching browser for LinkedIn automation...');
    const browser = await puppeteer.launch({ headless: true }); // Use { headless: false } to watch it work
    const page = await browser.newPage();
    
    try {
        // 1. Login to LinkedIn
        console.log('- Navigating to LinkedIn login page...');
        await page.goto('https://www.linkedin.com/login');
        await page.type('#username', process.env.LINKEDIN_EMAIL, { delay: 50 });
        await page.type('#password', process.env.LINKEDIN_PASSWORD, { delay: 50 });
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        console.log('- Login successful.');

        // 2. Go to the lead's profile
        console.log(`- Navigating to profile: ${leadUrl}`);
        await page.goto(leadUrl, { waitUntil: 'domcontentloaded' });
        
        // Wait for the main profile section to be visible
        await page.waitForSelector('.pv-top-card');

        // 3. Click the "Connect" button
        console.log('- Looking for the "Connect" button...');
        const connectButtonSelector = "div.pv-top-card-v2-ctas button.artdeco-button--primary:not(.artdeco-button--disabled)";
        await page.waitForSelector(connectButtonSelector, { timeout: 10000 });
        await page.click(connectButtonSelector);
        
        // 4. Click "Add a note"
        console.log('- Clicking "Add a note"...');
        const addNoteButtonSelector = "button[aria-label='Add a note']";
        await page.waitForSelector(addNoteButtonSelector, { timeout: 5000 });
        await page.click(addNoteButtonSelector);
        
        // 5. Type the message and send
        console.log('- Typing connection message...');
        const messageBoxSelector = "textarea[name='message']";
        await page.waitForSelector(messageBoxSelector);
        await page.type(messageBoxSelector, message, { delay: 20 });

        const sendButtonSelector = "button[aria-label='Send now']";
        await page.click(sendButtonSelector);

        console.log('✅ LinkedIn connection request sent successfully!');
        return true; // Indicate success

    } catch (error) {
        console.error('🔴 Failed during LinkedIn automation:', error);
        return false; // Indicate failure
    } finally {
        await browser.close(); // IMPORTANT: Always close the browser
        console.log('- Browser closed.');
    }
}


// --- The main worker function ---
async function processAndSendApprovedMessage() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // This query remains UNCHANGED
        const messageResult = await client.query(
            `SELECT m.id, m.content, m.lead_id, m.channel, m.sequence_step, 
                    l.full_name, l.email, l.company, l.linkedin_url 
             FROM messages m
             JOIN leads l ON m.lead_id = l.id
             WHERE m.status = 'approved' 
             LIMIT 1 FOR UPDATE SKIP LOCKED`
        );

        if (messageResult.rows.length === 0) {
            await client.query('COMMIT');
            return;
        }

        const message = messageResult.rows[0];
        let wasSent = false;

        // This is the core logic that decides what action to take
        if (message.channel === 'email') {
            // --- START OF MODIFICATION for Email Threading ---

            console.log(`📧 Found approved EMAIL for ${message.full_name}. Preparing to send.`);

            // 1. Find the latest thread ID for this conversation, if one exists.
            const threadRes = await client.query(
                `SELECT gmail_thread_id FROM messages 
                 WHERE lead_id = $1 AND gmail_thread_id IS NOT NULL 
                 ORDER BY created_at DESC LIMIT 1`,
                [message.lead_id]
            );
            const threadId = threadRes.rows.length > 0 ? threadRes.rows[0].gmail_thread_id : null;

            // 2. Set the subject line based on context.
            let subjectLine;
            if (threadId) {
                // If we have a threadId, it's a reply. Use "Re:".
                subjectLine = `Re: A quick question for ${message.company}`;
            } else if (message.sequence_step === 1) {
                // If it's the first message, use the initial subject.
                subjectLine = `A quick question for ${message.company}`;
            } else {
                // Otherwise, it's a scheduled follow-up.
                subjectLine = `Following up`;
            }
            
            // 3. Build the mailOptions object for Nodemailer.
            const mailOptions = {
                from: `"Your Name" <${process.env.EMAIL_USER}>`,
                to: message.email,
                subject: subjectLine,
                html: message.content.replace(/\n/g, '<br>'),
            };

            // 4. If this is a reply, add the special threading headers.
            if (threadId) {
                mailOptions.inReplyTo = threadId;
                mailOptions.references = threadId;
                console.log(`- This is a reply. Attaching to thread ID: ${threadId}`);
            }

            // 5. Send the email using the constructed options.
            await transporter.sendMail(mailOptions);

            console.log(`✅ Email sent successfully.`);
            wasSent = true;

            // --- END OF MODIFICATION ---

        } else if (message.channel === 'linkedin') {
            // This LinkedIn logic remains UNCHANGED
            console.log(`🔗 Found approved LINKEDIN message for ${message.full_name}. Starting automation.`);
            if (!message.linkedin_url) {
                console.error(`- Cannot process LinkedIn message for lead ID ${message.lead_id}: Missing linkedin_url.`);
                wasSent = false;
            } else {
                wasSent = await sendLinkedInConnectionRequest(message.linkedin_url, message.content);
            }
        
        } else {
            console.log(`- Skipping message for unknown channel: ${message.channel}`);
        }

        // This block for status updates and follow-ups remains UNCHANGED
        if (wasSent) {
            await client.query("UPDATE messages SET status = 'sent' WHERE id = $1", [message.id]);
            console.log(`- Updated message status to 'sent' for message ID: ${message.id}`);

            const nextStep = message.sequence_step + 1;
            const MAX_FOLLOW_UPS = 3;

            if (nextStep <= MAX_FOLLOW_UPS) {
                const followUpDelay = '3 days';
                await client.query(
                    `INSERT INTO messages (lead_id, channel, status, sequence_step, scheduled_for)
                     VALUES ($1, $2, 'scheduled', $3, NOW() + INTERVAL '${followUpDelay}')`,
                    [message.lead_id, message.channel, nextStep]
                );
                console.log(`🗓️  Scheduled follow-up #${nextStep} for lead ID ${message.lead_id}.`);
            }
        } else {
            await client.query("UPDATE messages SET status = 'send_failed' WHERE id = $1", [message.id]);
            console.log(`- Marked message ID ${message.id} as 'send_failed'.`);
        }

        await client.query('COMMIT');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('🔴 Unhandled error in sending worker:', error);
    } finally {
        client.release();
    }
}

// The interval and worker startup message remain UNCHANGED
console.log('🚀 Sending Worker (Multi-Channel) has started. Checking for approved messages every 15 seconds.');
setInterval(processAndSendApprovedMessage, 15000);