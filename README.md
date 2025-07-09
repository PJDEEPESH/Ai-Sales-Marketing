# 🤖 AI-Powered Lead Generation & Sales Engagement System (with HITL & n8n)

## 🧩 Overview

This project automates the sales outreach lifecycle — from lead ingestion, personalized messaging, human review, automated follow-ups, and AI-powered response handling — while keeping **Human-In-The-Loop (HITL)** at every critical step.

---

## 🛠️ Features

| Feature                                | Status   |
|----------------------------------------|----------|
| Manual lead upload (CSV)               | ✅ Done   |
| AI-drafted email/DMs for each lead     | ✅ Done   |
| Frontend approval (Edit/Approve/Reject)| ✅ Done   |
| Auto-send via Email, LinkedIn          | ✅ Done   |
| Follow-up Scheduling (2-5 days)        | ✅ Done   |
| Inbound message detection (via n8n)    | ✅ Done   |
| Auto AI Reply Draft (n8n + OpenAI)     | ✅ Done   |
| Meeting Proposal + CRM Sync            | ✅ Done   |

---

## ⚙️ Tech Stack

- **Frontend:** React.js (Lead upload, approval dashboard)
- **Backend:** Node.js + Express (Lead ingestion, message pipeline)
- **Database:** PostgreSQL (Leads, messages, history)
- **AI:** Gemini api because it is free — Message Generation
- **Automation:** n8n (Inbound reply handling, AI auto-drafting, Meeting setup)
- **Other:** Ngrok (for local API → public), Gmail API, LinkedIn/Instagram (planned)

---

## 🧪 How It Works

### Step 1: Lead Ingestion
- Leads are manually scraped from Apollo/LinkedIn and uploaded via CSV to frontend.
- Backend parses and stores leads in PostgreSQL.

### Step 2: AI Message Drafting
- Backend calls OpenAI to generate cold messages per channel (Email, LinkedIn).
- Message saved in DB with status = `draft`.

### Step 3: Human Review
- Frontend dashboard displays drafted messages.
- User can edit, approve, or reject.

### Step 4: Automated Follow-Ups
- Backend schedules follow-ups using `node-cron` and DB timestamps.
- New AI messages are generated, then sent for human approval again.

---

### Step 5: Inbound Email Handling (in n8n)

#### ➤ Goal: Detect replies → draft AI response → send to frontend for approval.

#### 🛠️ n8n Setup

1. **Trigger:** `Schedule` node every 2 mins  
2. **Node:** `HTTP Request` to `/api/leads/contacted`  
3. **Node:** `Split In Batches` (Batch Size: 1)  
4. **Loop Node:** Gmail "Search Messages"  
   - Filter: From = `{{$json.email}}`, Is Read = false  
5. **IF Node:** Check if message ID is not empty  
6. **HTTP Request or OpenAI Node:**
   - Draft reply using:
     ```
     You are a helpful assistant... Analyze lead reply and generate response.
     ```
7. **Edit Fields Node:** Extract reply text  
8. **HTTP Request:** Send AI draft to backend
   - Endpoint: `/api/replies`
   - JSON body:
     ```json
     {
       "lead_id": "{{$json.id}}",
       "lead_email": "{{$json.email}}",
       "ai_drafted_reply": "{{$json.ai_drafted_reply}}"
     }
     ```

> ⚠️ Fix any errors with `JSON` or missing ngrok connections if they occur.

---

### Step 6: Meeting Setup & CRM Sync (via n8n)

#### ➤ Goal: Propose meeting time → Store in CRM

#### 🔗 n8n Steps (Add after Step 5):

1. **IF Node:** Check if message contains `meeting`, `schedule`, or `calendar`.
   - Use Regex or OpenAI to identify interest
2. **OpenAI Node:** Prompt:
3. **Set Node or Edit Fields:** Format data
4. **HTTP Request (POST):** To backend:
- Endpoint: `/api/meetings/propose`
- JSON:
  ```json
  {
    "lead_id": "{{$json.lead_id}}",
    "suggested_times": ["Tuesday 2PM", "Wednesday 11AM", "Friday 3PM"]
  }
  ```

---

## ▶️ Run the App

1. **Start Backend**
```bash
cd backend
npm install
npm run dev
```
2. **Start Frontend**
```bash
cd frontend
npm install
npm start
```
3. **Start Ngrok**
```bash
ngrok http 5001
```
4. **Start n8n**
```bash
Use: n8n.io
Import the workflow manually or recreate using steps above
```
**📂 Folder Structure**
```bash
/frontend     → React Dashboard for review & uploads
/backend      → Node.js server + DB handlers
/n8n-workflows (optional export folder)
.env          → Contains EMAIL + OPENAI keys
```
**💡 Future Improvements**
```bash
Real-time calendar sync (Google/Outlook)

Webhook-based trigger (instead of polling)

WhatsApp / Telegram integration

Lead scoring using AI

CRM dashboard view

Auto-link replies to conversation threads
```

---

### 📎 How to Attach n8n Workflow to README

1. **Export n8n Workflow:**
   - In n8n, go to your workflow → click **three dots** (⋮) → `Export`
   - Save as `.json` file (e.g., `inbound-handler.json`)

2. **Put it in a folder:**  
   Create a folder `/n8n-workflows` in your repo and upload the file there.

3. **Link it in README (optional):**
   At the end of your README, add:
   ```markdown
   ## 🔗 Workflow Files
   - [inbound-handler.json](./n8n-workflows/inbound-handler.json)

