// backend/services/draftingService.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

// ============================================================
// 📧 EMAIL PROMPT — INITIAL OUTREACH
// ============================================================
const initialEmailPromptTemplate = `You are an expert sales rep writing a compelling, personalized cold email.
My product is an AI-powered sales automation platform.
Lead Info: Name - {full_name}, Title - {title}, Company - {company}.
Task: Draft a short, professional cold email (under 100 words).
- Acknowledge their role ({title}) at {company}.
- Connect their role to the problem our product solves (saving time on outreach).
- End with a simple question.
- DO NOT use "I hope this email finds you well."
- Output ONLY the email body.`;

// ============================================================
// 📧 EMAIL PROMPT — FOLLOW-UP
// ============================================================
const followUpEmailPromptTemplate = `You are an expert sales rep writing a gentle and brief follow-up email.
You are following up on a previous email about our AI sales automation platform.
Lead Info: Name - {full_name}, Title - {title}, Company - {company}.
Task: Draft a very short (under 60 words) follow-up email.
- Gently "bump" the previous message to the top of their inbox.
- Re-state the core benefit: helping sales leaders like them save time.
- End with a simple, no-pressure question.
- Output ONLY the email body.`;

// ============================================================
// 💼 LINKEDIN CONNECTION REQUEST PROMPT
// ============================================================
const linkedinConnectionPromptTemplate = `
You are an expert sales rep writing a concise and professional LinkedIn connection request note.
The goal is to provide context and start a conversation, NOT to sell immediately.
My product is an AI-powered sales automation platform.
Lead Info: Name - {full_name}, Title - {title}, Company - {company}.
Task: Draft a LinkedIn connection request note. It MUST be under 300 characters.
- Make it personal by mentioning their company or title.
- Briefly state your professional area (e.g., "I work with sales leaders...").
- Do not include a sales pitch or ask for a meeting.
- Output ONLY the connection note.`;

// ============================================================
// ✉️ AI FUNCTION TO DRAFT MESSAGES (Email/LinkedIn)
// ============================================================
async function draftMessageForLead(lead, sequence_step = 1) {
  try {
    const channel = lead.preferred_channel || 'email'; // Default to email
    console.log(`🤖 Calling AI for lead: ${lead.full_name} (Channel: ${channel}, Step: ${sequence_step})...`);

    let template = '';

    // Select template
    if (channel === 'linkedin') {
      template = linkedinConnectionPromptTemplate;
    } else {
      template = sequence_step > 1 ? followUpEmailPromptTemplate : initialEmailPromptTemplate;
    }

    const fullPrompt = template
      .replace(/{full_name}/g, lead.full_name)
      .replace(/{title}/g, lead.title)
      .replace(/{company}/g, lead.company);

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    console.log(`✅ AI Draft completed for ${lead.full_name}`);
    return text;

  } catch (error) {
    console.error("🔴 Error calling Gemini API (draftMessageForLead):", error);
    return null;
  }
}

// ============================================================
// 📨 REPLY DRAFTING PROMPT & FUNCTION
// ============================================================
const replyDraftingPromptTemplate = `
You are an expert sales development representative. A lead has replied to your outreach email.
Your task is to draft a helpful and professional response based on the conversation history.

**CONVERSATION HISTORY (Last message is the lead's reply):**
---
{conversation_history}
---

**INSTRUCTIONS:**
1. Analyze the lead's last message to understand their intent (e.g., Interested, Not Interested, Asking a question).
2. If the lead seems interested or asks for a meeting, suggest a few times to connect.
3. If the lead asks a question, answer it concisely.
4. If the lead is not interested, reply with a polite and professional closing.
5. Keep the reply concise and focused.

**Draft your reply below:**`;

async function draftReplyForLead(conversationHistory) {
  try {
    console.log(`🤖 Calling AI to draft a reply...`);

    const fullPrompt = replyDraftingPromptTemplate
      .replace('{conversation_history}', conversationHistory);

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    console.log(`✅ AI Reply Draft completed.`);
    return text;

  } catch (error) {
    console.error("🔴 Error calling Gemini API (draftReplyForLead):", error);
    return null;
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  draftMessageForLead,
  draftReplyForLead,
};
