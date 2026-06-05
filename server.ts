import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

// Load environment variables for development
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Initialize the Google GenAI SDK
// API key is sourced from process.env.GEMINI_API_KEY
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

/**
 * Health check endpoint
 */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

/**
 * Endpoint to analyze the user's raw notes and suggest key improvements/questions to think about.
 */
app.post("/api/recruitment/suggest-details", async (req, res) => {
  try {
    const { rawNotes } = req.body;
    if (!rawNotes || typeof rawNotes !== "string" || rawNotes.trim().length < 5) {
      return res.status(400).json({ error: "Please write a bit more in your raw notes first!" });
    }

    const prompt = `
You are a brilliant World-Class Technical Recruiter and HR Advisor.
Analyze the following raw role notes and generate 4-5 high-value constructive suggestions or questions that would elevate this hiring document if answered or added.
For example, point out missing aspects like: remote/hybrid policy, tech level expectations, reporting structures, performance metrics, budget/compensation guidelines, or key soft skill expectations.

Raw Notes:
"""
${rawNotes}
"""

Provide your recommendations in JSON format conforming to this structure:
{
  "suggestions": [
    {
      "topic": "Reporting Structure",
      "text": "What team will this role belong to, and who does this person report to (e.g. Engineering Manager, Director of Tech)?"
    }
  ]
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: {
              type: Type.ARRAY,
              description: "A list of constructive enhancement questions/suggestions categorized by HR topics.",
              items: {
                type: Type.OBJECT,
                properties: {
                  topic: { type: Type.STRING, description: "HR topic or category of suggestion. E.g., 'Workplace Setup', 'Skills Depth', 'Benefits & Compensation'" },
                  text: { type: Type.STRING, description: "Precise, encouraging, client-facing prompt/question for the recruiter." }
                },
                required: ["topic", "text"]
              }
            }
          },
          required: ["suggestions"]
        }
      }
    });

    const resultText = response.text || "{}";
    res.json(JSON.parse(resultText.trim()));
  } catch (error: any) {
    console.error("Error in suggest-details API:", error);
    res.status(500).json({ error: error.message || "Failed to analyze raw notes." });
  }
});

/**
 * Endpoint to generate a LinkedIn Job Description and 10 Behavioral Interview Questions.
 */
app.post("/api/recruitment/generate", async (req, res) => {
  try {
    const { rawNotes, tone, includeHashtags, includeEmojis, customRequirements } = req.body;

    if (!rawNotes || typeof rawNotes !== "string" || rawNotes.trim().length < 5) {
      return res.status(400).json({ error: "Raw role notes must be provided and have a reasonable length." });
    }

    const toneInstructions = {
      startup: "Energetic, bold, fast-paced, startup-oriented, highly collaborative, focusing on high ownership, passion, and thrive-in-chaos attitude.",
      corporate: "Highly professional, formal, polish-focused, emphasizing industry standard processes, excellence, corporate benefits, structure, and enterprise scaling.",
      technical: "Deeply tech-focused, precise, detail-heavy, calling out architecture pattern expectations, coding rigor, specific toolchains, and technical challenges.",
      casual: "Friendly, casual, warm, conversational, highly inclusive, human, focus on team activities, life-balance, and real connection."
    }[tone as 'startup' | 'corporate' | 'technical' | 'casual'] || "Professional and standard HR-oriented.";

    const prompt = `
You are a highly sought-after HR Guru and Recruiting Strategist.
Your goal is to parse the raw notes below and construct two outstanding recruitment assets for a desirable role:
1) A LinkedIn Job Description (JD): Fully formatted, highly readable, structured block sections in Markdown.
2) An Interview Guide: Exactly 10 strategic behavioral and situational interview questions targeting the specific hard and soft skills requested.

Here are the details you should work with:
---
Raw Role Notes:
"""
${rawNotes}
"""

Custom Guidelines or Extra Notes (if any):
"""
${customRequirements || "None"}
"""

Tone style to apply: ${tone} (Instructions: ${toneInstructions})
Include Emojis: ${includeEmojis ? "Yes, use appropriate professional emojis at the start of section headings and bullet points to add flair without being too chatty" : "No, do not use emojis. Focus on clean layout symbols."}
Include LinkedIn Hashtags: ${includeHashtags ? "Yes, generate 4-5 highly relevant hashtags at the very bottom of the description." : "No, do not append hashtags."}
---

CRITICAL REQUIREMENTS FOR THE OUTPUT:
- The [Job Description] must be realistic, highly marketable, and structured. It should contain sections:
  1. Role Title & Core Mission Statement (Why does this role exist? Make it sound exciting!)
  2. Core Responsibilities (Action-packed bullets starting with verbs like "Architect", "Drive", "Co-author")
  3. Desired Skills & Profile (Split cleanly into "Must-Haves / Professional Strengths" and "Nice-to-Haves")
  4. What We Offer / Core Benefits
- The [Interview Questions] must target specific hard skills and soft skills appearing directly in the JD.
- Provide EXACTLY 10 questions.
- Each question must define:
  * The exact hard/soft skill targeted (e.g. "React State Machine architecture" or "Active Listening & Empathy under tension").
  * A clear functional rationale (HR perspective).
  * A precise 'Good Answer Guide' with concrete indicators (e.g., Star Methodology, mentioning specific patterns, naming fallback plans) so the interviewer can evaluate effectively.

Generate these assets and map them to the following JSON structure.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "A refined and polished job title based on the notes (e.g., 'Lead Frontend Engineer (React/TypeScript)')."
            },
            jobDescription: {
              type: Type.STRING,
              description: "The complete formatted job description in Markdown ready for LinkedIn."
            },
            questions: {
              type: Type.ARRAY,
              description: "Strictly 10 tactical behavioral/situational questions.",
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "Sequential ID, e.g., 'q1', 'q2'..." },
                  question: { type: Type.STRING, description: "The open-ended behavioral or scenario-based question." },
                  skillTarget: { type: Type.STRING, description: "The hard or soft skill targeted (e.g. React Architecture, Critical Empathy)." },
                  category: {
                    type: Type.STRING,
                    description: "Category of skill tested: 'hard', 'soft', 'leadership', 'culture'."
                  },
                  rationale: { type: Type.STRING, description: "Why we ask this and what failure indicator it identifies." },
                  goodAnswerGuide: { type: Type.STRING, description: "Clear concrete indicators of a strong responder (bullet points suggested)." }
                },
                required: ["id", "question", "skillTarget", "category", "rationale", "goodAnswerGuide"]
              }
            }
          },
          required: ["title", "jobDescription", "questions"]
        }
      }
    });

    const jsonText = response.text || "{}";
    res.json(JSON.parse(jsonText.trim()));

  } catch (error: any) {
    console.error("Error in generate API:", error);
    res.status(500).json({ error: error.message || "An error occurred during recruitment assets generation." });
  }
});


// Configure Vite middleware in development or direct static asset servers in production
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development Mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Started Express server in DEVELOPMENT mode with Vite Middleware.");
  } else {
    // Production Mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // SPA Fallback
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Started Express server in PRODUCTION mode serving /dist.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Recruitment Sandbox Server running on http://localhost:${PORT}`);
  });
}

setupServer();
