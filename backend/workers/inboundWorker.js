// backend/workers/inboundWorker.js

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const pool = require('../db');
const { draftReplyForLead } = require('../services/draftingService');

const config = {
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    logger: false,
    socketTimeout: 30000 
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function processInboundEmails() {
    const client = new ImapFlow(config);
    console.log('📬 Inbound worker checking for new replies from known leads...');

    try {
        await client.connect();
        let lock = await client.getMailboxLock('INBOX');

        try {
            const contactedLeadsRes = await pool.query(
                `SELECT id, email, full_name 
                 FROM leads 
                 WHERE status IN ('processed', 'contacted')`
            );
            
            if (contactedLeadsRes.rows.length === 0) return;

            for (const lead of contactedLeadsRes.rows) {
                const messages = await client.search({ unseen: true, from: lead.email }, { uid: true });

                if (messages.length === 0) continue;

                console.log(`- Found ${messages.length} new repl(y/ies) from ${lead.full_name}. Processing...`);

                for (let uid of messages) {
                    let dbClient;
                    try {
                        let messageData = null;
                        const MAX_RETRIES = 3;

                        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                            console.log(`-   Attempt ${attempt} to fetch content for UID ${uid}...`);
                            messageData = await client.fetchOne(uid, { source: true });
                            if (messageData) {
                                console.log(`-   Successfully fetched content for UID ${uid}.`);
                                break;
                            }
                            if (attempt < MAX_RETRIES) {
                                console.log(`-   Fetch failed, waiting 1.5 seconds before retrying...`);
                                await wait(1500);
                            }
                        }

                        if (!messageData || !messageData.source) {
                            console.log(`-   Skipping email UID ${uid} from ${lead.email} after ${MAX_RETRIES} failed attempts to fetch content.`);
                            await client.messageFlagsAdd(uid, ['\\Seen']);
                            continue;
                        }

                        const parsed = await simpleParser(messageData.source);

                        if (!parsed.text || parsed.text.trim() === '') {
                            console.log(`- Skipping email UID ${uid} from ${lead.email} due to empty text content.`);
                            await client.messageFlagsAdd(uid, ['\\Seen']);
                            continue;
                        }

                        const references = parsed.headers.get('references');
                        const inReplyTo = parsed.headers.get('in-reply-to');
                        const threadId = references ? references.split(' ')[0] : parsed.messageId;

                        let conversationHistory = ``;
                        if (threadId) {
                            const historyRes = await pool.query(
                                `SELECT content, inbound FROM messages WHERE lead_id = $1 AND gmail_thread_id = $2 ORDER BY created_at ASC`,
                                [lead.id, threadId]
                            );
                            historyRes.rows.forEach(msg => {
                                const prefix = msg.inbound ? 'Their Message:' : 'Our Message:';
                                conversationHistory += `${prefix}\n${msg.content}\n---\n`;
                            });
                        }
                        conversationHistory += `Their Newest Reply:\n${parsed.text}`;

                        console.log(`- Reply from ${lead.full_name} identified. Content: "${parsed.text.substring(0, 50)}..."`);
                        const draftedReply = await draftReplyForLead(conversationHistory);

                        if (draftedReply) {
                            dbClient = await pool.connect();
                            await dbClient.query('BEGIN');
                            await dbClient.query(`INSERT INTO messages (lead_id, content, status, channel, inbound, gmail_thread_id) VALUES ($1, $2, 'received', 'email', true, $3)`, [lead.id, parsed.text, threadId]);
                            await dbClient.query(`INSERT INTO messages (lead_id, content, status, channel, inbound, gmail_thread_id) VALUES ($1, $2, 'pending_approval', 'email', false, $3)`, [lead.id, draftedReply, threadId]);
                            await dbClient.query('COMMIT');
                            console.log(`✅ Saved inbound email and AI-drafted reply for lead ${lead.full_name}.`);
                        } else {
                            console.error(`- AI failed to draft a reply for the message from ${lead.full_name}.`);
                        }

                        await client.messageFlagsAdd(uid, ['\\Seen']);

                    } catch (err) {
                        if (dbClient) await dbClient.query('ROLLBACK');
                        console.error(`- ERROR processing email UID ${uid} from ${lead.email}.`, err);
                        await client.messageFlagsAdd(uid, ['\\Seen']);
                    } finally {
                        if (dbClient) dbClient.release();
                    }
                }
            }

        } finally {
            if (lock && lock.p) {
                await lock.release();
            }
        }
    } catch (err) {
        console.error('🔴 IMAP Connection Error:', err.message);
    } finally {
        if (client.state === 'connected') {
            await client.logout();
        }
    }
}

console.log('🚀 Inbound Email Worker (v4 - Final) has started. Checking every 2 minutes.');
setInterval(processInboundEmails, 120000);
processInboundEmails().catch(err => {
    console.error('🔴 Error in Inbound Worker:', err);
});


//second 

// backend/workers/inboundWorker.js

// const { google } = require('googleapis');
// const { OAuth2Client } = require('google-auth-library');
// const fs = require('fs').promises;
// const path = require('path');
// const pool = require('../db');
// const { draftReplyForLead } = require('../services/draftingService');

// const TOKEN_PATH = path.join(__dirname, '..', 'token.json'); // Correct path to token.json

// async function getAuthenticatedClient() {
//     try {
//         const credentials = await fs.readFile(path.join(__dirname, '..', '.env')); // Not the best way, but works for this
//         const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

//         const oAuth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
        
//         const token = await fs.readFile(TOKEN_PATH);
//         oAuth2Client.setCredentials(JSON.parse(token));
//         return oAuth2Client;

//     } catch (err) {
//         console.log('🔴 Authorization token not found. Please authorize the app first.');
//         console.log('Visit http://localhost:5001/auth/google in your browser to get a token.');
//         return null;
//     }
// }

// function getHeader(headers, name) {
//     const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
//     return header ? header.value : null;
// }

// function decodeEmailBody(message) {
//     let body = '';
//     const parts = message.payload.parts || [message.payload];
//     const textPart = parts.find(part => part.mimeType === 'text/plain');
//     if (textPart && textPart.body && textPart.body.data) {
//         body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
//     }
//     return body;
// }


// async function processInboundEmails() {
//     console.log('📬 [Gmail API] Inbound worker checking for new replies...');
//     const auth = await getAuthenticatedClient();
//     if (!auth) return; // Stop if not authorized

//     const gmail = google.gmail({ version: 'v1', auth });

//     try {
//         const contactedLeadsRes = await pool.query(`SELECT id, email, full_name FROM leads WHERE status IN ('processed', 'contacted')`);
//         if (contactedLeadsRes.rows.length === 0) return;

//         for (const lead of contactedLeadsRes.rows) {
//             // 1. Search for unread messages from the lead
//             const searchRes = await gmail.users.messages.list({
//                 userId: 'me',
//                 q: `is:unread from:${lead.email}`,
//             });

//             if (!searchRes.data.messages) continue;
            
//             console.log(`- Found ${searchRes.data.messages.length} new repl(y/ies) from ${lead.full_name}. Processing...`);

//             for (const messageHeader of searchRes.data.messages) {
//                 // 2. Fetch the full message content
//                 const messageRes = await gmail.users.messages.get({
//                     userId: 'me',
//                     id: messageHeader.id,
//                 });

//                 const parsedText = decodeEmailBody(messageRes.data);
//                 if (!parsedText || parsedText.trim() === '') {
//                     console.log(`- Skipping message ID ${messageHeader.id} due to empty text content.`);
//                     continue;
//                 }

//                 const threadId = messageRes.data.threadId;

//                 // Your logic for history and drafting remains very similar...
//                 let conversationHistory = '';
//                 // (You can enhance this later to fetch history from your DB using the threadId)
//                 conversationHistory = `Their Newest Reply:\n${parsedText}`;

//                 console.log(`- Reply from ${lead.full_name} identified. Content: "${parsedText.substring(0, 50)}..."`);
//                 const draftedReply = await draftReplyForLead(conversationHistory);

//                 if (draftedReply) {
//                     const dbClient = await pool.connect();
//                     await dbClient.query('BEGIN');
//                     await dbClient.query(`INSERT INTO messages (lead_id, content, status, channel, inbound, gmail_thread_id) VALUES ($1, $2, 'received', 'email', true, $3)`, [lead.id, parsedText, threadId]);
//                     await dbClient.query(`INSERT INTO messages (lead_id, content, status, channel, inbound, gmail_thread_id) VALUES ($1, $2, 'pending_approval', 'email', false, $3)`, [lead.id, draftedReply, threadId]);
//                     await dbClient.query('COMMIT');
//                     dbClient.release();
//                     console.log(`✅ Saved inbound email and AI-drafted reply for lead ${lead.full_name}.`);
//                 }

//                 // 3. Mark the message as read
//                 await gmail.users.messages.modify({
//                     userId: 'me',
//                     id: messageHeader.id,
//                     requestBody: {
//                         removeLabelIds: ['UNREAD'],
//                     },
//                 });
//             }
//         }
//     } catch (error) {
//         console.error('🔴 Error during Gmail API processing:', error.message);
//     }
// }

// console.log('🚀 Inbound Email Worker (Gmail API) has started. Checking every 2 minutes.');
// setInterval(processInboundEmails, 120000);