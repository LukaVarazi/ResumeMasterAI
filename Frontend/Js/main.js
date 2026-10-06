// Frontend/JS/main.js
class ResumeMasterApp {
  constructor() {
    this.API_BASE = "http://localhost:8000";
    this.WS_BASE = "ws://localhost:8000";
    this.currentSessionId = null;
    this.parsedData = null;
    this.websocket = null;
    this.isRecording = false;
    this.pingInterval = null;
    this.loadingCounter = 0;
    this.interviewActive = false; // Track if interview is active

    // Gemini API key is kept only in memory.
    // It is NOT stored in localStorage, sessionStorage, cookies, or the server.
    this.geminiApiKey = null;
    this.apiKeyModalResolver = null;

    this.init();

    // Clear the key when the page is refreshed/closed.
    window.addEventListener("beforeunload", () => {
      this.geminiApiKey = null;
    });
  }

  init() {
    this.setupEventListeners();
    this.checkBackendHealth();
    this.createLoadingSpinner();
    this.setupDragAndDrop();
    this.setupThemeToggle();
  }

  setupEventListeners() {
    // File selection buttons
    document
      .getElementById("selectResumeBtn")
      ?.addEventListener("click", () => {
        document.getElementById("resumeFile").click();
      });

    document.getElementById("selectJobBtn")?.addEventListener("click", () => {
      document.getElementById("jobFile").click();
    });

    // File input changes
    document.getElementById("resumeFile")?.addEventListener("change", (e) => {
      document.getElementById("resumeFileName").textContent =
        e.target.files[0]?.name || "";
      this.animateUploadCard("resumeCard");
      this.validateUploadForm();
    });

    document.getElementById("jobFile")?.addEventListener("change", (e) => {
      document.getElementById("jobFileName").textContent =
        e.target.files[0]?.name || "";
      this.animateUploadCard("jobCard");
      this.validateUploadForm();
    });

    // Job text input
    document.getElementById("jobText")?.addEventListener("input", () => {
      this.validateUploadForm();
    });

    // Upload form submission
    document.getElementById("uploadForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleUpload();
    });

    // Parsed preview actions
    document.getElementById("editParsedBtn")?.addEventListener("click", () => {
      this.editParsedData();
    });

    document
      .getElementById("confirmParsedBtn")
      ?.addEventListener("click", () => {
        this.confirmParsedData();
      });

    // Action buttons
    document.getElementById("evaluateBtn")?.addEventListener("click", () => {
      this.runEvaluation();
    });

    document.getElementById("tailorBtn")?.addEventListener("click", () => {
      this.runTailoring();
    });

    document
      .getElementById("startInterviewBtn")
      ?.addEventListener("click", () => {
        this.startInterview();
      });

    document.getElementById("sendMessageBtn")?.addEventListener("click", () => {
      this.sendMessage();
    });

    document
      .getElementById("endInterviewBtn")
      ?.addEventListener("click", () => {
        this.endInterview();
      });

    document
      .getElementById("newInterviewBtn")
      ?.addEventListener("click", () => {
        this.startNewInterview();
      });

    // Enter key to send message
    document
      .getElementById("interviewInput")
      ?.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey && this.interviewActive) {
          e.preventDefault();
          this.sendMessage();
        }
      });

    // Navbar scroll effect
    window.addEventListener("scroll", () => {
      const navbar = document.querySelector(".navbar");
      navbar?.classList.toggle("scrolled", window.scrollY > 50);
    });

    // Gemini API key modal
    document.getElementById("saveApiKeyBtn")?.addEventListener("click", () => {
      this.saveApiKey();
    });

    document
      .getElementById("apiKeyInput")
      ?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.saveApiKey();
        }
      });

    // If the modal is closed without saving, resolve as false.
    document
      .getElementById("apiKeyModal")
      ?.addEventListener("hidden.bs.modal", () => {
        if (this.apiKeyModalResolver) {
          this.apiKeyModalResolver(false);
          this.apiKeyModalResolver = null;
        }
      });
  }

  setupThemeToggle() {
    const themeToggle = document.getElementById("themeToggle");
    const body = document.body;

    const savedTheme = localStorage.getItem("theme") || "dark";
    body.setAttribute("data-theme", savedTheme);

    themeToggle?.addEventListener("click", () => {
      const currentTheme = body.getAttribute("data-theme");
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      body.setAttribute("data-theme", newTheme);
      localStorage.setItem("theme", newTheme);
    });
  }

  // ============================================================
  // GEMINI API KEY
  // ============================================================

  async ensureApiKey() {
    // Already have a key in memory.
    if (this.geminiApiKey) {
      return true;
    }

    const modalElement = document.getElementById("apiKeyModal");

    if (!modalElement || typeof bootstrap === "undefined") {
      this.showToast("Gemini API key modal is unavailable.", "error");
      return false;
    }

    const input = document.getElementById("apiKeyInput");

    if (input) {
      input.value = "";
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);

    return new Promise((resolve) => {
      this.apiKeyModalResolver = resolve;

      modal.show();

      setTimeout(() => {
        input?.focus();
      }, 300);
    });
  }

  saveApiKey() {
    const input = document.getElementById("apiKeyInput");
    const key = input?.value.trim();

    if (!key) {
      this.showToast("Please enter your Gemini API key.", "error");
      return;
    }

    // Store only in JavaScript memory.
    this.geminiApiKey = key;

    // Immediately clear the visible input field.
    if (input) {
      input.value = "";
    }

    const modalElement = document.getElementById("apiKeyModal");

    if (modalElement && typeof bootstrap !== "undefined") {
      const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
      modal.hide();
    }

    if (this.apiKeyModalResolver) {
      this.apiKeyModalResolver(true);
      this.apiKeyModalResolver = null;
    }
  }

  getGeminiHeaders(includeContentType = false) {
    if (!this.geminiApiKey) {
      throw new Error("Gemini API key is required.");
    }

    const headers = {
      "X-Gemini-API-Key": this.geminiApiKey,
    };

    if (includeContentType) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }

  animateUploadCard(cardId) {
    const card = document.getElementById(cardId);
    if (card) {
      card.style.transform = "scale(0.95)";
      setTimeout(() => (card.style.transform = "scale(1)"), 200);
    }
  }

  setupDragAndDrop() {
    ["resumeCard", "jobCard"].forEach((id) => {
      const area = document.getElementById(id);
      if (!area) return;

      area.addEventListener("dragover", (e) => {
        e.preventDefault();
        area.style.borderColor = "var(--accent-primary)";
        area.style.transform = "scale(1.02)";
      });

      area.addEventListener("dragleave", () => {
        area.style.borderColor = "";
        area.style.transform = "";
      });

      area.addEventListener("drop", (e) => {
        e.preventDefault();
        area.style.borderColor = "";
        area.style.transform = "";

        const file = e.dataTransfer.files[0];

        if (id === "resumeCard") {
          document.getElementById("resumeFile").files = e.dataTransfer.files;
          document.getElementById("resumeFileName").textContent =
            file?.name || "";
        } else {
          document.getElementById("jobFile").files = e.dataTransfer.files;
          document.getElementById("jobFileName").textContent = file?.name || "";
        }

        this.validateUploadForm();
      });
    });
  }

  validateUploadForm() {
    const resumeFile = document.getElementById("resumeFile").files[0];
    const jobText = document.getElementById("jobText").value.trim();
    const jobFile = document.getElementById("jobFile").files[0];

    document.getElementById("processBtn").disabled = !(
      resumeFile &&
      (jobText || jobFile)
    );
  }

  createLoadingSpinner() {
    if (!document.getElementById("loadingSpinner")) {
      const spinner = document.createElement("div");
      spinner.id = "loadingSpinner";
      spinner.className = "spinner-overlay d-none";
      spinner.innerHTML = `
        <div class="spinner-content">
          <div class="spinner"></div>
          <p>Processing your request...</p>
        </div>
      `;
      document.body.appendChild(spinner);
    }
  }

  showLoading() {
    this.loadingCounter++;
    const spinner = document.getElementById("loadingSpinner");

    if (spinner) {
      spinner.classList.remove("d-none");
    }
  }

  hideLoading() {
    this.loadingCounter--;

    if (this.loadingCounter <= 0) {
      const spinner = document.getElementById("loadingSpinner");

      if (spinner) {
        spinner.classList.add("d-none");
      }

      this.loadingCounter = 0;
    }
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");

    toast.className = `toast align-items-center text-white bg-${type === "error" ? "danger" : type} border-0`;
    toast.setAttribute("role", "alert");

    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
      </div>
    `;

    container.appendChild(toast);

    new bootstrap.Toast(toast, { delay: 5000 }).show();

    setTimeout(() => toast.remove(), 5000);
  }

  async checkBackendHealth() {
    try {
      await fetch(`${this.API_BASE}/`);
      console.log("Backend connected");
    } catch {
      this.showToast("Cannot connect to backend", "error");
    }
  }

  async uploadFile(file) {
    const formData = new FormData();
    formData.append("resume", file);

    const response = await fetch(`${this.API_BASE}/api/parse-resume`, {
      method: "POST",
      headers: this.getGeminiHeaders(),
      body: formData,
    });

    const data = await response.json();

    if (!response.ok || !data.success)
      throw new Error(data.error || "Upload failed");

    return data;
  }

  async handleUpload() {
    const resumeFile = document.getElementById("resumeFile").files[0];
    const jobFile = document.getElementById("jobFile").files[0];
    const jobText = document.getElementById("jobText").value.trim();

    // Ask for the API key only when the user actually starts using AI.
    const hasApiKey = await this.ensureApiKey();

    if (!hasApiKey) {
      return;
    }

    this.showLoading();

    try {
      const parseData = await this.uploadFile(resumeFile);

      this.currentSessionId = parseData.session_id;
      this.parsedData = parseData.parsed;

      let jobContent = jobText;

      if (jobFile) {
        jobContent = `[Job description from file: ${jobFile.name}]`;
      }

      sessionStorage.setItem("jobDescription", jobContent);

      document.getElementById("parsedContent").innerHTML =
        `<pre class="mb-0">${JSON.stringify(parseData.parsed, null, 2)}</pre>`;

      document.getElementById("parsedPreview").classList.remove("d-none");

      document
        .getElementById("parsedPreview")
        .scrollIntoView({ behavior: "smooth" });

      this.showToast("Resume parsed successfully!", "success");
    } catch (error) {
      this.showToast(error.message, "error");
    } finally {
      this.hideLoading();
    }
  }

  editParsedData() {
    const content = document.getElementById("parsedContent").textContent;
    const textarea = document.createElement("textarea");

    textarea.className = "form-control";
    textarea.rows = 10;
    textarea.value = content;

    document.getElementById("parsedContent").innerHTML = "";
    document.getElementById("parsedContent").appendChild(textarea);
    document.getElementById("editParsedBtn").disabled = true;

    const saveBtn = document.createElement("button");

    saveBtn.className = "action-btn confirm-btn";
    saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>Save Changes';

    saveBtn.onclick = () => {
      try {
        this.parsedData = JSON.parse(textarea.value);

        document.getElementById("parsedContent").innerHTML =
          `<pre class="mb-0">${JSON.stringify(this.parsedData, null, 2)}</pre>`;

        document.getElementById("editParsedBtn").disabled = false;

        saveBtn.remove();

        this.showToast("Changes saved!", "success");
      } catch {
        this.showToast("Invalid JSON format", "error");
      }
    };

    document.querySelector(".preview-actions").appendChild(saveBtn);
  }

  confirmParsedData() {
    document.getElementById("parsedPreview").classList.add("d-none");
    document.getElementById("actionSection").classList.remove("d-none");

    document
      .getElementById("actionSection")
      .scrollIntoView({ behavior: "smooth" });

    this.showToast("Ready! Choose an action below.", "success");
  }

  async runEvaluation() {
    // Make sure a key exists before calling Gemini.
    const hasApiKey = await this.ensureApiKey();

    if (!hasApiKey) {
      return;
    }

    const jobText = sessionStorage.getItem("jobDescription");

    this.showLoading();

    try {
      const response = await fetch(`${this.API_BASE}/api/evaluate`, {
        method: "POST",
        headers: this.getGeminiHeaders(true),
        body: JSON.stringify({
          session_id: this.currentSessionId,
          job_text: jobText,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      this.displayEvaluationResults(data.evaluation);
    } catch (error) {
      this.showToast(error.message, "error");
    } finally {
      this.hideLoading();
    }
  }

  displayEvaluationResults(evaluation) {
    const resultsDiv = document.getElementById("evaluationResults");
    resultsDiv.classList.remove("d-none");

    const score = evaluation.match_score || 0;
    const matching = evaluation.matching_skills || [];
    const missing = evaluation.missing_skills || [];
    const strengths = evaluation.strengths || [];
    const weaknesses = evaluation.weaknesses || [];
    const recommendations = evaluation.recommendations || [];

    resultsDiv.innerHTML = `
      <div class="result-card" data-aos="fade-up">
        <div class="result-header">
          <i class="fas fa-clipboard-check"></i>
          <h3>Strict Evaluation Results</h3>
        </div>
        <div class="result-body">
          <div class="text-center mb-5">
            <div class="match-score">${score}%</div>
            <p class="text-muted">Overall Match</p>
            <div class="progress mx-auto" style="max-width: 300px;">
              <div class="progress-bar" style="width: ${score}%"></div>
            </div>
            ${evaluation.verdict ? `<p class="mt-2"><strong>Verdict:</strong> ${evaluation.verdict}</p>` : ""}
          </div>

          <div class="row mb-4">
            <div class="col-md-6">
              <h5 class="mb-3"><i class="fas fa-check-circle me-2" style="color: var(--accent-primary);"></i>Matching Skills</h5>
              ${
                matching.length
                  ? `<div class="d-flex flex-wrap gap-2">${matching.map((s) => `<span class="skill-tag">${s}</span>`).join("")}</div>`
                  : '<p class="text-muted">No matching skills identified</p>'
              }
            </div>
            <div class="col-md-6">
              <h5 class="mb-3"><i class="fas fa-exclamation-triangle me-2" style="color: var(--danger);"></i>Missing Skills</h5>
              ${
                missing.length
                  ? `<div class="d-flex flex-wrap gap-2">${missing.map((s) => `<span class="skill-tag missing">${s}</span>`).join("")}</div>`
                  : '<p class="text-muted">No missing skills identified</p>'
              }
            </div>
          </div>

          <div class="row">
            <div class="col-md-6">
              <h5 class="mb-3">✅ Strengths</h5>
              <ul class="list-unstyled">
                ${strengths.map((s) => `<li class="mb-2"><i class="fas fa-plus-circle me-2" style="color: var(--success);"></i>${s}</li>`).join("")}
              </ul>
            </div>
            <div class="col-md-6">
              <h5 class="mb-3">📈 Areas to Improve</h5>
              <ul class="list-unstyled">
                ${weaknesses.map((w) => `<li class="mb-2"><i class="fas fa-minus-circle me-2" style="color: var(--danger);"></i>${w}</li>`).join("")}
              </ul>
            </div>
          </div>

          <div class="mt-4">
            <h5 class="mb-3">📝 Recommendations</h5>
            <ul class="list-group">
              ${recommendations.map((r) => `<li class="list-group-item">${r}</li>`).join("")}
            </ul>
          </div>

          ${
            evaluation.reasoning
              ? `
            <div class="mt-4 p-3" style="background: var(--bg-tertiary); border-radius: 10px;">
              <p class="mb-0"><strong>Reasoning:</strong> ${evaluation.reasoning}</p>
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;

    resultsDiv.scrollIntoView({ behavior: "smooth" });
  }

  async runTailoring() {
    // Make sure a key exists before calling Gemini.
    const hasApiKey = await this.ensureApiKey();

    if (!hasApiKey) {
      return;
    }

    const jobText = sessionStorage.getItem("jobDescription");

    this.showLoading();

    try {
      const response = await fetch(`${this.API_BASE}/api/tailor`, {
        method: "POST",
        headers: this.getGeminiHeaders(true),
        body: JSON.stringify({
          session_id: this.currentSessionId,
          job_text: jobText,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      this.displayTailoringResults(data.suggestions);
    } catch (error) {
      this.showToast(error.message, "error");
    } finally {
      this.hideLoading();
    }
  }

  displayTailoringResults(suggestions) {
    const resultsDiv = document.getElementById("tailoringResults");
    const contentDiv = document.getElementById("tailoringContent");

    resultsDiv.classList.remove("d-none");

    if (typeof suggestions === "object") {
      let html = '<div class="tailoring-suggestions">';

      const sections = [
        {
          key: "summary_section",
          title: "📝 Summary Section",
          icon: "fa-pen",
        },
        {
          key: "experience_section",
          title: "💼 Experience Section",
          icon: "fa-briefcase",
        },
        {
          key: "projects_section",
          title: "🚀 Projects Section",
          icon: "fa-code",
        },
        {
          key: "skills_section",
          title: "🔧 Skills Section",
          icon: "fa-tools",
        },
        {
          key: "volunteering_section",
          title: "🤝 Volunteering Section",
          icon: "fa-heart",
        },
        {
          key: "general_tips",
          title: "💡 General Tips",
          icon: "fa-lightbulb",
        },
      ];

      sections.forEach((section) => {
        if (suggestions[section.key]?.length) {
          html += `<h5 class="mt-4 mb-3"><i class="fas ${section.icon} me-2" style="color: var(--accent-primary);"></i>${section.title}</h5>`;

          suggestions[section.key].forEach((item) => {
            if (typeof item === "object" && item.suggestion) {
              html += `
                <div class="card mb-3" style="background: var(--bg-tertiary); border: 1px solid var(--border-color);">
                  <div class="card-body">
                    <p class="mb-2"><strong>${item.suggestion}</strong></p>
                    ${item.reason ? `<p class="mb-0 text-muted"><small>✨ ${item.reason}</small></p>` : ""}
                  </div>
                </div>
              `;
            } else if (typeof item === "string") {
              html += `<div class="card mb-3"><div class="card-body">${item}</div></div>`;
            }
          });
        }
      });

      html += "</div>";
      contentDiv.innerHTML = html;
    } else {
      contentDiv.innerHTML = `<pre class="bg-light p-3 rounded">${suggestions}</pre>`;
    }

    resultsDiv.scrollIntoView({ behavior: "smooth" });

    this.showToast("Tailoring suggestions generated!", "success");
  }

  async startInterview() {
    if (!this.currentSessionId) {
      this.showToast("Please upload and parse your resume first", "error");
      return;
    }

    // Make sure a key exists before opening the Gemini-powered WebSocket.
    const hasApiKey = await this.ensureApiKey();

    if (!hasApiKey) {
      return;
    }

    document.getElementById("actionSection").classList.add("d-none");
    document.getElementById("interviewSection").classList.remove("d-none");
    document.getElementById("interviewTranscript").innerHTML = "";
    document.getElementById("interviewInput").value = "";
    document.getElementById("interviewInput").disabled = false;
    document.getElementById("sendMessageBtn").disabled = false;
    document.getElementById("interviewInput").focus();

    // Hide new interview button, show end interview button
    document.getElementById("newInterviewBtn").classList.add("d-none");
    document.getElementById("endInterviewBtn").classList.remove("d-none");

    this.interviewActive = true;

    this.websocket = new WebSocket(
      `${this.WS_BASE}/ws/interview/${this.currentSessionId}`,
    );

    this.websocket.onopen = () => {
      console.log("WebSocket connected");

      // Send the user's Gemini API key as the first WebSocket message.
      // The key is NOT included in the WebSocket URL.
      this.websocket.send(
        JSON.stringify({
          type: "auth",
          api_key: this.geminiApiKey,
        }),
      );

      this.addMessage(
        "system",
        "Interview started. Type your responses below.",
      );
    };

    this.websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "question") {
        this.addMessage("ai", data.data);
        this.hideTypingIndicator();
      } else if (data.type === "message") {
        this.addMessage("system", data.data);
      } else if (data.type === "prompt") {
        this.addMessage("system", data.data);
      } else if (data.type === "review") {
        this.hideLoading();
        this.displayInterviewReview(data.data);
        this.disableInterviewInput();
      } else if (data.type === "connected") {
        this.addMessage("system", data.data);
      } else if (data.type === "typing") {
        this.showTypingIndicator();
      } else if (data.type === "stop_typing") {
        this.hideTypingIndicator();
      } else if (data.type === "processing_review") {
        this.addMessage("system", "📊 Analyzing your interview performance...");
        this.showLoading();
      } else if (data.type === "error") {
        this.showToast(data.data || "Interview error", "error");
        this.disableInterviewInput();
      }
    };

    this.websocket.onerror = () => {
      this.showToast("Connection error", "error");
    };

    this.websocket.onclose = (event) => {
      console.log("WebSocket closed", event.code, event.reason);
      this.hideTypingIndicator();
      this.hideLoading();
      this.interviewActive = false;
    };
  }

  disableInterviewInput() {
    // Disable input and send button
    document.getElementById("interviewInput").disabled = true;
    document.getElementById("sendMessageBtn").disabled = true;

    // Hide end interview button, show new interview button
    document.getElementById("endInterviewBtn").classList.add("d-none");
    document.getElementById("newInterviewBtn").classList.remove("d-none");

    this.interviewActive = false;
  }

  showTypingIndicator() {
    const indicator = document.getElementById("typingIndicator");

    if (indicator) {
      indicator.classList.remove("d-none");
    }
  }

  hideTypingIndicator() {
    const indicator = document.getElementById("typingIndicator");

    if (indicator) {
      indicator.classList.add("d-none");
    }
  }

  sendMessage() {
    if (!this.interviewActive) return;

    const input = document.getElementById("interviewInput");
    const message = input.value.trim();

    if (
      !message ||
      !this.websocket ||
      this.websocket.readyState !== WebSocket.OPEN
    )
      return;

    this.websocket.send(
      JSON.stringify({
        type: "answer",
        data: message,
      }),
    );

    this.addMessage("user", message);
    input.value = "";
  }

  addMessage(sender, text) {
    const transcript = document.getElementById("interviewTranscript");
    const time = new Date().toLocaleTimeString();
    const div = document.createElement("div");

    div.className = `message ${sender}`;

    div.innerHTML = `
      <small class="text-muted">${time}</small><br>
      <strong>${sender === "ai" ? "🤖 Interviewer" : sender === "user" ? "👤 You" : "🔧 System"}:</strong>
      <p class="mb-0 mt-1">${text}</p>
    `;

    transcript.appendChild(div);
    transcript.scrollTop = transcript.scrollHeight;
  }

  displayInterviewReview(review) {
    try {
      const data = typeof review === "string" ? JSON.parse(review) : review;

      // Determine hiring outcome based on score
      let hiringOutcome = "";
      let outcomeClass = "";

      if (data.overall_score >= 85) {
        hiringOutcome = "✅ STRONG HIRE - Excellent performance!";
        outcomeClass = "text-success";
      } else if (data.overall_score >= 70) {
        hiringOutcome =
          "👍 HIRE - Good performance with minor improvements needed";
        outcomeClass = "text-primary";
      } else if (data.overall_score >= 50) {
        hiringOutcome = "🤔 CONSIDER - Some strengths but significant gaps";
        outcomeClass = "text-warning";
      } else {
        hiringOutcome = "❌ PASS - Not ready for this position";
        outcomeClass = "text-danger";
      }

      let html = `
        <div class="review-card">
          <h5 class="mb-4">📊 Interview Review</h5>
          
          <div class="text-center mb-4">
            <div class="score-badge">${data.overall_score}</div>
            <p class="mt-2 ${outcomeClass} fw-bold">${data.hiring_verdict || hiringOutcome}</p>
          </div>
      `;

      if (data.strengths?.length) {
        html += `
          <h6 class="mb-3">✅ What You Did Well</h6>
          <ul class="mb-4">
            ${data.strengths.map((s) => `<li class="mb-2">${s}</li>`).join("")}
          </ul>
        `;
      }

      if (data.weaknesses?.length) {
        html += `
          <h6 class="mb-3">📈 What Went Wrong</h6>
          <ul class="mb-4">
            ${data.weaknesses.map((w) => `<li class="mb-2">${w}</li>`).join("")}
          </ul>
        `;
      }

      if (data.key_mistakes?.length) {
        html += `
          <h6 class="mb-3">⚠️ Critical Mistakes</h6>
          <ul class="mb-4">
            ${data.key_mistakes.map((m) => `<li class="mb-2">${m}</li>`).join("")}
          </ul>
        `;
      }

      if (data.better_answers?.length) {
        html += '<h6 class="mb-3">💡 How You Should Have Answered</h6>';

        data.better_answers.forEach((a, index) => {
          html += `
            <div class="better-answer mb-3">
              <p class="mb-2"><strong>Question ${index + 1}:</strong> ${a.question}</p>
              <p class="mb-2"><strong>Your answer:</strong> <span class="text-muted">${a.their_answer}</span></p>
              <p class="mb-0"><strong>Better answer:</strong> <span style="color: var(--accent-primary);">${a.better_answer}</span></p>
            </div>
          `;
        });
      }

      if (data.tips?.length) {
        html += `
          <h6 class="mb-3 mt-4">💡 Tips for Next Time</h6>
          <ul>
            ${data.tips.map((t) => `<li class="mb-2">${t}</li>`).join("")}
          </ul>
        `;
      }

      if (data.reasoning) {
        html += `
          <div class="mt-4 p-3" style="background: var(--bg-tertiary); border-radius: 10px;">
            <p class="mb-0"><strong>Overall Assessment:</strong> ${data.reasoning}</p>
          </div>
        `;
      }

      html += "</div>";

      const transcript = document.getElementById("interviewTranscript");
      const reviewDiv = document.createElement("div");

      reviewDiv.innerHTML = html;

      transcript.appendChild(reviewDiv);
      transcript.scrollTop = transcript.scrollHeight;
    } catch (error) {
      console.error("Error parsing review:", error);

      document.getElementById("interviewTranscript").innerHTML +=
        `<div class="review-card">${review}</div>`;
    } finally {
      this.hideLoading();
    }
  }

  endInterview() {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ type: "end" }));

      this.addMessage(
        "system",
        "Ending interview. Analyzing your responses...",
      );

      this.showLoading();

      document.getElementById("interviewInput").disabled = true;
      document.getElementById("sendMessageBtn").disabled = true;
    } else {
      this.returnToActionSection();
    }

    this.hideTypingIndicator();
  }

  startNewInterview() {
    document.getElementById("interviewTranscript").innerHTML = "";
    document.getElementById("interviewInput").value = "";
    document.getElementById("interviewInput").disabled = false;
    document.getElementById("sendMessageBtn").disabled = false;

    document.getElementById("endInterviewBtn").classList.remove("d-none");
    document.getElementById("newInterviewBtn").classList.add("d-none");

    this.startInterview();
  }

  returnToActionSection() {
    document.getElementById("interviewSection").classList.add("d-none");
    document.getElementById("actionSection").classList.remove("d-none");
  }
}

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  window.app = new ResumeMasterApp();
});
