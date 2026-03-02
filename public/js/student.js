const API_BASE = '/api';
let currentUser = null;
let currentQuiz = null;
let quizTimerInterval = null;
let activeFile = null;
let currentSection = 'overview';

// Auth check
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return;
    }
    loadUserData();
    showSection('overview');

    // Polling for segments
    setInterval(() => {
        if (currentSection === 'messages') loadMessages();
        if (currentSection === 'sessions') loadSessions();
    }, 5000);
});

async function loadUserData() {
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!response.ok) throw new Error('Auth failed');
        const data = await response.json();
        currentUser = data.user;

        // Populate Top Navbar Profile
        const navName = document.getElementById('nav-name');
        const navAvatar = document.getElementById('nav-avatar');
        if (navName) navName.textContent = currentUser.full_name;
        if (navAvatar) navAvatar.textContent = currentUser.full_name.charAt(0);

        // Populate Sidebar Profile
        const sideName = document.getElementById('side-name');
        const sideAvatar = document.getElementById('side-avatar');
        if (sideName) sideName.textContent = currentUser.full_name;
        if (sideAvatar) sideAvatar.textContent = currentUser.full_name.charAt(0);

        const welcomeName = document.getElementById('welcome-name');
        if (welcomeName) welcomeName.textContent = currentUser.full_name;
    } catch (err) {
        logout();
    }
}

function showSection(sectionId) {
    const oldSection = document.querySelector('.dashboard-section.active');
    const newSection = document.getElementById(`section-${sectionId}`);

    if (oldSection === newSection) return;

    currentSection = sectionId;
    document.querySelectorAll('.menu-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeLink) activeLink.classList.add('active');

    if (oldSection) oldSection.classList.remove('active');
    if (newSection) newSection.classList.add('active');

    triggerSectionLoad(sectionId);
    document.getElementById('sidebar').classList.remove('active');
}

function triggerSectionLoad(sectionId) {
    if (sectionId === 'overview') loadDashboardStats();
    if (sectionId === 'quiz') showQuizSelect();
    if (sectionId === 'history') loadHistory();
    if (sectionId === 'sessions') loadSessions();
    if (sectionId === 'messages') loadMessages();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); }
function logout() { localStorage.removeItem('token'); window.location.href = '/'; }

// ── OVERVIEW ──
async function loadDashboardStats() {
    try {
        const res = await fetch(`${API_BASE}/student/dashboard`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        const { stats, recentAttempts, categoryPerformance } = data;

        document.getElementById('stat-attempts').textContent = stats.totalAttempts;
        document.getElementById('stat-avg-score').textContent = stats.avgScore + '%';
        document.getElementById('stat-best-score').textContent = stats.bestScore + '%';
        document.getElementById('stat-categories').textContent = stats.categoriesAttempted;

        const perfBody = document.getElementById('category-performance-body');
        perfBody.innerHTML = categoryPerformance.map(p => `
            <tr>
                <td><strong>${p.icon} ${p.name}</strong></td>
                <td>${p.attempts}</td>
                <td><span class="badge-pill ${p.avg_score >= 70 ? 'success' : p.avg_score >= 40 ? 'warning' : 'danger'}">${p.avg_score}%</span></td>
                <td><strong>${p.best_score}%</strong></td>
            </tr>
        `).join('') || '<tr><td colspan="4" class="empty-state">No performance data yet.</td></tr>';

        const recentBody = document.getElementById('recent-attempts-body');
        recentBody.innerHTML = recentAttempts.map(att => `
            <tr>
                <td>${att.icon} ${att.category}</td>
                <td>${att.score}/${att.total_questions}</td>
                <td><span class="badge-pill ${att.percentage >= 70 ? 'success' : att.percentage >= 40 ? 'warning' : 'danger'}">${att.percentage}%</span></td>
                <td>${formatISTDate(att.completed_at)}</td>
            </tr>
        `).join('') || '<tr><td colspan="4" class="empty-state">No recent activity.</td></tr>';
    } catch (err) { console.error(err); }
}

// ── QUIZ LOGIC ──
async function showQuizSelect() {
    document.getElementById('quiz-select').style.display = 'block';
    document.getElementById('quiz-active').style.display = 'none';
    document.getElementById('quiz-results').style.display = 'none';

    const res = await fetch(`${API_BASE}/student/categories`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const data = await res.json();
    const grid = document.getElementById('quiz-categories');
    grid.innerHTML = data.categories.map(cat => `
        <div class="category-card" onclick="startQuiz(${cat.id}, '${cat.name}')">
            <div class="category-card-icon">${cat.icon}</div>
            <h3 class="category-card-name">${cat.name}</h3>
            <p class="category-card-desc">${cat.description || 'Test your skills'}</p>
            <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap; justify-content:center;">
                <span class="badge badge-timer">❓ ${cat.question_count} Questions</span>
                ${cat.time_limit > 0 ? `<span class="badge badge-limited">⏱️ ${cat.time_limit} Min</span>` : '<span class="badge badge-lifetime">♾️ No Timer</span>'}
                <span class="badge ${cat.access_type === 'lifetime' ? 'badge-lifetime' : 'badge-limited'}">${cat.access_type}</span>
            </div>
            <button class="btn btn-primary" style="margin-top: 1.5rem; width: 100%; background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%); border: none; padding: 0.85rem; border-radius: 100px; font-weight: 700; color: white; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.35); transition: all 0.3s ease;">Start Quiz →</button>
        </div>
    `).join('');
}

async function startQuiz(categoryId, categoryName) {
    try {
        const res = await fetch(`${API_BASE}/student/quiz/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ category_id: categoryId })
        });
        const data = await res.json();

        currentQuiz = {
            attempt_id: data.attempt_id,
            questions: data.questions,
            answers: new Array(data.questions.length).fill(null).map((_, i) => ({
                question_id: data.questions[i].id,
                selected_answer: null,
                uploaded_file: ''
            })),
            currentIndex: 0,
            timeLimit: data.time_limit, // in minutes
            timeLeft: data.time_limit * 60, // in seconds
            categoryName: categoryName
        };

        document.getElementById('quiz-select').style.display = 'none';
        document.getElementById('quiz-active').style.display = 'block';
        document.getElementById('quiz-intro-screen').style.display = 'block';
        document.getElementById('quiz-actual-content').style.display = 'none';

        document.getElementById('intro-category').textContent = categoryName;
        document.getElementById('intro-title').textContent = categoryName;
        document.getElementById('quiz-category-name').textContent = categoryName;
        document.getElementById('quiz-total').textContent = currentQuiz.questions.length;

    } catch (err) { showToast('Failed to start quiz', 'error'); }
}

window.beginQuizAttempt = function () {
    document.getElementById('quiz-intro-screen').style.display = 'none';
    document.getElementById('quiz-actual-content').style.display = 'block';

    // Timer Setup
    const timerEl = document.getElementById('quiz-timer');
    if (currentQuiz.timeLimit > 0) {
        timerEl.style.display = 'flex';
        startTimer();
    } else {
        timerEl.style.display = 'none';
    }

    renderQuestion();
}

function startTimer() {
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    updateTimerDisplay();
    quizTimerInterval = setInterval(() => {
        currentQuiz.timeLeft--;
        updateTimerDisplay();
        if (currentQuiz.timeLeft <= 0) {
            clearInterval(quizTimerInterval);
            showToast('Time is up!', 'warning');
            submitQuiz();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const display = document.getElementById('timer-display');
    const timerBox = document.getElementById('quiz-timer');
    const mins = Math.floor(currentQuiz.timeLeft / 60);
    const secs = currentQuiz.timeLeft % 60;
    display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    if (currentQuiz.timeLeft < 60) timerBox.className = 'quiz-timer danger';
    else if (currentQuiz.timeLeft < 180) timerBox.className = 'quiz-timer warning';
    else timerBox.className = 'quiz-timer';
}

function renderQuestion() {
    const q = currentQuiz.questions[currentQuiz.currentIndex];
    const ans = currentQuiz.answers[currentQuiz.currentIndex];

    document.getElementById('quiz-current').textContent = currentQuiz.currentIndex + 1;
    document.getElementById('question-number').textContent = `Question ${currentQuiz.currentIndex + 1}`;
    document.getElementById('question-text').textContent = q.question_text;

    const desc = document.getElementById('question-description');
    if (q.question_description) {
        desc.style.display = 'block';
        desc.textContent = q.question_description;
    } else {
        desc.style.display = 'none';
    }

    const optionsHtml = ['a', 'b', 'c', 'd'].map(opt => `
        <li class="option-item ${ans.selected_answer === opt.toUpperCase() ? 'selected' : ''}" 
            onclick="selectOption('${opt.toUpperCase()}')">
            <span class="option-label">${opt.toUpperCase()}</span>
            <span class="option-text">${q['option_' + opt]}</span>
        </li>
    `).join('');
    document.getElementById('options-list').innerHTML = optionsHtml;

    // File Upload Area
    const fileArea = document.getElementById('uploaded-file-name');
    if (ans.uploaded_file) {
        fileArea.style.display = 'block';
        fileArea.textContent = `📎 File attached`;
    } else {
        fileArea.style.display = 'none';
    }

    // Nav buttons
    document.getElementById('btn-prev').disabled = currentQuiz.currentIndex === 0;
    const isLast = currentQuiz.currentIndex === currentQuiz.questions.length - 1;
    document.getElementById('btn-next').style.display = isLast ? 'none' : 'block';
    document.getElementById('btn-submit-quiz').style.display = isLast ? 'block' : 'none';

    // Progress
    const progress = ((currentQuiz.currentIndex + 1) / currentQuiz.questions.length) * 100;
    document.getElementById('quiz-progress-bar').style.width = `${progress}%`;
}

function selectOption(opt) {
    currentQuiz.answers[currentQuiz.currentIndex].selected_answer = opt;
    renderQuestion();
}

async function onQuizFileUpload(input) {
    if (!input.files || !input.files[0]) return;

    const formData = new FormData();
    formData.append('file', input.files[0]);

    try {
        const res = await fetch(`${API_BASE}/student/quiz/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: formData
        });
        const data = await res.json();
        currentQuiz.answers[currentQuiz.currentIndex].uploaded_file = data.file_path;
        renderQuestion();
        showToast('File attached 📎');
    } catch (err) { showToast('Upload failed', 'error'); }
}

function prevQuestion() { if (currentQuiz.currentIndex > 0) { currentQuiz.currentIndex--; renderQuestion(); } }
function nextQuestion() { if (currentQuiz.currentIndex < currentQuiz.questions.length - 1) { currentQuiz.currentIndex++; renderQuestion(); } }

async function submitQuiz() {
    if (quizTimerInterval) clearInterval(quizTimerInterval);

    try {
        const res = await fetch(`${API_BASE}/student/quiz/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({
                attempt_id: currentQuiz.attempt_id,
                answers: currentQuiz.answers
            })
        });
        const data = await res.json();
        showResults(data);
    } catch (err) { showToast('Failed to submit', 'error'); }
}

function showResults(data) {
    document.getElementById('quiz-active').style.display = 'none';
    document.getElementById('quiz-results').style.display = 'block';

    document.getElementById('result-score').textContent = `${data.percentage}%`;
    document.getElementById('result-text').textContent = `You scored ${data.score} out of ${data.total}`;
    document.getElementById('result-emoji').textContent = data.percentage >= 70 ? '🏆' : data.percentage >= 40 ? '👍' : '📚';

    const review = document.getElementById('answer-review');
    review.innerHTML = data.results.map((r, i) => {
        const q = currentQuiz.questions.find(quest => quest.id === r.question_id);
        const studentAns = currentQuiz.answers.find(a => a.question_id === r.question_id);

        return `
            <div class="glass-card" style="padding: 1.5rem; margin-bottom: 1rem; border-left: 4px solid ${r.is_correct ? 'var(--accent-success)' : 'var(--accent-danger)'};">
                <p style="font-weight:600; margin-bottom: 1rem;">${i + 1}. ${q.question_text}</p>
                <div style="font-size: 0.875rem; display:grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                    <div>Your: <span style="font-weight:700; color:${r.is_correct ? 'var(--accent-success)' : 'var(--accent-danger)'}">${r.selected || 'No Answer'}</span></div>
                    <div>Correct: <span style="font-weight:700; color:var(--accent-success)">${r.correct}</span></div>
                </div>
                ${studentAns.uploaded_file ? `<div style="margin-top:0.5rem;"><small>📎 Attached: <a href="${studentAns.uploaded_file}" target="_blank">View File</a></small></div>` : ''}
            </div>
        `;
    }).join('');
}

// ── HISTORY ──
async function loadHistory() {
    const res = await fetch(`${API_BASE}/student/history`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
    const data = await res.json();
    const tbody = document.getElementById('history-body');
    tbody.innerHTML = data.attempts.map(att => `
        <tr>
            <td>${att.icon} ${att.category}</td>
            <td>${att.score}/${att.total_questions}</td>
            <td><span class="badge-pill ${att.percentage >= 70 ? 'success' : att.percentage >= 40 ? 'warning' : 'danger'}">${att.percentage}%</span></td>
            <td>${formatISTDate(att.completed_at)}</td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="empty-state">No history yet</td></tr>';
}

// ── LIVE SESSIONS ──
async function loadSessions() {
    const res = await fetch(`${API_BASE}/sessions/active`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
    const data = await res.json();
    const grid = document.getElementById('sessions-grid');
    if (data.sessions.length === 0) {
        grid.innerHTML = '<div class="glass-card" style="grid-column: 1/-1; padding: 3rem; text-align: center;"><p>No active live sessions at the moment. Check back later!</p></div>';
        return;
    }
    grid.innerHTML = data.sessions.map(s => `
        <div class="glass-card session-card is-live">
            <div class="session-badge live">Live Now</div>
            <h4 class="session-title">${s.title}</h4>
            <p class="session-desc">${s.description || 'Join our live interactive session.'}</p>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:1.5rem;">
                📅 ${s.scheduled_at ? formatISTDate(s.scheduled_at) : 'Live Started'}
            </div>
            <a href="${s.meet_link}" target="_blank" class="session-link"> Join Meeting 🎥 </a>
        </div>
    `).join('');
}

// ── MESSAGING ──
async function loadMessages() {
    try {
        const res = await fetch(`${API_BASE}/messages`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const data = await res.json();
        const container = document.getElementById('chat-messages');
        const oldScroll = container.scrollHeight;

        if (data.messages.length > 0) {
            document.getElementById('chat-empty-state').style.display = 'none';
        }

        container.innerHTML = data.messages.map(m => `
            <div class="chat-msg ${m.sender_id === currentUser.id ? 'sent' : 'received'} ${m.is_broadcast ? 'broadcast' : ''}" 
                 style="margin-bottom:1.5rem; position:relative; max-width:85%; ${m.sender_id === currentUser.id ? 'margin-left:auto;' : 'margin-right:auto;'}">
                ${m.is_broadcast ? `
                    <div style="background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.4); border-radius: 12px; padding: 1rem; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                        <div style="font-size:0.7rem; color:#a855f7; font-weight:800; text-transform:uppercase; margin-bottom:0.5rem; letter-spacing:1px;">Campus Broadcast</div>
                        <div style="color:white; font-size:1rem; line-height:1.5; font-weight:500;">${m.message_text}</div>
                        ${m.file_path ? `<a href="${m.file_path}" target="_blank" style="display:inline-flex; align-items:center; gap:0.5rem; margin-top:0.85rem; padding:0.6rem 1rem; background:rgba(255,255,255,0.05); border:1px solid rgba(147, 51, 234, 0.3); border-radius:8px; font-size:0.85rem; color:#fff; text-decoration:none; transition:all 0.3s ease;" onmouseover="this.style.background='rgba(147, 51, 234, 0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">📎 ${m.file_name}</a>` : ''}
                        <div style="font-size:0.7rem; color:rgba(255,255,255,0.4); margin-top:0.75rem;">${formatISTDate(m.created_at)}</div>
                    </div>
                ` : `
                    <div style="display:flex; flex-direction:column; ${m.sender_id === currentUser.id ? 'align-items:flex-end' : 'align-items:flex-start'}">
                        <div style="background: ${m.sender_id === currentUser.id ? 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)' : 'rgba(255,255,255,0.08)'}; border-radius: 14px; padding: 0.85rem 1.25rem; position:relative; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                            <div style="color:white; font-size:0.95rem; line-height:1.4;">${m.message_text}</div>
                            ${m.file_path ? `<a href="${m.file_path}" target="_blank" style="display:block; margin-top:0.6rem; font-size:0.85rem; color:#fff; text-decoration:underline; opacity:0.8;">📎 ${m.file_name}</a>` : ''}
                        </div>
                        <div style="font-size:0.65rem; color:rgba(255,255,255,0.4); margin-top:0.35rem; font-weight:600;">${formatISTDate(m.created_at)}</div>
                    </div>
                `}
            </div>
        `).join('');

        if (container.scrollHeight > oldScroll) container.scrollTop = container.scrollHeight;
    } catch (err) { }
}

function onFileSelect(input) {
    if (input.files && input.files[0]) {
        activeFile = input.files[0];
        document.getElementById('file-preview-area').style.display = 'block';
        document.getElementById('file-preview-name').textContent = activeFile.name;
    }
}

function clearFile() {
    activeFile = null;
    document.getElementById('chat-file').value = '';
    document.getElementById('file-preview-area').style.display = 'none';
}

async function sendMessage() {
    const text = document.getElementById('chat-input').value;
    if (!text && !activeFile) return;

    const formData = new FormData();
    formData.append('message_text', text);
    formData.append('recipient_id', '1'); // Assuming 1 is the main admin
    if (activeFile) formData.append('file', activeFile);

    const res = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData
    });

    if (res.ok) {
        document.getElementById('chat-input').value = '';
        clearFile();
        loadMessages();
    }
}

