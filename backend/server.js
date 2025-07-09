// backend/server.js
const { scrapeLeads } = require('./workers/scrapingWorker');

const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 5001;
// Add this near your other imports at the top of server.js
// --- Middleware ---
app.use(express.json({ limit: '10mb' }));
app.use(cors());


// --- API ROUTES ---
// A NEW ENDPOINT TO TRIGGER THE SCRAPER
// When you go to this URL in your browser, it will start the scraping process.
app.get('/api/leads/start-scraping', async (req, res) => {
    // We send a response immediately to the user so their browser doesn't wait.
    res.status(202).json({ message: "Scraping process has been started. Check the backend console for progress." });
    
    // Then, we run the actual scraping function in the background.
    scrapeLeads();
});
// GET all messages that are pending approval
app.get('/api/messages/pending', async (req, res) => {
  try {
    const pendingMessages = await pool.query(
      `SELECT m.id, m.content, m.channel, m.status, m.created_at, l.full_name, l.company, l.title
       FROM messages m
       JOIN leads l ON m.lead_id = l.id
       WHERE m.status = 'pending_approval'
       ORDER BY m.created_at DESC`
    );
    res.json(pendingMessages.rows);
  } catch (err) {
    console.error("Error fetching pending messages:", err.message);
    res.status(500).send('Server Error');
  }
});

// ====================================================================
// --- THIS IS THE FIXED API ENDPOINT ---
// ====================================================================
// API endpoint for uploading leads as JSON
app.post('/api/leads/upload', async (req, res) => {
  const leads = req.body;
  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'No leads data provided.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // THE QUERY IS NOW UPGRADED TO INCLUDE `preferred_channel`
    const queryText = `
      INSERT INTO leads (full_name, company, title, email, linkedin_url, preferred_channel)
      SELECT 
        full_name, company, title, email, linkedin_url, preferred_channel 
      FROM json_to_recordset($1)
      AS x(full_name TEXT, company TEXT, title TEXT, email TEXT, linkedin_url TEXT, preferred_channel TEXT)
    `;
    
    await client.query(queryText, [JSON.stringify(leads)]);
    
    await client.query('COMMIT');
    console.log(`✅ Successfully uploaded and inserted ${leads.length} leads.`);
    res.status(201).json({ message: `Successfully uploaded ${leads.length} leads.` });
  } catch (error)
  {
    await client.query('ROLLBACK');
    console.error('🔴 Error uploading leads:', error);
    res.status(500).json({ error: 'Failed to upload leads to the database.' });
  } finally {
    client.release();
  }
});
// ====================================================================


// PUT to approve a message
app.put('/api/messages/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedMessage = await pool.query(
            "UPDATE messages SET status = 'approved' WHERE id = $1 AND status = 'pending_approval' RETURNING *",
            [id]
        );
        if (updatedMessage.rows.length === 0) {
            return res.status(404).json({ msg: "Message not found or already processed." });
        }
        console.log(`✅ Message with ID ${id} has been approved.`);
        res.json({ msg: "Message approved successfully!", message: updatedMessage.rows[0] });
    } catch (err) {
        console.error("🔴 Error in approve endpoint:", err);
        res.status(500).send("Server Error");
    }
});

// PUT to reject a message
app.put('/api/messages/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("UPDATE messages SET status = 'rejected' WHERE id = $1 AND status = 'pending_approval' RETURNING *", [id]);
        if (result.rows.length === 0) { return res.status(404).json({ msg: "Message not found or already processed." }); }
        console.log(`❌ Message with ID ${id} has been rejected.`);
        res.json({ msg: "Message rejected successfully!" });
    } catch (err) {
        console.error("🔴 Error in reject endpoint:", err);
        res.status(500).send("Server Error");
    }
});

// PUT to edit a message's content
app.put('/api/messages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { newContent } = req.body;
        if (!newContent || newContent.trim() === '') { return res.status(400).json({ msg: "New content cannot be empty." }); }
        const result = await pool.query("UPDATE messages SET content = $1 WHERE id = $2 RETURNING *", [newContent, id]);
        if (result.rows.length === 0) { return res.status(404).json({ msg: "Message not found." }); }
        console.log(`✏️ Message with ID ${id} has been edited.`);
        res.json({ msg: "Message updated successfully!", message: result.rows[0] });
    } catch (err) {
        console.error("🔴 Error in edit endpoint:", err);
        res.status(500).send("Server Error");
    }
});
app.post('/api/drafts', async (req, res) => {
  try {
    const { lead_id, lead_email, ai_drafted_reply } = req.body;

    // Validation: Make sure we have the required data
    if (!lead_id || !lead_email || !ai_drafted_reply) {
      return res.status(400).json({ error: 'Missing required data.' });
    }

    // Insert the AI-drafted reply into the `messages` table
    const queryText = `
      INSERT INTO messages (lead_id, content, status, channel, inbound)
      VALUES ($1, $2, 'pending_approval', 'email', false)
      RETURNING *;
    `;
    const values = [lead_id, ai_drafted_reply];
    const result = await pool.query(queryText, values);

    console.log(`✅ Received and saved AI-drafted reply for lead ID ${lead_id}.`);
    res.status(201).json({ message: 'Draft saved successfully!', draft: result.rows[0] });

  } catch (error) {
    console.error('🔴 Error saving AI-drafted reply:', error);
    res.status(500).json({ error: 'Failed to save AI-drafted reply.' });
  }
});
// A NEW ENDPOINT FOR STEP 6
// Purpose: Updates a lead's status using their email address.
// Calendly will give us the email, so this is the perfect way to find the lead.
app.put('/api/leads/status/by-email/:email', async (req, res) => {
    // req.params.email gets the email from the URL (e.g., /api/.../test@example.com)
    const { email } = req.params;
    // req.body.status gets the JSON data we will send from n8n.
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'A new status is required in the body.' });
    }

    try {
        const query = "UPDATE leads SET status = $1 WHERE email = $2 RETURNING *";
        const values = [status, email];
        const result = await pool.query(query, values);

        // If the query didn't find a lead with that email, result.rows will be empty.
        if (result.rows.length === 0) {
            console.warn(`[Step 6] ⚠️  Tried to update a lead that was not found: ${email}`);
            return res.status(404).json({ msg: 'Lead with that email was not found in the database.' });
        }

        console.log(`[Step 6] ✅  Successfully updated status to '${status}' for lead: ${email}`);
        res.json({ message: "Status updated successfully", lead: result.rows[0] });

    } catch (err) {
        console.error("🔴 [Step 6] A server error occurred while updating lead status:", err);
        res.status(500).send("Server Error");
    }
});
// GET all leads that have been contacted so n8n can check them for replies
app.get('/api/leads/contacted', async (req, res) => {
    try {
        // A lead is 'contacted' if their status is 'processed' (meaning the first message was drafted)
        const result = await pool.query("SELECT * FROM leads WHERE status = 'processed'");
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching contacted leads:", err.message);
        res.status(500).send('Server Error');
    }
});
// --- WORKER INITIALIZATION ---
require('./workers/draftingWorker');
require('./workers/sendingWorker');
require('./workers/followUpWorker');
// require('./workers/inboundWorker'); 


// --- START THE SERVER ---
app.listen(PORT, () => {
  console.log(`✅ Backend server started on http://localhost:${PORT}`);
});



//second code snippet
// backend/server.js

// const express = require('express');
// const cors = require('cors');
// const pool = require('./db');
// // --- START: New imports for Google OAuth ---
// const { google } = require('googleapis');
// const fs = require('fs').promises; // Used to save the token file
// // --- END: New imports for Google OAuth ---

// const app = express();
// const PORT = process.env.PORT || 5001;

// // --- Middleware ---
// app.use(express.json({ limit: '10mb' }));
// app.use(cors());


// // --- START: Google OAuth 2.0 Configuration ---
// const TOKEN_PATH = 'token.json'; // The file that will store our permanent access token

// // Create the OAuth2 client with the credentials from your .env file
// const oauth2Client = new google.auth.OAuth2(
//     process.env.GOOGLE_CLIENT_ID,
//     process.env.GOOGLE_CLIENT_SECRET,
//     process.env.GOOGLE_REDIRECT_URI
// );
// // --- END: Google OAuth 2.0 Configuration ---


// // --- API ROUTES ---
// // Your existing API routes are untouched.
// // ...

// // GET all messages that are pending approval
// app.get('/api/messages/pending', async (req, res) => {
//   try {
//     const pendingMessages = await pool.query(
//       `SELECT m.id, m.content, m.channel, m.status, m.created_at, l.full_name, l.company, l.title
//        FROM messages m
//        JOIN leads l ON m.lead_id = l.id
//        WHERE m.status = 'pending_approval'
//        ORDER BY m.created_at DESC`
//     );
//     res.json(pendingMessages.rows);
//   } catch (err) {
//     console.error("Error fetching pending messages:", err.message);
//     res.status(500).send('Server Error');
//   }
// });

// // API endpoint for uploading leads as JSON
// app.post('/api/leads/upload', async (req, res) => {
//   const leads = req.body;
//   if (!leads || !Array.isArray(leads) || leads.length === 0) {
//     return res.status(400).json({ error: 'No leads data provided.' });
//   }
//   const client = await pool.connect();
//   try {
//     await client.query('BEGIN');
    
//     const queryText = `
//       INSERT INTO leads (full_name, company, title, email, linkedin_url, preferred_channel)
//       SELECT 
//         full_name, company, title, email, linkedin_url, preferred_channel 
//       FROM json_to_recordset($1)
//       AS x(full_name TEXT, company TEXT, title TEXT, email TEXT, linkedin_url TEXT, preferred_channel TEXT)
//     `;
    
//     await client.query(queryText, [JSON.stringify(leads)]);
    
//     await client.query('COMMIT');
//     console.log(`✅ Successfully uploaded and inserted ${leads.length} leads.`);
//     res.status(201).json({ message: `Successfully uploaded ${leads.length} leads.` });
//   } catch (error)
//   {
//     await client.query('ROLLBACK');
//     console.error('🔴 Error uploading leads:', error);
//     res.status(500).json({ error: 'Failed to upload leads to the database.' });
//   } finally {
//     client.release();
//   }
// });

// // PUT to approve a message
// app.put('/api/messages/:id/approve', async (req, res) => {
//     try {
//         const { id } = req.params;
//         const updatedMessage = await pool.query(
//             "UPDATE messages SET status = 'approved' WHERE id = $1 AND status = 'pending_approval' RETURNING *",
//             [id]
//         );
//         if (updatedMessage.rows.length === 0) {
//             return res.status(404).json({ msg: "Message not found or already processed." });
//         }
//         console.log(`✅ Message with ID ${id} has been approved.`);
//         res.json({ msg: "Message approved successfully!", message: updatedMessage.rows[0] });
//     } catch (err) {
//         console.error("🔴 Error in approve endpoint:", err);
//         res.status(500).send("Server Error");
//     }
// });

// // PUT to reject a message
// app.put('/api/messages/:id/reject', async (req, res) => {
//     try {
//         const { id } = req.params;
//         const result = await pool.query("UPDATE messages SET status = 'rejected' WHERE id = $1 AND status = 'pending_approval' RETURNING *", [id]);
//         if (result.rows.length === 0) { return res.status(404).json({ msg: "Message not found or already processed." }); }
//         console.log(`❌ Message with ID ${id} has been rejected.`);
//         res.json({ msg: "Message rejected successfully!" });
//     } catch (err) {
//         console.error("🔴 Error in reject endpoint:", err);
//         res.status(500).send("Server Error");
//     }
// });

// // PUT to edit a message's content
// app.put('/api/messages/:id', async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { newContent } = req.body;
//         if (!newContent || newContent.trim() === '') { return res.status(400).json({ msg: "New content cannot be empty." }); }
//         const result = await pool.query("UPDATE messages SET content = $1 WHERE id = $2 RETURNING *", [newContent, id]);
//         if (result.rows.length === 0) { return res.status(404).json({ msg: "Message not found." }); }
//         console.log(`✏️ Message with ID ${id} has been edited.`);
//         res.json({ msg: "Message updated successfully!", message: result.rows[0] });
//     } catch (err) {
//         console.error("🔴 Error in edit endpoint:", err);
//         res.status(500).send("Server Error");
//     }
// });


// // --- START: Google OAuth 2.0 Authorization Routes ---
// // This route starts the authorization process. You will visit this URL in your browser.
// app.get('/auth/google', (req, res) => {
//     const authUrl = oauth2Client.generateAuthUrl({
//         access_type: 'offline', // IMPORTANT: this gets us the refresh_token for permanent access
//         scope: ['https://www.googleapis.com/auth/gmail.readonly'], // We only need to read mail
//     });
//     console.log('Redirecting to Google for authentication...');
//     res.redirect(authUrl);
// });

// // This is the callback route that Google redirects to after the user grants permission.
// app.get('/auth/google/callback', async (req, res) => {
//     const { code } = req.query;
//     try {
//         // Exchange the authorization code for an access token and refresh token
//         const { tokens } = await oauth2Client.getToken(code);
//         oauth2Client.setCredentials(tokens);
        
//         // Save the tokens to the token.json file for the worker to use later
//         await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
//         console.log(`✅ Access token and refresh token saved to ${TOKEN_PATH}`);
        
//         res.send('Authentication successful! You can close this tab. The inbound worker is now authorized.');
//     } catch (error) {
//         console.error('🔴 Error retrieving access token', error);
//         res.status(500).send('Authentication failed.');
//     }
// });
// // --- END: Google OAuth 2.0 Authorization Routes ---


// // --- WORKER INITIALIZATION ---
// // This part is also untouched.
// require('./workers/draftingWorker');
// require('./workers/sendingWorker');
// require('./workers/followUpWorker');
// require('./workers/inboundWorker'); 


// // --- START THE SERVER ---
// // This part is also untouched.
// app.listen(PORT, () => {
//   console.log(`✅ Backend server started on http://localhost:${PORT}`);
// });