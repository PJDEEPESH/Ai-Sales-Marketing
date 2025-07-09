// backend/workers/followUpWorker.js

const pool = require('../db');
const { draftEmailForLead } = require('../services/draftingService');

async function processScheduledFollowUps() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Find ONE scheduled message where the time has come
        const messageResult = await client.query(
            `SELECT m.id, m.sequence_step, l.id as lead_id, l.full_name, l.title, l.company
             FROM messages m
             JOIN leads l ON m.lead_id = l.id
             WHERE m.status = 'scheduled' AND m.scheduled_for <= NOW()
             LIMIT 1
             FOR UPDATE SKIP LOCKED`
        );

        if (messageResult.rows.length === 0) {
            await client.query('COMMIT');
            return; // Nothing to do
        }

        const scheduledMessage = messageResult.rows[0];
        const leadInfo = {
            id: scheduledMessage.lead_id,
            full_name: scheduledMessage.full_name,
            title: scheduledMessage.title,
            company: scheduledMessage.company,
        };
        
        console.log(`⏰ Time to draft follow-up #${scheduledMessage.sequence_step} for lead: ${leadInfo.full_name}`);
        
        // Call the AI drafting service, passing the sequence step
        const draftContent = await draftEmailForLead(leadInfo, scheduledMessage.sequence_step);

        if (draftContent) {
            // Update the message with the new content and set it to 'pending_approval'
            await client.query(
                `UPDATE messages 
                 SET content = $1, status = 'pending_approval', scheduled_for = NULL
                 WHERE id = $2`,
                [draftContent, scheduledMessage.id]
            );
            console.log(`- Follow-up draft created and set to 'pending_approval' for message ID: ${scheduledMessage.id}`);
        } else {
            // If AI fails, set status to 'draft_failed' to avoid retrying indefinitely
            await client.query("UPDATE messages SET status = 'draft_failed' WHERE id = $1", [scheduledMessage.id]);
            console.error(`- AI draft failed for scheduled message ID: ${scheduledMessage.id}`);
        }
        
        await client.query('COMMIT');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('🔴 Error in follow-up worker:', error);
    } finally {
        client.release();
    }
}

// Check for scheduled follow-ups every 30 seconds
console.log('🚀 Follow-Up Worker has started. Checking for scheduled messages every 30 seconds.');
setInterval(processScheduledFollowUps, 30000);