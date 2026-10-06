# Backend/app.py

from fastapi import FastAPI, File, UploadFile, HTTPException, WebSocket, Header

from fastapi.middleware.cors import CORSMiddleware

from fastapi.responses import JSONResponse

import uvicorn

import PyPDF2

from docx import Document

import io

import json

import uuid

import time

import os

import re

import traceback

import asyncio



# Latest Gemini import

from google import genai



from pathlib import Path



# ==================== PATHS ====================

BASE_DIR = Path(__file__).resolve().parent
print(f"📁 Script directory: {BASE_DIR}")

print("🚀 Initializing ResumeMaster API...")

print("=" * 50)



app = FastAPI(title="ResumeMaster API")



# Enable CORS

app.add_middleware(

    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=False,

    allow_methods=["*"],

    allow_headers=["*"],

)



# Paths

TEMP_DIR = BASE_DIR.parent / "Temp"

TEMP_DIR.mkdir(exist_ok=True)

print(f"📁 Temp directory: {TEMP_DIR}")



# Session storage

sessions = {}



# ==================== HELPER FUNCTIONS ====================



async def call_gemini(prompt, api_key):
    """Call Gemini using the API key supplied by the current user request."""
    try:
        if not api_key or not api_key.strip():
            return "Error: Gemini API key is required"

        print("  🤖 Calling Gemini...")
        client = genai.Client(api_key=api_key.strip())
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        return response.text
    except Exception as e:
        print(f"❌ Gemini error: {e}")
        traceback.print_exc()
        return f"Error: {str(e)}"



def extract_text_from_pdf(file_bytes):

    try:

        pdf_file = io.BytesIO(file_bytes)

        pdf_reader = PyPDF2.PdfReader(pdf_file)

        return "\n".join([p.extract_text() for p in pdf_reader.pages if p.extract_text()])

    except Exception as e:

        raise Exception(f"PDF extraction error: {e}")



def extract_text_from_docx(file_bytes):

    try:

        docx_file = io.BytesIO(file_bytes)

        doc = Document(docx_file)

        return "\n".join([para.text for para in doc.paragraphs if para.text.strip()])

    except Exception as e:

        raise Exception(f"DOCX extraction error: {e}")



def clean_old_sessions():

    current = time.time()

    expired = [sid for sid, s in sessions.items() if current - s.get("timestamp", 0) > 3600]

    for sid in expired:

        del sessions[sid]

    return len(expired)



# ==================== API ENDPOINTS ====================



@app.get("/")

async def root():

    return {"message": "ResumeMaster API", "status": "running"}



@app.post("/api/parse-resume")

async def parse_resume(resume: UploadFile = File(...), gemini_api_key: str = Header(..., alias="X-Gemini-API-Key")):

    """Parse resume using Gemini"""

    session_id = str(uuid.uuid4())



    try:

        # Extract text

        content = await resume.read()

        if resume.filename.lower().endswith('.pdf'):

            text = extract_text_from_pdf(content)

        elif resume.filename.lower().endswith('.docx'):

            text = extract_text_from_docx(content)

        else:

            text = content.decode('utf-8', errors='ignore')



        # Parse with Gemini

        prompt = f"""You are a resume parser. Extract ALL information from this resume and return ONLY valid JSON.



Resume:

{text}



Return a JSON object with this EXACT structure. Use empty arrays/strings if information not found:

{{

    "personal_info": {{

        "name": "full name",

        "email": "email",

        "phone": "phone number",

        "location": "city, state",

        "linkedin": "linkedin URL",

        "github": "github URL",

        "portfolio": "portfolio URL"

    }},

    "education": [

        {{

            "degree": "degree name",

            "institution": "school",

            "year": "year",

            "gpa": "gpa",

            "honors": ["honor1", "honor2"]

        }}

    ],

    "experience": [

        {{

            "title": "job title",

            "company": "company",

            "dates": "start - end",

            "description": "what they did",

            "achievements": ["achievement1", "achievement2"],

            "technologies": ["tech1", "tech2"]

        }}

    ],

    "projects": [

        {{

            "name": "project name",

            "description": "what it does",

            "technologies": ["tech1", "tech2"],

            "achievement": "what they accomplished"

        }}

    ],

    "volunteering": [

        {{

            "role": "role",

            "organization": "organization",

            "dates": "when",

            "description": "what they did"

        }}

    ],

    "skills": {{

        "technical": ["skill1", "skill2"],

        "soft": ["skill1", "skill2"],

        "languages": ["lang1", "lang2"]

    }},

    "certifications": ["cert1", "cert2"],

    "summary": "brief professional summary",

    "years_experience": 0,

    "suggested_titles": ["title1", "title2"]

}}



IMPORTANT: Extract ALL experiences, ALL projects, ALL volunteering, ALL skills.

Return ONLY the JSON, no other text."""



        response = await call_gemini(prompt, gemini_api_key)



        # Extract JSON from response

        json_match = re.search(r'\{.*\}', response, re.DOTALL)

        if json_match:

            try:

                parsed = json.loads(json_match.group(0))

            except:

                parsed = {"error": "Could not parse JSON", "raw": response[:500]}

        else:

            parsed = {"error": "No JSON found", "raw": response[:500]}



        # Store session

        sessions[session_id] = {

            "resume_text": text,

            "parsed": parsed,

            "timestamp": time.time(),

            "job_text": None,

            "interview_history": []

        }



        return {"success": True, "session_id": session_id, "parsed": parsed}



    except Exception as e:

        traceback.print_exc()

        return JSONResponse(status_code=500, content={"error": str(e)})



@app.post("/api/evaluate")

async def evaluate_resume(request: dict, gemini_api_key: str = Header(..., alias="X-Gemini-API-Key")):

    """Strict evaluation of resume against job"""

    session_id = request.get("session_id")

    job_text = request.get("job_text")



    session = sessions.get(session_id)

    if not session:

        return JSONResponse(status_code=404, content={"error": "Session expired"})



    session["job_text"] = job_text



    prompt = f"""You are an EXTREMELY STRICT HR analyst. Evaluate this candidate:



CANDIDATE DATA:

{json.dumps(session['parsed'], indent=2)}



JOB DESCRIPTION:

{job_text}



SCORING GUIDELINES:

- 90-100%: Truly exceptional candidate who exceeds all requirements

- 80-89%: Strong candidate with minor gaps

- 70-79%: Good candidate but significant gaps

- 60-69%: Average candidate, many gaps

- Below 60%: Poor match



Be BRUTALLY HONEST about weaknesses. Only exceptional candidates should score high.



Return a JSON object with EXACTLY these fields:

{{

    "match_score": 0-100,

    "matching_skills": ["skill1", "skill2"],

    "missing_skills": ["skill1", "skill2"],

    "strengths": ["specific strength 1", "specific strength 2"],

    "weaknesses": ["specific weakness 1", "specific weakness 2"],

    "recommendations": ["recommendation 1", "recommendation 2"],

    "reasoning": "brief explanation of the evaluation",

    "verdict": "Strong Hire / Hire / Consider / Pass / Strong Pass"

}}



Return ONLY the JSON, no other text."""



    response = await call_gemini(prompt, gemini_api_key)



    json_match = re.search(r'\{.*\}', response, re.DOTALL)

    if json_match:

        try:

            result = json.loads(json_match.group(0))

            return {"success": True, "evaluation": result}

        except:

            pass



    return {"success": True, "evaluation": {"match_score": 50, "reasoning": "Could not parse evaluation"}}



@app.post("/api/tailor")

async def tailor_resume(request: dict, gemini_api_key: str = Header(..., alias="X-Gemini-API-Key")):

    """Get tailoring suggestions - STRICTLY based on existing content only"""

    session_id = request.get("session_id")

    job_text = request.get("job_text")



    session = sessions.get(session_id)

    if not session:

        return JSONResponse(status_code=404, content={"error": "Session expired"})



    prompt = f"""You are a professional resume writer. Provide specific tailoring suggestions with explanations.



CRITICAL RULES - YOU MUST FOLLOW THESE EXACTLY:

1. NEVER invent or add ANY new information that isn't in the original resume

2. ONLY suggest changes based on EXISTING content in the resume

3. You may ONLY:

   - Change sentence structure (rephrase)

   - Change word choice (use stronger verbs)

   - Reorder bullet points

   - Remove irrelevant information (be careful with this - only remove if truly irrelevant)

   - Highlight certain experiences more prominently

4. You CANNOT add new skills, experiences, achievements, or any facts not present in the original resume

5. Every suggestion must be traceable back to the original resume content



ORIGINAL RESUME TEXT:

{session['resume_text']}



JOB DESCRIPTION:

{job_text}



Return a JSON object with this structure. Every suggestion must come ONLY from the original resume:

{{

    "summary_section": [

        {{

            "suggestion": "Rephrase your summary to: ...",

            "reason": "This better highlights your experience because..."

        }}

    ],

    "experience_section": [

        {{

            "job_title": "Current Job Title",

            "suggestions": [

                {{

                    "suggestion": "Rephrase this bullet point to: ...",

                    "reason": "This uses stronger action verbs"

                }},

                {{

                    "suggestion": "Move this bullet point to the top",

                    "reason": "This is most relevant to the job"

                }},

                {{

                    "suggestion": "Consider removing this bullet point as it's not relevant to the position",

                    "reason": "This experience doesn't align with the job requirements"

                }}

            ]

        }}

    ],

    "projects_section": [

        {{

            "project_name": "Project Name",

            "suggestions": [

                {{

                    "suggestion": "Emphasize this achievement more: ...",

                    "reason": "This demonstrates skills the job requires"

                }}

            ]

        }}

    ],

    "skills_section": [

        {{

            "suggestion": "Reorder skills to put these first: ...",

            "reason": "These are most relevant to the job"

        }}

    ],

    "volunteering_section": [

        {{

            "suggestion": "Highlight this volunteering experience",

            "reason": "This shows leadership qualities"

        }}

    ],

    "general_tips": [

        {{

            "suggestion": "Tip 1: ...",

            "reason": "Why this tip will help"

        }}

    ]

}}



Be SPECIFIC. Tell them exactly what to change and WHY.

REMEMBER: Never add new information. Only rephrase, reorder, or remove existing content.

Be VERY careful with removal suggestions - only suggest removing if the content is completely irrelevant to the job.

Return ONLY the JSON, no other text."""



    response = await call_gemini(prompt, gemini_api_key)



    json_match = re.search(r'\{.*\}', response, re.DOTALL)

    if json_match:

        try:

            result = json.loads(json_match.group(0))

            return {"success": True, "suggestions": result}

        except:

            pass



    return {"success": True, "suggestions": {"general_tips": [{"suggestion": response[:500], "reason": "General advice"}]}}



@app.websocket("/ws/interview/{session_id}")

async def websocket_interview(websocket: WebSocket, session_id: str):

    """Text-based chat interview with strict evaluation"""

    await websocket.accept()

    # Receive the user's Gemini API key as the first WebSocket message.
    # It is kept only in this connection's local memory and is never stored in a session.
    try:
        auth_data = await asyncio.wait_for(websocket.receive_json(), timeout=15.0)
    except Exception:
        await websocket.close(code=1008)
        return

    if auth_data.get("type") != "auth" or not auth_data.get("api_key"):
        await websocket.send_json({"type": "error", "data": "Gemini API key is required."})
        await websocket.close(code=1008)
        return

    api_key = str(auth_data["api_key"]).strip()



    session = sessions.get(session_id)

    if not session:

        await websocket.send_json({"error": "Session expired"})

        await websocket.close()

        return



    review_sent = False  # Flag to track if review was sent



    try:

        job_text = session.get("job_text", "General interview")

        session["interview_history"] = []



        # Send connection confirmation

        await websocket.send_json({"type": "connected", "data": "Interview started. Type your responses below."})



        # Get first question - mix of difficult and typical questions based on resume and job

        first_prompt = f"""You are a professional interviewer conducting a challenging interview. Ask the FIRST question.



Candidate Resume:

{json.dumps(session['parsed'], indent=2)}



Job Description:

{job_text}



QUESTION GUIDELINES:

- Ask DIFFICULT, thought-provoking questions (70% of questions)

- Include some typical questions (30% of questions)

- Questions should probe:

  * Their specific experience vs job requirements

  * Gaps between their resume and job needs

  * Technical depth in their field

  * Problem-solving abilities

  * Why they want this specific job

  * Why they should be hired

  * How they handled challenges

  * Their understanding of the industry/role



Example difficult questions:

- "Your resume shows experience with X, but this job requires Y. How would you bridge that gap?"

- "Describe a time when a project failed and how you handled it."

- "Why do you think you're the best candidate for this role despite having less experience than preferred?"



Example typical questions:

- "Why do you want to work here?"

- "What are your greatest strengths and weaknesses?"

- "Where do you see yourself in 5 years?"



Start with a challenging question based on their resume and the job requirements.

Return ONLY the question, no other text."""



        first_q = await call_gemini(first_prompt, api_key)

        if first_q.startswith("Error:"):

            first_q = "Tell me about a challenging project you worked on and how you overcame obstacles."



        await websocket.send_json({"type": "question", "data": first_q})

        session["interview_history"].append({"role": "ai", "content": first_q})



        # Interview loop

        while True:

            try:

                # Show typing indicator before waiting for response

                await websocket.send_json({"type": "typing"})



                # Wait for user response

                data = await asyncio.wait_for(websocket.receive_json(), timeout=120.0)



                if data["type"] == "answer":

                    user_answer = data.get("data", "")



                    # Show user's message

                    await websocket.send_json({"type": "message", "data": f"You: {user_answer}"})

                    session["interview_history"].append({"role": "user", "content": user_answer})



                    # Show typing indicator while generating next question

                    await websocket.send_json({"type": "typing"})



                    # Get next question - maintain the mix of difficult and typical

                    next_prompt = f"""Continue the interview. Ask ONE follow-up question based on their last answer.



Candidate Resume:

{json.dumps(session['parsed'], indent=2)}



Job Description:

{job_text}



Interview History:

{json.dumps(session['interview_history'], indent=2)}



QUESTION GUIDELINES (maintain this ratio):

- 70% difficult, challenging questions

- 30% typical interview questions



Base your question on:

- Their last answer (probe deeper)

- Gaps between their experience and job requirements

- Areas they haven't covered yet

- Their fit for the role

- Their career motivations



Return ONLY the question, no other text."""



                    next_q = await call_gemini(next_prompt, api_key)

                    if next_q.startswith("Error:"):

                        next_q = "Can you elaborate more on that experience?"



                    # Hide typing indicator and send question

                    await websocket.send_json({"type": "stop_typing"})

                    await websocket.send_json({"type": "question", "data": next_q})

                    session["interview_history"].append({"role": "ai", "content": next_q})



                elif data["type"] == "end":

                    break



            except asyncio.TimeoutError:

                await websocket.send_json({"type": "prompt", "data": "Still there? Take your time."})

            except Exception as e:

                print(f"Loop error: {e}")

                break



        # Generate strict interview review - SMART last question handling

        if len(session["interview_history"]) > 2:  # Only if there was actual conversation

            print("📊 Generating strict interview review...")



            # Send processing indicator to frontend

            await websocket.send_json({"type": "processing_review", "data": "Analyzing interview performance..."})



            # SMART HANDLING: Only exclude unanswered questions, keep all answered ones

            review_history = []



            # Check if the last message is from AI (unanswered question)

            if session["interview_history"] and session["interview_history"][-1]["role"] == "ai":

                # Last message is an unanswered question - exclude only that one

                review_history = session["interview_history"][:-1]

                print(f"Excluding last unanswered question from review")

            else:

                # All questions were answered, include everything

                review_history = session["interview_history"]

                print(f"All questions answered, including full history")



            print(f"Reviewing {len(review_history)} messages (excluded {len(session['interview_history']) - len(review_history)} unanswered questions)")



            review_prompt = f"""You are an EXTREMELY STRICT interview coach. Review this interview and provide brutally honest feedback, just like a strict HR evaluation.



INTERVIEW HISTORY (only answered questions):

{json.dumps(review_history, indent=2)}



JOB DESCRIPTION:

{job_text}



CANDIDATE RESUME:

{json.dumps(session['parsed'], indent=2)}



SCORING GUIDELINES (be very strict):

- 90-100%: Exceptional performance, would hire immediately

- 80-89%: Strong performance, minor improvements needed

- 70-79%: Good but significant gaps

- 60-69%: Below average, multiple issues

- Below 60%: Poor performance, not ready



CRITICAL EVALUATION POINTS:

1. Did they ACTUALLY answer the question? (Penalize heavily for non-answers or topic-dodging)

2. Did they use specific examples (STAR method) or speak in vague generalities?

3. Did their answers align with what the job actually requires?

4. Did they demonstrate self-awareness about gaps in their experience?

5. Did they provide concrete evidence of their skills, not just claims?



DETECT EVASIVE ANSWERS:

- If they changed the subject instead of answering → point it out

- If they gave a generic response that could apply to anyone → point it out

- If they avoided addressing a weakness or gap → point it out

- If they talked about something completely irrelevant → point it out



Return a JSON object with EXACTLY this structure:

{{

    "overall_score": 0-100,

    "hiring_verdict": "Strong Hire / Hire / Consider / Pass / Strong Pass",

    "strengths": [

        "specific strength with example from interview - be detailed"

    ],

    "weaknesses": [

        "specific thing they did wrong with example - be brutally honest"

    ],

    "better_answers": [

        {{

            "question": "the exact question they were asked",

            "their_answer": "exactly what they said",

            "better_answer": "a model answer using STAR method that would have impressed"

        }}

    ],

    "key_mistakes": [

        "critical mistake they made and why it hurt them (e.g., 'Dodged the question about leadership by talking about technical skills')"

    ],

    "tips": [

        "actionable tip for next time"

    ],

    "reasoning": "brief explanation of the overall evaluation"

}}



Be EXTREMELY CRITICAL. Point out every mistake, especially evasive answers where they didn't directly address the question.

This evaluation should be just as strict as the resume evaluation.

Return ONLY the JSON, no other text."""



            review = await call_gemini(review_prompt, api_key)



            json_match = re.search(r'\{.*\}', review, re.DOTALL)

            if json_match:

                try:

                    review_data = json.loads(json_match.group(0))

                    await websocket.send_json({"type": "review", "data": review_data})

                    print("✅ Interview review sent successfully")

                    review_sent = True

                    # Small delay to ensure client receives it

                    await asyncio.sleep(0.5)

                except Exception as e:

                    print(f"❌ Error sending review JSON: {e}")

                    try:

                        await websocket.send_json({"type": "review", "data": {"error": "Could not generate review", "raw": review[:500]}})

                        review_sent = True

                        await asyncio.sleep(0.5)

                    except:

                        pass

            else:

                print("❌ No JSON found in review response")

                try:

                    await websocket.send_json({"type": "review", "data": {"error": "Could not generate review", "raw": review[:500]}})

                    review_sent = True

                    await asyncio.sleep(0.5)

                except:

                    pass

        else:

            # Not enough conversation

            try:

                await websocket.send_json({"type": "review", "data": {"error": "Interview too short to generate meaningful review"}})

                review_sent = True

                await asyncio.sleep(0.5)

            except:

                pass



    except Exception as e:

        print(f"WebSocket error: {e}")

        traceback.print_exc()

    finally:

        # Only close if we haven't already closed

        try:

            # If we sent a review, wait a moment for it to be processed

            if review_sent:

                await asyncio.sleep(0.5)

            await websocket.close()

        except:

            pass

        print(f"Interview ended for session {session_id}")



# Cleanup task

@app.on_event("startup")

async def startup():

    asyncio.create_task(cleanup_loop())



async def cleanup_loop():

    while True:

        await asyncio.sleep(300)

        cleaned = clean_old_sessions()

        if cleaned:

            print(f"🧹 Cleaned {cleaned} sessions")



if __name__ == "__main__":

    print("\n" + "="*60)

    print("🚀 Server running at http://localhost:8000")

    print("📝 Endpoints:")

    print("  - POST /api/parse-resume")

    print("  - POST /api/evaluate")

    print("  - POST /api/tailor")

    print("  - WS  /ws/interview/{session_id}")

    print("="*60 + "\n")

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)