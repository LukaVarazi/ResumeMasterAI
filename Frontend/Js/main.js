// Frontend/Js/main.js
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
    this.interviewActive = false;

    // Gemini API key is kept only in JavaScript memory.
    // It is NOT stored in localStorage, sessionStorage, cookies, or the server.
    this.geminiApiKey = null;

    this.init();

    // Clear the key when the page is refreshed or closed.
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
        document.getElementById("resumeFile")?.click();
      });

    document.getElementById("selectJobBtn")?.addEventListener("click", () => {
      document.getElementById("jobFile")?.click();
    });

    // Resume file selection
    document.getElementById("resumeFile")?.addEventListener("change", (e) => {
      document.getElementById("resumeFileName").textContent =
        e.target.files[0]?.name || "";

      this.animateUploadCard("resumeCard");
      this.validateUploadForm();
    });

    // Job file selection
    document.getElementById("jobFile")?.addEventListener("change", (e) => {
      document.getElementById("jobFileName").textContent =
        e.target.files[0]?.name || "";

      this.animateUploadCard("jobCard");
      this.validateUploadForm();
    });

    // Job description text input
    document.getElementById("jobText")?.addEventListener("input", () => {
      this.validateUploadForm();
    });

    // Upload form
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

    // AI actions
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

    // Interview controls
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

    // API key controls
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

    document
      .getElementById("toggleApiKeyVisibility")
      ?.addEventListener("click", () => {
        const input = document.getElementById("apiKeyInput");
        const button = document.getElementById("toggleApiKeyVisibility");

        if (!input || !button) return;

        const visible = input.type === "text";

        input.type = visible ? "password" : "text";

        button.innerHTML = visible
          ? '<i class="fas fa-eye"></i>'
          : '<i class="fas fa-eye-slash"></i>';

        button.setAttribute(
          "aria-label",
          visible ? "Show API key" : "Hide API key",
        );
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
  // SECURITY / HELPERS
  // ============================================================

  escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ============================================================
  // GEMINI API KEY
  // ============================================================

  ensureApiKey() {
    const input = document.getElementById("apiKeyInput");
    const key = input?.value.trim();

    if (!key && !this.geminiApiKey) {
      this.updateApiKeyStatus(false);

      this.showToast("Please enter your Gemini API key first.", "error");

      input?.focus();

      return false;
    }

    if (key) {
      this.geminiApiKey = key;
    }

    this.updateApiKeyStatus(true);

    return true;
  }

  saveApiKey() {
    const input = document.getElementById("apiKeyInput");
    const key = input?.value.trim();

    if (!key) {
      this.updateApiKeyStatus(false);

      this.showToast("Please enter your Gemini API key.", "error");

      input?.focus();

      return;
    }

    // Store only in JavaScript memory.
    this.geminiApiKey = key;

    this.updateApiKeyStatus(true);

    this.showToast("Gemini API key is ready for this session.", "success");
  }

  updateApiKeyStatus(isSet) {
    const status = document.getElementById("apiKeyStatus");

    if (!status) return;

    status.textContent = isSet ? "Key ready" : "Not set";

    status.classList.toggle("is-set", isSet);
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

  // ============================================================
  // UI / FILE HANDLING
  // ============================================================

  animateUploadCard(cardId) {
    const card = document.getElementById(cardId);

    if (!card) return;

    card.style.transform = "scale(0.95)";

    setTimeout(() => {
      card.style.transform = "scale(1)";
    }, 200);
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

        if (!file) return;

        if (id === "resumeCard") {
          const input = document.getElementById("resumeFile");

          input.files = e.dataTransfer.files;

          document.getElementById("resumeFileName").textContent = file.name;
        } else {
          const input = document.getElementById("jobFile");

          input.files = e.dataTransfer.files;

          document.getElementById("jobFileName").textContent = file.name;
        }

        this.validateUploadForm();
      });
    });
  }

  validateUploadForm() {
    const resumeInput = document.getElementById("resumeFile");
    const jobInput = document.getElementById("jobFile");
    const jobTextInput = document.getElementById("jobText");
    const processButton = document.getElementById("processBtn");

    if (!resumeInput || !jobInput || !jobTextInput || !processButton) {
      return;
    }

    const resumeFile = resumeInput.files[0];
    const jobFile = jobInput.files[0];
    const jobText = jobTextInput.value.trim();

    processButton.disabled = !(resumeFile && (jobText || jobFile));
  }

  createLoadingSpinner() {
    if (document.getElementById("loadingSpinner")) {
      return;
    }

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

    if (!container) {
      console.warn(message);
      return;
    }

    const toast = document.createElement("div");

    toast.className = `toast align-items-center text-white bg-${
      type === "error" ? "danger" : type
    } border-0`;

    toast.setAttribute("role", "alert");

    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body"></div>

        <button
          type="button"
          class="btn-close btn-close-white"
          data-bs-dismiss="toast"
          aria-label="Close"
        ></button>
      </div>
    `;

    // Use textContent so arbitrary API/server errors cannot inject HTML.
    toast.querySelector(".toast-body").textContent = message;

    container.appendChild(toast);

    if (typeof bootstrap !== "undefined") {
      new bootstrap.Toast(toast, {
        delay: 5000,
      }).show();
    }

    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  // ============================================================
  // BACKEND
  // ============================================================

  async checkBackendHealth() {
    try {
      const response = await fetch(`${this.API_BASE}/`);

      if (!response.ok) {
        throw new Error("Backend unavailable");
      }

      console.log("Backend connected");
    } catch {
      this.showToast(
        "Cannot connect to backend. Make sure the FastAPI server is running.",
        "error",
      );
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

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Resume upload failed.");
    }

    return data;
  }

  async extractJobDescription(file) {
    const formData = new FormData();

    formData.append("job_file", file);

    const response = await fetch(
      `${this.API_BASE}/api/extract-job-description`,
      {
        method: "POST",
        body: formData,
      },
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Could not extract the job description.");
    }

    return data.text;
  }

  // ============================================================
  // RESUME / JOB PROCESSING
  // ============================================================

  async handleUpload() {
    const resumeFile = document.getElementById("resumeFile")?.files[0];

    const jobFile = document.getElementById("jobFile")?.files[0];

    const jobText = document.getElementById("jobText")?.value.trim() || "";

    if (!resumeFile) {
      this.showToast("Please select a resume first.", "error");

      return;
    }

    if (!jobText && !jobFile) {
      this.showToast("Please provide a job description.", "error");

      return;
    }

    const hasApiKey = this.ensureApiKey();

    if (!hasApiKey) {
      return;
    }

    this.showLoading();

    try {
      // Parse resume.
      const parseData = await this.uploadFile(resumeFile);

      this.currentSessionId = parseData.session_id;
      this.parsedData = parseData.parsed;

      // Get actual job description text.
      let jobContent = jobText;

      if (jobFile) {
        jobContent = await this.extractJobDescription(jobFile);
      }

      if (!jobContent?.trim()) {
        throw new Error("The job description could not be extracted.");
      }

      // Store job description for Match Analysis,
      // Resume Optimization, and Mock Interview.
      //
      // The Gemini API key is NOT stored here.
      sessionStorage.setItem("jobDescription", jobContent);

      const parsedContent = document.getElementById("parsedContent");

      if (parsedContent) {
        const pre = document.createElement("pre");

        pre.className = "mb-0";
        pre.textContent = JSON.stringify(parseData.parsed, null, 2);

        parsedContent.replaceChildren(pre);
      }

      document.getElementById("parsedPreview")?.classList.remove("d-none");

      document.getElementById("parsedPreview")?.scrollIntoView({
        behavior: "smooth",
      });

      this.showToast("Resume parsed successfully!", "success");
    } catch (error) {
      this.showToast(
        error.message || "Something went wrong while processing your files.",
        "error",
      );
    } finally {
      this.hideLoading();
    }
  }

  editParsedData() {
    const content = document.getElementById("parsedContent")?.textContent || "";

    const container = document.getElementById("parsedContent");

    const editButton = document.getElementById("editParsedBtn");

    if (!container || !editButton) return;

    const textarea = document.createElement("textarea");

    textarea.className = "form-control";
    textarea.rows = 10;
    textarea.value = content;

    container.replaceChildren(textarea);

    editButton.disabled = true;

    const saveButton = document.createElement("button");

    saveButton.className = "action-btn confirm-btn";

    saveButton.innerHTML = '<i class="fas fa-save me-2"></i>Save Changes';

    saveButton.addEventListener("click", () => {
      try {
        this.parsedData = JSON.parse(textarea.value);

        const pre = document.createElement("pre");

        pre.className = "mb-0";
        pre.textContent = JSON.stringify(this.parsedData, null, 2);

        container.replaceChildren(pre);

        editButton.disabled = false;

        saveButton.remove();

        this.showToast("Changes saved!", "success");
      } catch {
        this.showToast("Invalid JSON format.", "error");
      }
    });

    document.querySelector(".preview-actions")?.appendChild(saveButton);
  }

  confirmParsedData() {
    document.getElementById("parsedPreview")?.classList.add("d-none");

    document.getElementById("actionSection")?.classList.remove("d-none");

    document.getElementById("actionSection")?.scrollIntoView({
      behavior: "smooth",
    });

    this.showToast("Ready! Choose an action below.", "success");
  }

  // ============================================================
  // MATCH ANALYSIS
  // ============================================================

  async runEvaluation() {
    const hasApiKey = this.ensureApiKey();

    if (!hasApiKey) {
      return;
    }

    if (!this.currentSessionId) {
      this.showToast("Please upload and parse your resume first.", "error");

      return;
    }

    const jobText = sessionStorage.getItem("jobDescription");

    if (!jobText) {
      this.showToast("Please provide a job description first.", "error");

      return;
    }

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

      if (!response.ok) {
        throw new Error(data.error || "Evaluation failed.");
      }

      this.displayEvaluationResults(data.evaluation);
    } catch (error) {
      this.showToast(error.message || "Could not analyze the resume.", "error");
    } finally {
      this.hideLoading();
    }
  }

  displayEvaluationResults(evaluation) {
    const resultsDiv = document.getElementById("evaluationResults");

    if (!resultsDiv) return;

    resultsDiv.classList.remove("d-none");

    const score = Number(evaluation?.match_score || 0);

    const matching = Array.isArray(evaluation?.matching_skills)
      ? evaluation.matching_skills
      : [];

    const missing = Array.isArray(evaluation?.missing_skills)
      ? evaluation.missing_skills
      : [];

    const strengths = Array.isArray(evaluation?.strengths)
      ? evaluation.strengths
      : [];

    const weaknesses = Array.isArray(evaluation?.weaknesses)
      ? evaluation.weaknesses
      : [];

    const recommendations = Array.isArray(evaluation?.recommendations)
      ? evaluation.recommendations
      : [];

    const safeScore = Math.min(100, Math.max(0, score));

    resultsDiv.innerHTML = `
      <div class="result-card" data-aos="fade-up">
        <div class="result-header">
          <i class="fas fa-clipboard-check"></i>
          <h3>Strict Evaluation Results</h3>
        </div>

        <div class="result-body">
          <div class="text-center mb-5">
            <div class="match-score">
              ${safeScore}%
            </div>

            <p class="text-muted">
              Overall Match
            </p>

            <div
              class="progress mx-auto"
              style="max-width: 300px;"
            >
              <div
                class="progress-bar"
                style="width: ${safeScore}%"
              ></div>
            </div>

            ${
              evaluation?.verdict
                ? `
                  <p class="mt-2">
                    <strong>Verdict:</strong>
                    ${this.escapeHTML(evaluation.verdict)}
                  </p>
                `
                : ""
            }
          </div>

          <div class="row mb-4">
            <div class="col-md-6">
              <h5 class="mb-3">
                <i
                  class="fas fa-check-circle me-2"
                  style="color: var(--accent-primary);"
                ></i>
                Matching Skills
              </h5>

              ${
                matching.length
                  ? `
                    <div class="d-flex flex-wrap gap-2">
                      ${matching
                        .map(
                          (skill) =>
                            `<span class="skill-tag">${this.escapeHTML(
                              skill,
                            )}</span>`,
                        )
                        .join("")}
                    </div>
                  `
                  : `
                    <p class="text-muted">
                      No matching skills identified
                    </p>
                  `
              }
            </div>

            <div class="col-md-6">
              <h5 class="mb-3">
                <i
                  class="fas fa-exclamation-triangle me-2"
                  style="color: var(--danger);"
                ></i>
                Missing Skills
              </h5>

              ${
                missing.length
                  ? `
                    <div class="d-flex flex-wrap gap-2">
                      ${missing
                        .map(
                          (skill) =>
                            `<span class="skill-tag missing">${this.escapeHTML(
                              skill,
                            )}</span>`,
                        )
                        .join("")}
                    </div>
                  `
                  : `
                    <p class="text-muted">
                      No missing skills identified
                    </p>
                  `
              }
            </div>
          </div>

          <div class="row">
            <div class="col-md-6">
              <h5 class="mb-3">
                ✅ Strengths
              </h5>

              <ul class="list-unstyled">
                ${
                  strengths.length
                    ? strengths
                        .map(
                          (strength) =>
                            `<li class="mb-2">
                              <i
                                class="fas fa-plus-circle me-2"
                                style="color: var(--success);"
                              ></i>
                              ${this.escapeHTML(strength)}
                            </li>`,
                        )
                        .join("")
                    : `
                      <li class="text-muted">
                        No specific strengths identified.
                      </li>
                    `
                }
              </ul>
            </div>

            <div class="col-md-6">
              <h5 class="mb-3">
                📈 Areas to Improve
              </h5>

              <ul class="list-unstyled">
                ${
                  weaknesses.length
                    ? weaknesses
                        .map(
                          (weakness) =>
                            `<li class="mb-2">
                              <i
                                class="fas fa-minus-circle me-2"
                                style="color: var(--danger);"
                              ></i>
                              ${this.escapeHTML(weakness)}
                            </li>`,
                        )
                        .join("")
                    : `
                      <li class="text-muted">
                        No specific weaknesses identified.
                      </li>
                    `
                }
              </ul>
            </div>
          </div>

          <div class="mt-4">
            <h5 class="mb-3">
              📝 Recommendations
            </h5>

            <ul class="list-group">
              ${
                recommendations.length
                  ? recommendations
                      .map(
                        (recommendation) =>
                          `<li class="list-group-item">
                            ${this.escapeHTML(recommendation)}
                          </li>`,
                      )
                      .join("")
                  : `
                    <li class="list-group-item">
                      No recommendations provided.
                    </li>
                  `
              }
            </ul>
          </div>

          ${
            evaluation?.reasoning
              ? `
                <div
                  class="mt-4 p-3"
                  style="
                    background: var(--bg-tertiary);
                    border-radius: 10px;
                  "
                >
                  <p class="mb-0">
                    <strong>Reasoning:</strong>
                    ${this.escapeHTML(evaluation.reasoning)}
                  </p>
                </div>
              `
              : ""
          }
        </div>
      </div>
    `;

    resultsDiv.scrollIntoView({
      behavior: "smooth",
    });
  }

  // ============================================================
  // RESUME OPTIMIZATION
  // ============================================================

  async runTailoring() {
    const hasApiKey = this.ensureApiKey();

    if (!hasApiKey) {
      return;
    }

    if (!this.currentSessionId) {
      this.showToast("Please upload and parse your resume first.", "error");

      return;
    }

    const jobText = sessionStorage.getItem("jobDescription");

    if (!jobText) {
      this.showToast("Please provide a job description first.", "error");

      return;
    }

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

      if (!response.ok) {
        throw new Error(data.error || "Resume optimization failed.");
      }

      this.displayTailoringResults(data.suggestions);
    } catch (error) {
      this.showToast(
        error.message || "Could not generate resume optimization suggestions.",
        "error",
      );
    } finally {
      this.hideLoading();
    }
  }

  displayTailoringResults(suggestions) {
    const resultsDiv = document.getElementById("tailoringResults");

    const contentDiv = document.getElementById("tailoringContent");

    if (!resultsDiv || !contentDiv) return;

    resultsDiv.classList.remove("d-none");

    if (
      suggestions &&
      typeof suggestions === "object" &&
      !Array.isArray(suggestions)
    ) {
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
        const items = suggestions[section.key];

        if (!Array.isArray(items) || !items.length) {
          return;
        }

        html += `
          <h5 class="mt-4 mb-3">
            <i
              class="fas ${section.icon} me-2"
              style="color: var(--accent-primary);"
            ></i>
            ${section.title}
          </h5>
        `;

        items.forEach((item) => {
          if (item && typeof item === "object" && item.suggestion) {
            html += `
              <div
                class="card mb-3"
                style="
                  background: var(--bg-tertiary);
                  border: 1px solid var(--border-color);
                "
              >
                <div class="card-body">
                  <p class="mb-2">
                    <strong>
                      ${this.escapeHTML(item.suggestion)}
                    </strong>
                  </p>

                  ${
                    item.reason
                      ? `
                        <p class="mb-0 text-muted">
                          <small>
                            ✨
                            ${this.escapeHTML(item.reason)}
                          </small>
                        </p>
                      `
                      : ""
                  }
                </div>
              </div>
            `;
          } else if (typeof item === "string") {
            html += `
              <div class="card mb-3">
                <div class="card-body">
                  ${this.escapeHTML(item)}
                </div>
              </div>
            `;
          }
        });
      });

      html += "</div>";

      contentDiv.innerHTML = html;
    } else {
      const pre = document.createElement("pre");

      pre.className = "bg-light p-3 rounded";

      pre.textContent =
        typeof suggestions === "string"
          ? suggestions
          : JSON.stringify(suggestions, null, 2);

      contentDiv.replaceChildren(pre);
    }

    resultsDiv.scrollIntoView({
      behavior: "smooth",
    });

    this.showToast("Resume optimization suggestions generated!", "success");
  }

  // ============================================================
  // MOCK INTERVIEW
  // ============================================================

  async startInterview() {
    if (!this.currentSessionId) {
      this.showToast("Please upload and parse your resume first.", "error");

      return;
    }

    const jobText = sessionStorage.getItem("jobDescription");

    if (!jobText) {
      this.showToast("Please provide a job description first.", "error");

      return;
    }

    const hasApiKey = this.ensureApiKey();

    if (!hasApiKey) {
      return;
    }

    document.getElementById("actionSection")?.classList.add("d-none");

    document.getElementById("interviewSection")?.classList.remove("d-none");

    const transcript = document.getElementById("interviewTranscript");

    const input = document.getElementById("interviewInput");

    const sendButton = document.getElementById("sendMessageBtn");

    transcript?.replaceChildren();

    if (input) {
      input.value = "";
      input.disabled = false;
      input.focus();
    }

    if (sendButton) {
      sendButton.disabled = false;
    }

    document.getElementById("newInterviewBtn")?.classList.add("d-none");

    document.getElementById("endInterviewBtn")?.classList.remove("d-none");

    this.interviewActive = true;

    // Close any previous WebSocket first.
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.close();
    }

    this.websocket = new WebSocket(
      `${this.WS_BASE}/ws/interview/${this.currentSessionId}`,
    );

    this.websocket.onopen = () => {
      console.log("WebSocket connected");

      // API key is sent as the first WebSocket message.
      // It is NOT included in the URL.
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
      try {
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
          this.addMessage(
            "system",
            "📊 Analyzing your interview performance...",
          );

          this.showLoading();
        } else if (data.type === "error") {
          this.showToast(data.data || "Interview error.", "error");

          this.disableInterviewInput();
        }
      } catch (error) {
        console.error("Invalid WebSocket message:", error);

        this.showToast(
          "Received an invalid response from the interview server.",
          "error",
        );
      }
    };

    this.websocket.onerror = () => {
      this.showToast("Interview connection error.", "error");
    };

    this.websocket.onclose = (event) => {
      console.log("WebSocket closed", event.code, event.reason);

      this.hideTypingIndicator();
      this.hideLoading();

      this.interviewActive = false;
    };
  }

  disableInterviewInput() {
    const input = document.getElementById("interviewInput");

    const sendButton = document.getElementById("sendMessageBtn");

    input && (input.disabled = true);
    sendButton && (sendButton.disabled = true);

    document.getElementById("endInterviewBtn")?.classList.add("d-none");

    document.getElementById("newInterviewBtn")?.classList.remove("d-none");

    this.interviewActive = false;
  }

  showTypingIndicator() {
    document.getElementById("typingIndicator")?.classList.remove("d-none");
  }

  hideTypingIndicator() {
    document.getElementById("typingIndicator")?.classList.add("d-none");
  }

  sendMessage() {
    if (!this.interviewActive) return;

    const input = document.getElementById("interviewInput");

    if (!input) return;

    const message = input.value.trim();

    if (
      !message ||
      !this.websocket ||
      this.websocket.readyState !== WebSocket.OPEN
    ) {
      return;
    }

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

    if (!transcript) return;

    const time = new Date().toLocaleTimeString();

    const div = document.createElement("div");

    div.className = `message ${sender}`;

    const senderName =
      sender === "ai"
        ? "🤖 Interviewer"
        : sender === "user"
          ? "👤 You"
          : "🔧 System";

    div.innerHTML = `
      <small class="text-muted">
        ${this.escapeHTML(time)}
      </small>
      <br>

      <strong>
        ${senderName}:
      </strong>

      <p class="mb-0 mt-1"></p>
    `;

    // Never inject interview content directly into HTML.
    div.querySelector("p").textContent = String(text ?? "");

    transcript.appendChild(div);

    transcript.scrollTop = transcript.scrollHeight;
  }

  displayInterviewReview(review) {
    try {
      const data = typeof review === "string" ? JSON.parse(review) : review;

      const score = Number(data?.overall_score || 0);

      let hiringOutcome = "";
      let outcomeClass = "";

      if (score >= 85) {
        hiringOutcome = "✅ STRONG HIRE - Excellent performance!";

        outcomeClass = "text-success";
      } else if (score >= 70) {
        hiringOutcome =
          "👍 HIRE - Good performance with minor improvements needed";

        outcomeClass = "text-primary";
      } else if (score >= 50) {
        hiringOutcome = "🤔 CONSIDER - Some strengths but significant gaps";

        outcomeClass = "text-warning";
      } else {
        hiringOutcome = "❌ PASS - Not ready for this position";

        outcomeClass = "text-danger";
      }

      const safeScore = Math.min(100, Math.max(0, score));

      let html = `
        <div class="review-card">
          <h5 class="mb-4">
            📊 Interview Review
          </h5>

          <div class="text-center mb-4">
            <div class="score-badge">
              ${safeScore}
            </div>

            <p class="mt-2 ${outcomeClass} fw-bold">
              ${
                data?.hiring_verdict
                  ? this.escapeHTML(data.hiring_verdict)
                  : hiringOutcome
              }
            </p>
          </div>
      `;

      if (Array.isArray(data?.strengths) && data.strengths.length) {
        html += `
          <h6 class="mb-3">
            ✅ What You Did Well
          </h6>

          <ul class="mb-4">
            ${data.strengths
              .map(
                (strength) =>
                  `<li class="mb-2">
                    ${this.escapeHTML(strength)}
                  </li>`,
              )
              .join("")}
          </ul>
        `;
      }

      if (Array.isArray(data?.weaknesses) && data.weaknesses.length) {
        html += `
          <h6 class="mb-3">
            📈 What Went Wrong
          </h6>

          <ul class="mb-4">
            ${data.weaknesses
              .map(
                (weakness) =>
                  `<li class="mb-2">
                    ${this.escapeHTML(weakness)}
                  </li>`,
              )
              .join("")}
          </ul>
        `;
      }

      if (Array.isArray(data?.key_mistakes) && data.key_mistakes.length) {
        html += `
          <h6 class="mb-3">
            ⚠️ Critical Mistakes
          </h6>

          <ul class="mb-4">
            ${data.key_mistakes
              .map(
                (mistake) =>
                  `<li class="mb-2">
                    ${this.escapeHTML(mistake)}
                  </li>`,
              )
              .join("")}
          </ul>
        `;
      }

      if (Array.isArray(data?.better_answers) && data.better_answers.length) {
        html += `
          <h6 class="mb-3">
            💡 How You Should Have Answered
          </h6>
        `;

        data.better_answers.forEach((answer, index) => {
          html += `
              <div class="better-answer mb-3">
                <p class="mb-2">
                  <strong>
                    Question ${index + 1}:
                  </strong>

                  ${this.escapeHTML(answer?.question)}
                </p>

                <p class="mb-2">
                  <strong>
                    Your answer:
                  </strong>

                  <span class="text-muted">
                    ${this.escapeHTML(answer?.their_answer)}
                  </span>
                </p>

                <p class="mb-0">
                  <strong>
                    Better answer:
                  </strong>

                  <span
                    style="color: var(--accent-primary);"
                  >
                    ${this.escapeHTML(answer?.better_answer)}
                  </span>
                </p>
              </div>
            `;
        });
      }

      if (Array.isArray(data?.tips) && data.tips.length) {
        html += `
          <h6 class="mb-3 mt-4">
            💡 Tips for Next Time
          </h6>

          <ul>
            ${data.tips
              .map(
                (tip) =>
                  `<li class="mb-2">
                    ${this.escapeHTML(tip)}
                  </li>`,
              )
              .join("")}
          </ul>
        `;
      }

      if (data?.reasoning) {
        html += `
          <div
            class="mt-4 p-3"
            style="
              background: var(--bg-tertiary);
              border-radius: 10px;
            "
          >
            <p class="mb-0">
              <strong>
                Overall Assessment:
              </strong>

              ${this.escapeHTML(data.reasoning)}
            </p>
          </div>
        `;
      }

      html += "</div>";

      const transcript = document.getElementById("interviewTranscript");

      if (!transcript) return;

      const reviewDiv = document.createElement("div");

      reviewDiv.innerHTML = html;

      transcript.appendChild(reviewDiv);

      transcript.scrollTop = transcript.scrollHeight;
    } catch (error) {
      console.error("Error parsing interview review:", error);

      const transcript = document.getElementById("interviewTranscript");

      if (!transcript) return;

      const reviewDiv = document.createElement("div");

      reviewDiv.className = "review-card";

      reviewDiv.textContent =
        typeof review === "string" ? review : JSON.stringify(review, null, 2);

      transcript.appendChild(reviewDiv);
    } finally {
      this.hideLoading();
    }
  }

  endInterview() {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(
        JSON.stringify({
          type: "end",
        }),
      );

      this.addMessage(
        "system",
        "Ending interview. Analyzing your responses...",
      );

      this.showLoading();

      const input = document.getElementById("interviewInput");

      const sendButton = document.getElementById("sendMessageBtn");

      if (input) {
        input.disabled = true;
      }

      if (sendButton) {
        sendButton.disabled = true;
      }
    } else {
      this.returnToActionSection();
    }

    this.hideTypingIndicator();
  }

  startNewInterview() {
    document.getElementById("interviewTranscript")?.replaceChildren();

    const input = document.getElementById("interviewInput");

    if (input) {
      input.value = "";
      input.disabled = false;
    }

    document.getElementById("sendMessageBtn")?.removeAttribute("disabled");

    document.getElementById("endInterviewBtn")?.classList.remove("d-none");

    document.getElementById("newInterviewBtn")?.classList.add("d-none");

    this.startInterview();
  }

  returnToActionSection() {
    document.getElementById("interviewSection")?.classList.add("d-none");

    document.getElementById("actionSection")?.classList.remove("d-none");
  }
}

// ============================================================
// INITIALIZE APP
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  window.app = new ResumeMasterApp();
});
