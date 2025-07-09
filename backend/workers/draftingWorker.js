// backend/workers/draftingWorker.js

const cron = require('node-cron');
const pool = require('../db'); // Our database connection
// --- CHANGE #1: Using the new, more generic function name from our upgraded service ---
const { draftMessageForLead } = require('../services/draftingService'); // Our AI brain

// This is the core function that does the work.
const performDraftingTask = async () => {
  console.log('⏰ Worker running: Checking for new leads to process...');

  // 1. Find a "new" lead in the database
  const findLeadQuery = `
    SELECT * FROM leads 
    WHERE status = 'new' 
    LIMIT 1 
    FOR UPDATE SKIP LOCKED;
  `;

  const client = await pool.connect();

  try {
    const leadResult = await client.query(findLeadQuery);

    if (leadResult.rows.length === 0) {
      console.log('✅ No new leads to process.');
      return;
    }

    const lead = leadResult.rows[0];
    // --- CHANGE #2: The log now shows which channel is being processed ---
    console.log(`- Found new lead: ${lead.full_name} (ID: ${lead.id}), Channel: ${lead.preferred_channel}`);

    // 2. Use our AI service to draft the message (this function is now channel-aware)
    const draftedContent = await draftMessageForLead(lead);

    if (!draftedContent) {
      console.error(`- AI drafting failed for lead ID: ${lead.id}.`);
      // We start a transaction just to update the status safely
      await client.query('BEGIN');
      await client.query("UPDATE leads SET status = 'drafting_failed' WHERE id = $1;", [lead.id]);
      await client.query('COMMIT');
      return;
    }
    
    console.log(`- AI generated draft: "${draftedContent.substring(0, 50)}..."`);
    
    // Start a transaction for the successful path
    await client.query('BEGIN');

    // 3. Save the new message to the `messages` table
    // --- CHANGE #3: The query now inserts the correct channel and sets the initial sequence step ---
    const insertMessageQuery = `
      INSERT INTO messages (lead_id, content, status, channel, sequence_step)
      VALUES ($1, $2, 'pending_approval', $3, 1);
    `;
    // The third parameter ($3) is now the lead's preferred channel
    await client.query(insertMessageQuery, [lead.id, draftedContent, lead.preferred_channel]);
    console.log(`- Saved new message to database for lead ID: ${lead.id}`);

    // 4. Update the lead's status to 'processed'
    const updateLeadQuery = `
      UPDATE leads SET status = 'processed' WHERE id = $1;
    `;
    await client.query(updateLeadQuery, [lead.id]);
    console.log(`- Updated lead status to 'processed' for lead ID: ${lead.id}`);

    // If all steps were successful, commit the transaction.
    await client.query('COMMIT');
    console.log('✅ Transaction committed successfully.');

  } catch (error) {
    // If any step failed, roll back the entire transaction.
    await client.query('ROLLBACK');
    console.error('❌ An error occurred during the drafting task. Transaction rolled back.', error);
  } finally {
    // VERY IMPORTANT: Always release the client back to the pool.
    client.release();
  }
};

// 5. Schedule the task to run automatically (your existing cron setup is preserved)
const draftingJob = cron.schedule('*/1 * * * *', performDraftingTask, {
  scheduled: false,
});

// Export the job so we can control it from another file.
module.exports = draftingJob;