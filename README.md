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
| Meeting Proposal + CRM Sync(Hub Spot)  | ✅ Done   |

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
### Here's a complete structure of the n8n in json format 
```bash
{
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "minutes",
              "minutesInterval": 2
            }
          ]
        }
      },
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [
        -280,
        -20
      ],
      "id": "8285db2e-c0b1-43b7-8b85-2f05af70a9f9",
      "name": "Schedule Trigger"
    },
    {
      "parameters": {
        "url": "https://b5a79839d355.ngrok-free.app/api/leads/contacted",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        -60,
        -20
      ],
      "id": "2e4607fc-cd99-4d4a-9da3-ea7f56ec9797",
      "name": "HTTP Request"
    },
    {
      "parameters": {
        "options": {}
      },
      "type": "n8n-nodes-base.splitInBatches",
      "typeVersion": 3,
      "position": [
        160,
        -20
      ],
      "id": "af464d14-d374-4e1b-9180-0fee1d702274",
      "name": "Loop Over Items"
    },
    {
      "parameters": {
        "operation": "getAll",
        "filters": {
          "readStatus": "unread",
          "sender": "={{ $json.email }}"
        }
      },
      "type": "n8n-nodes-base.gmail",
      "typeVersion": 2.1,
      "position": [
        400,
        80
      ],
      "id": "7d68626a-d457-4f67-b99b-c92230512137",
      "name": "Get many messages",
      "webhookId": "4903220c-923d-4caf-93ee-eaf6f1c0ff48",
      "credentials": {
        "gmailOAuth2": {
          "id": "CZpR7HCHS08rqkjw",
          "name": "Gmail account"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 2
          },
          "conditions": [
            {
              "id": "f5c17acb-84c4-49cf-bb6c-1314ef301f06",
              "leftValue": "={{ $json.id }}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notEmpty",
                "singleValue": true
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.2,
      "position": [
        620,
        80
      ],
      "id": "b8c820b3-e178-48b8-9de5-b081c0af295c",
      "name": "If"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=AIzaSyBc0LzBcxXgAYogHiMt8_1MbiDH7O6a6PY",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={\n  \"contents\": [\n    {\n      \"parts\": [\n        {\n          \"text\": \"You are a professional and helpful sales assistant for our company, 'strikin'. Your job is to analyze an incoming email from a lead and draft a smart, concise response for a human team member to review and approve.\\n\\nHere is the lead's information from our system:\\n- Name: {{ $('Loop Over Items').item.json.full_name }}\\n- Company: {{ $('Loop Over Items').item.json.company }}\\n\\nHere is the lead's actual email to us. Analyze it carefully:\\n\\\"{{ $('Get many messages').item.json.snippet }}\\\"\\n\\nYOUR TASK:\\n1. Understand the lead's question, problem, or sentiment from their email.\\n2. Draft a professional and friendly response that directly addresses their message.\\n3. Do NOT add a salutation like \\\"Hi [Name],\\\" or a sign-off like \\\"Best regards,\\\". Just write the body of the email.\\n\\nDrafted Response Body:\"\n        }\n      ]\n    }\n  ]\n}\n",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        860,
        0
      ],
      "id": "bf1239aa-8fda-4b2d-bef6-42827a137e0a",
      "name": "HTTP Request1"
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "2678f1ec-c11f-4290-9941-11378e48fdfc",
              "name": "ai_drafted_reply",
              "value": "={{ $node[\"HTTP Request1\"].json.candidates[0].content.parts[0].text }}",
              "type": "string"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        1060,
        60
      ],
      "id": "b0b468a4-829b-4445-9a64-34b31041c75d",
      "name": "Edit Fields"
    },
    {
      "parameters": {
        "calendar": {
          "__rl": true,
          "value": "loverboyraju48@gmail.com",
          "mode": "list",
          "cachedResultName": "loverboyraju48@gmail.com"
        },
        "additionalFields": {
          "attendees": [
            "={{ $(\"Loop Over Items\").item.json.email }}"
          ],
          "description": "=Lead Email: {{ $(\"Loop Over Items\").item.json.email }}  AI Drafted Reply: {{ $json.ai_drafted_reply }}  Please join this meeting to discuss further.",
          "summary": "=Meeting with {{ $(\"Loop Over Items\").item.json.full_name }}"
        }
      },
      "type": "n8n-nodes-base.googleCalendar",
      "typeVersion": 1.3,
      "position": [
        1500,
        20
      ],
      "id": "325d4908-aa7e-45a7-beed-e8dc59305511",
      "name": "Create an event",
      "credentials": {
        "googleCalendarOAuth2Api": {
          "id": "GwtF1OAt2XkJiFNY",
          "name": "Google Calendar account"
        }
      }
    },
    {
      "parameters": {
        "authentication": "oAuth2",
        "email": "={{ $('Loop Over Items').item.json.email }}",
        "additionalFields": {
          "companyName": "={{ $('Loop Over Items').item.json.company }}",
          "firstName": "={{ $('Loop Over Items').item.json.full_name.split(\" \")[0] }}"
        },
        "options": {
          "resolveData": false
        }
      },
      "type": "n8n-nodes-base.hubspot",
      "typeVersion": 2.1,
      "position": [
        1720,
        60
      ],
      "id": "a79e266d-3050-474e-8ce1-569306df35a9",
      "name": "Create or update a contact",
      "credentials": {
        "hubspotOAuth2Api": {
          "id": "GEDdAURAt0RRuovZ",
          "name": "HubSpot account"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 2
          },
          "conditions": [
            {
              "id": "a2c363be-d143-4a70-af0d-80d69a693acb",
              "leftValue": "={{ $json.ai_drafted_reply.toLowerCase() }}",
              "rightValue": "interested",
              "operator": {
                "type": "string",
                "operation": "contains"
              }
            },
            {
              "id": "8a6ec3cd-9338-4e85-9f4d-860f864de139",
              "leftValue": "={{ $json.ai_drafted_reply.toLowerCase() }}",
              "rightValue": "schedule",
              "operator": {
                "type": "string",
                "operation": "contains"
              }
            },
            {
              "id": "b4be46f1-e5de-4c13-ac22-3e55efff7873",
              "leftValue": "={{ $json.ai_drafted_reply.toLowerCase() }}",
              "rightValue": "connect",
              "operator": {
                "type": "string",
                "operation": "contains"
              }
            }
          ],
          "combinator": "or"
        },
        "options": {}
      },
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.2,
      "position": [
        1280,
        60
      ],
      "id": "e882d33d-fc02-4dae-a7c8-c68ac234e840",
      "name": "If1"
    }
  ],
  "connections": {
    "Schedule Trigger": {
      "main": [
        [
          {
            "node": "HTTP Request",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "HTTP Request": {
      "main": [
        [
          {
            "node": "Loop Over Items",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Loop Over Items": {
      "main": [
        [],
        [
          {
            "node": "Get many messages",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get many messages": {
      "main": [
        [
          {
            "node": "If",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "If": {
      "main": [
        [
          {
            "node": "HTTP Request1",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "HTTP Request1": {
      "main": [
        [
          {
            "node": "Edit Fields",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Edit Fields": {
      "main": [
        [
          {
            "node": "If1",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Create an event": {
      "main": [
        [
          {
            "node": "Create or update a contact",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Create or update a contact": {
      "main": [
        []
      ]
    },
    "If1": {
      "main": [
        [
          {
            "node": "Create an event",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    }
  },
  "pinData": {},
  "meta": {
    "templateCredsSetupCompleted": true,
    "instanceId": "43a8938e4a5b8146d823497cca59e15c5de4dbbbc755ed5ad67422ce897afe62"
  }
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

