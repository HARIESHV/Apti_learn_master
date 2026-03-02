const API_BASE = '/api';
let currentUser = null;
let currentSection = 'overview';
let activeFile = null;
let selectedStudentId = null;
let selectedStudentName = '';

// Auth check
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return;
    }
    loadUserData();
    showSection('overview');

    // Polling for messages
    setInterval(() => {
        if (currentSection === 'messages') {
            if (selectedStudentId) {
                loadMessages(selectedStudentId);
            }
        }
    }, 5000);
});

async function loadUserData() {
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        // Only logout on actual auth errors (token invalid/expired)
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/';
            return;
        }
        if (!response.ok) {
            console.warn('Could not load user data, server error:', response.status);
            return;
        }

        const data = await response.json();
        currentUser = data.user;

        // Role guard — only admins allowed here
        if (currentUser.role !== 'admin') {
            window.location.href = '/student';
            return;
        }

        // Populate Top Navbar Profile
        document.getElementById('nav-name').textContent = currentUser.full_name;
        document.getElementById('nav-avatar').textContent = currentUser.full_name.charAt(0);

        // Populate Sidebar Profile
        document.getElementById('side-name').textContent = currentUser.full_name;
        document.getElementById('side-avatar').textContent = currentUser.full_name.charAt(0);
    } catch (err) {
        // Network error — don't logout, server might be starting up
        console.warn('Network error loading user data:', err.message);
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
    if (sectionId === 'overview') {
        if (window.refreshDashboardStats) window.refreshDashboardStats();
    }
    if (sectionId === 'questions') { loadCategoriesForFilter(); loadQuestions(); }
    if (sectionId === 'students') loadStudents();
    if (sectionId === 'sessions') loadSessions();
    if (sectionId === 'messages') { loadStudentChats(); loadMessages(); }
    if (sectionId === 'leaderboard') loadLeaderboard();
    if (sectionId === 'submissions') loadSubmissions();
    if (sectionId === 'subtopics') { loadCategoriesForFilter(); }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
}

// ── OVERVIEW ──
async function loadDashboardStats() {
    try {
        const res = await fetch(`${API_BASE}/admin/dashboard`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const data = await res.json();
        return data;
    } catch (err) {
        console.error('Stats error:', err);
        return null;
    }
}

async function resetWebsiteData() {
    const confirmText = 'DANGER: This will delete ALL questions, categories, students, and quiz scores. This is a FINAL reset for a fresh start. Type "RESET" to confirm:';
    const userInput = prompt(confirmText);

    if (userInput !== 'RESET') {
        showToast('Reset cancelled. Confirmation mismatched.', 'info');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/admin/reset-all`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (res.ok) {
            playNotificationSound(true);
            showToast('Website Reset Successful! Redirecting...', 'success');
            setTimeout(() => window.location.reload(), 2000);
        } else {
            const data = await res.json();
            showToast(data.error || 'Reset failed', 'error');
        }
    } catch (err) {
        showToast('Network error during reset', 'error');
    }
}

// Function to populate recent attempts manually for now if needed, or we can move it to Vue
function populateRecentAttempts(recentAttempts) {
    const tbody = document.getElementById('recent-attempts-body');
    if (!tbody) return;
    if (!recentAttempts || recentAttempts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No attempts yet</td></tr>';
        return;
    }

    tbody.innerHTML = recentAttempts.map(att => `
        <tr>
            <td><strong>${att.full_name}</strong><br><small style="color: var(--text-dim)">${att.username}</small></td>
            <td>${att.category}</td>
            <td>${att.score}/${att.total_questions}</td>
            <td><span class="badge-pill ${att.percentage >= 70 ? 'success' : att.percentage >= 40 ? 'warning' : 'danger'}">${att.percentage}%</span></td>
            <td>${formatISTDate(att.completed_at)}</td>
        </tr>
    `).join('');
}

// ── QUESTIONS ──
async function loadCategoriesForFilter() {
    const res = await fetch(`${API_BASE}/admin/categories`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
    const data = await res.json();
    const filter = document.getElementById('filter-category');
    const select = document.getElementById('q-category');
    const opts = data.categories.map(c => `<option value="${c.id}" data-name="${c.name}">${c.name}</option>`).join('');

    if (filter) filter.innerHTML = '<option value="">All Categories</option>' + opts;
    if (select) select.innerHTML = '<option value="">— Select a Topic —</option>' + opts;
}

async function loadQuestions() {
    const catId = document.getElementById('filter-category').value;
    const url = `${API_BASE}/admin/questions${catId ? '?category_id=' + catId : ''}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
    const data = await res.json();
    const tbody = document.getElementById('questions-body');
    tbody.innerHTML = data.questions.map(q => `
        <tr>
            <td>
                <div style="display:flex; gap:1rem; align-items:flex-start;">
                    ${q.question_image ? `<img src="${q.question_image}" style="width:50px; height:50px; object-fit:cover; border-radius:4px; border:1px solid var(--border-color);">` : ''}
                    <div>
                        <strong>${q.question_text || (q.question_image ? '[Image Question]' : 'No text')}</strong>
                        ${q.question_description ? `<div style="color:var(--text-muted); font-size:0.75rem; margin-top:4px;">${q.question_description}</div>` : ''}
                    </div>
                </div>
            </td>
            <td>
                <div>${q.category_name}</div>
                ${q.subtopic_name ? `<div style="color:var(--text-muted); font-size:0.75rem; margin-top:4px;">📌 ${q.subtopic_name}</div>` : ''}
            </td>
            <td><span class="badge badge-${q.difficulty}">${q.difficulty}</span></td>
            <td><span class="badge badge-limited">${q.correct_answer}</span></td>
            <td>
                <div style="display:flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary" onclick="editQuestion(${JSON.stringify(q).replace(/"/g, '&quot;')})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteQuestion(${q.id})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openQuestionModal() {
    document.getElementById('question-modal-title').textContent = 'Add New Question';
    document.getElementById('q-edit-id').value = '';
    document.getElementById('question-form').reset();
    document.getElementById('q-time-days').value = '0';
    document.getElementById('q-time-hours').value = '0';
    document.getElementById('q-time-mins').value = '0';
    document.getElementById('q-time-secs').value = '0';
    document.getElementById('q-subtopic').innerHTML = '<option value="">— Select a Subtopic —</option>';

    // Reset image preview
    document.getElementById('q-image-filename').innerText = 'No file chosen';
    document.getElementById('q-image-preview-container').style.display = 'none';
    document.getElementById('q-image-preview').src = '';
    document.getElementById('q-image-url').value = '';
    document.getElementById('q-text').disabled = false;
    document.getElementById('q-text').required = true;

    document.getElementById('question-modal').classList.add('active');
}

function closeQuestionModal() { document.getElementById('question-modal').classList.remove('active'); }

function editQuestion(q) {
    document.getElementById('question-modal-title').textContent = 'Edit Question';
    document.getElementById('q-edit-id').value = q.id;
    document.getElementById('q-category').value = q.category_id;
    loadSubtopicsForQuestionForm(q.category_id);
    // After populating, set the stored subtopic name as selected value
    setTimeout(() => {
        const sel = document.getElementById('q-subtopic');
        sel.value = q.subtopic_name || '';
    }, 0);
    document.getElementById('q-text').value = q.question_text;
    document.getElementById('q-option-a').value = q.option_a;
    document.getElementById('q-option-b').value = q.option_b;
    document.getElementById('q-option-c').value = q.option_c;
    document.getElementById('q-option-d').value = q.option_d;
    document.getElementById('q-correct').value = q.correct_answer;
    document.getElementById('q-description').value = q.question_description || '';
    document.getElementById('q-difficulty').value = q.difficulty;

    // Handle existing image
    if (q.question_image) {
        document.getElementById('q-image-url').value = q.question_image;
        document.getElementById('q-image-preview').src = q.question_image;
        document.getElementById('q-image-preview-container').style.display = 'block';
        document.getElementById('q-image-filename').innerText = 'Current image';
        document.getElementById('q-text').required = false;
    } else {
        document.getElementById('q-image-url').value = '';
        document.getElementById('q-image-preview-container').style.display = 'none';
        document.getElementById('q-image-filename').innerText = 'No file chosen';
        document.getElementById('q-text').required = true;
    }

    const totalSecs = q.time_limit || 0;
    document.getElementById('q-time-days').value = Math.floor(totalSecs / 86400);
    document.getElementById('q-time-hours').value = Math.floor((totalSecs % 86400) / 3600);
    document.getElementById('q-time-mins').value = Math.floor((totalSecs % 3600) / 60);
    document.getElementById('q-time-secs').value = totalSecs % 60;

    document.getElementById('question-modal').classList.add('active');
}

document.getElementById('question-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('q-edit-id').value;
    const imageInput = document.getElementById('q-image');
    let questionImageUrl = document.getElementById('q-image-url').value;

    try {
        // 1. Upload NEW image if present
        if (imageInput.files && imageInput.files[0]) {
            const formData = new FormData();
            formData.append('file', imageInput.files[0]);
            const uploadRes = await fetch(`${API_BASE}/admin/questions/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: formData
            });
            if (uploadRes.ok) {
                const uploadData = await uploadRes.json();
                questionImageUrl = uploadData.file_path;
            } else {
                showToast('Image upload failed', 'error');
                return;
            }
        }

        // 2. Submit Question Data
        const body = {
            category_id: document.getElementById('q-category').value,
            question_text: document.getElementById('q-text').value,
            question_description: document.getElementById('q-description').value,
            option_a: document.getElementById('q-option-a').value,
            option_b: document.getElementById('q-option-b').value,
            option_c: document.getElementById('q-option-c').value,
            option_d: document.getElementById('q-option-d').value,
            correct_answer: document.getElementById('q-correct').value,
            difficulty: document.getElementById('q-difficulty').value,
            subtopic_name: document.getElementById('q-subtopic').value || '',
            question_image: questionImageUrl,
            time_limit: (parseInt(document.getElementById('q-time-days').value) || 0) * 86400 +
                (parseInt(document.getElementById('q-time-hours').value) || 0) * 3600 +
                (parseInt(document.getElementById('q-time-mins').value) || 0) * 60 +
                (parseInt(document.getElementById('q-time-secs').value) || 0)
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_BASE}/admin/questions/${id}` : `${API_BASE}/admin/questions`;

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        if (res.ok) {
            if (typeof playNotificationSound === 'function') playNotificationSound(true);
            showToast(id ? 'Question updated' : 'Question created', 'success');
            closeQuestionModal();
            loadQuestions();
        } else {
            showToast(data.error || 'Failed to save question', 'error');
        }
    } catch (err) {
        showToast('Network error while saving question', 'error');
    }
};

function handleQuestionImageSelect(input) {
    const filenameSpan = document.getElementById('q-image-filename');
    const previewContainer = document.getElementById('q-image-preview-container');
    const previewImg = document.getElementById('q-image-preview');
    const qText = document.getElementById('q-text');

    if (input.files && input.files[0]) {
        const file = input.files[0];
        filenameSpan.innerText = file.name;

        const reader = new FileReader();
        reader.onload = function (e) {
            previewImg.src = e.target.result;
            previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);

        qText.required = false;
    } else {
        filenameSpan.innerText = 'No file chosen';
        if (!document.getElementById('q-image-url').value) {
            previewContainer.style.display = 'none';
            qText.required = true;
        }
    }
}

function clearQuestionImage() {
    const input = document.getElementById('q-image');
    const filenameSpan = document.getElementById('q-image-filename');
    const previewContainer = document.getElementById('q-image-preview-container');
    const previewImg = document.getElementById('q-image-preview');
    const qImageUrl = document.getElementById('q-image-url');
    const qText = document.getElementById('q-text');

    input.value = '';
    filenameSpan.innerText = 'No file chosen';
    previewContainer.style.display = 'none';
    previewImg.src = '';
    qImageUrl.value = '';

    if (!qText.value.trim()) {
        qText.required = true;
    }
}

async function deleteQuestion(id) {
    if (!confirm('Are you sure you want to delete this question?')) return;
    const res = await fetch(`${API_BASE}/admin/questions/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
    if (res.ok) {
        showToast('Question deleted', 'success');
        loadQuestions();
        loadDashboardStats();
    }
}

async function clearAllQuestions() {
    if (!confirm('⚠️ WARNING: This will delete ALL questions from the database. This action cannot be undone. Area you sure?')) return;

    try {
        const res = await fetch(`${API_BASE}/admin/questions/all`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok) {
            showToast('All questions cleared', 'success');
            loadQuestions();
            loadDashboardStats();
        } else {
            const data = await res.json();
            showToast(data.error || 'Failed to clear questions', 'error');
        }
    } catch (err) {
        showToast('Error clearing questions', 'error');
    }
}
// ── SUBTOPICS (hardcoded per category name, auto-populated in question form) ──

// Maps category names (case-insensitive, trimmed) to their subtopic lists
const SUBTOPICS_MAP = {
    'quantitative aptitude': [
        // Arithmetic
        'Number System', 'HCF & LCM', 'Simplification', 'Percentage',
        'Profit & Loss', 'Simple Interest & Compound Interest', 'Ratio & Proportion',
        'Average', 'Time & Work', 'Pipes & Cisterns', 'Time, Speed & Distance',
        'Boats & Streams', 'Mixture & Alligation',
        // Algebra
        'Linear Equations', 'Quadratic Equations', 'Polynomials', 'Inequalities', 'Functions & Graphs',
        // Geometry
        'Lines & Angles', 'Triangles', 'Quadrilaterals', 'Circles', 'Polygons',
        // Mensuration
        'Area & Perimeter (2D)', 'Surface Area & Volume (3D)',
        // Trigonometry
        'Basic Trigonometric Ratios', 'Identities', 'Heights & Distances',
        // Permutation & Combination
        'Fundamental Counting Principle', 'Permutations', 'Combinations',
        // Probability
        'Basic Probability', 'Conditional Probability',
        // Data Interpretation
        'Tables', 'Bar Graphs', 'Line Graphs', 'Pie Charts', 'Caselets'
    ],
    'logical reasoning': [
        'Number Series', 'Letter Series', 'Coding–Decoding', 'Blood Relations',
        'Direction Sense', 'Syllogisms', 'Venn Diagrams', 'Seating Arrangement',
        'Puzzles', 'Analogies', 'Clocks & Calendars'
    ],
    'verbal ability': [
        'Reading Comprehension', 'Vocabulary (Synonyms, Antonyms)', 'Sentence Correction',
        'Error Spotting', 'Fill in the Blanks', 'Para Jumbles',
        'Active & Passive Voice', 'Direct & Indirect Speech'
    ],
    'placement / company focused': [
        'Quant + Reasoning Mixed Problems', 'Time-based Calculation Questions',
        'Data Sufficiency', 'Logical Puzzles'
    ]
};

function loadSubtopicsForQuestionForm(categoryId) {
    const select = document.getElementById('q-subtopic');
    if (!categoryId) {
        select.innerHTML = '<option value="">— Select a Subtopic —</option>';
        return;
    }

    // Get the category name from the selected option
    const catSelect = document.getElementById('q-category');
    const selectedOption = catSelect.options[catSelect.selectedIndex];
    const catName = (selectedOption ? selectedOption.text : '').toLowerCase().trim();

    // Try exact match first, then partial match
    let subtopics = SUBTOPICS_MAP[catName];
    if (!subtopics) {
        // Try partial match (e.g. category created with slightly different casing)
        const matchedKey = Object.keys(SUBTOPICS_MAP).find(key =>
            catName.includes(key) || key.includes(catName)
        );
        subtopics = matchedKey ? SUBTOPICS_MAP[matchedKey] : [];
    }

    if (subtopics && subtopics.length > 0) {
        const opts = subtopics.map(st => `<option value="${st}">${st}</option>`).join('');
        select.innerHTML = '<option value="">— Select a Subtopic (Optional) —</option>' + opts;
    } else {
        select.innerHTML = '<option value="">— No subtopics for this category —</option>';
    }
}

async function loadLeaderboard() {
    const grid = document.getElementById('leaderboard-list');
    try {
        const response = await fetch(`${API_BASE}/admin/leaderboard`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        const { leaderboard } = data;

        if (!leaderboard || leaderboard.length === 0) {
            grid.innerHTML = '<div class="glass-card" style="padding:3rem; text-align:center;"><p>No rankings available yet. Students need to complete at least one quiz.</p></div>';
            return;
        }

        grid.innerHTML = leaderboard.map((user, index) => `
            <div class="leaderboard-item" style="display:flex; align-items:center; padding: 1.25rem 2rem; border-bottom: 1px solid var(--border-color); background: ${index < 3 ? 'var(--bg-glass)' : 'transparent'}">
                <div class="rank" style="width: 50px; font-weight: 800; font-size: 1.25rem; color: ${index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : 'var(--text-muted)'}">${index + 1}</div>
                <div class="user-avatar" style="margin-right: 1.5rem; width: 45px; height: 45px;">${user.full_name.charAt(0)}</div>
                <div style="flex:1">
                    <h4 style="margin:0">${user.full_name}</h4>
                    <span style="font-size:0.8rem; color:var(--text-muted)">${user.total_quizzes} quizzes taken</span>
                </div>
                <div style="text-align:right">
                    <div style="font-weight:700; font-size:1.25rem; color:var(--accent-primary-light)">${user.avg_score}%</div>
                    <div style="font-size:0.75rem; color:var(--text-muted)">Avg Score</div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Leaderboard error:', err);
        grid.innerHTML = '<p style="padding:2rem; text-align:center;">Failed to load leaderboard</p>';
    }
}

// ── STUDENTS ──
async function loadStudents() {
    const res = await fetch(`${API_BASE}/admin/students`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
    const data = await res.json();
    const tbody = document.getElementById('students-body');
    tbody.innerHTML = data.students.map(s => `
        <tr>
            <td><strong>${s.full_name}</strong></td>
            <td>${s.username}</td>
            <td>${s.email}</td>
            <td>${s.total_attempts}</td>
            <td><span class="badge ${s.avg_score >= 70 ? 'badge-score-high' : s.avg_score >= 40 ? 'badge-score-mid' : 'badge-score-low'}">${s.avg_score || 0}%</span></td>
            <td>${formatISTDate(s.created_at)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteStudent(${s.id}, '${s.full_name.replace(/'/g, "\\'")}')" 
                style="padding: 0.35rem 0.75rem; font-size: 0.75rem;">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function deleteStudent(id, name) {
    if (!confirm(`Are you sure you want to delete student "${name}"? This will also remove all their scores and messages.`)) return;

    try {
        const res = await fetch(`${API_BASE}/admin/students/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Student deleted successfully', 'success');
            loadStudents();
            loadDashboardStats();
        } else {
            showToast(data.error || 'Failed to delete student', 'error');
        }
    } catch (err) {
        showToast('Error deleting student', 'error');
    }
}

// ── SUBMISSIONS ──
async function loadSubmissions() {
    try {
        const res = await fetch(`${API_BASE}/admin/submissions`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const data = await res.json();
        const tbody = document.getElementById('submissions-body');

        if (!data.submissions || data.submissions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No submissions found.</p></td></tr>';
            return;
        }

        tbody.innerHTML = data.submissions.map(sub => `
            <tr>
                <td><strong>${sub.student_name}</strong></td>
                <td><span class="badge badge-score-mid">${sub.category_name}</span></td>
                <td><div style="max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${sub.question_text}">${sub.question_text}</div></td>
                <td><a href="${sub.file_path}" target="_blank" class="btn btn-sm" style="background: rgba(139, 92, 246, 0.2); color: var(--primary-light); text-decoration: none;">Download File 📥</a></td>
                <td style="color:var(--text-muted); font-size: 0.85rem;">${formatISTDate(sub.completed_at)}</td>
            </tr>
        `).join('');
    } catch (err) {
        document.getElementById('submissions-body').innerHTML = '<tr><td colspan="5" class="empty-state"><p>Error loading submissions.</p></td></tr>';
    }
}

// ── LIVE SESSIONS ──
function openSessionModal() { document.getElementById('session-modal').classList.add('active'); }
function closeSessionModal() { document.getElementById('session-modal').classList.remove('active'); }

async function loadSessions() {
    const res = await fetch(`${API_BASE}/sessions/admin`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
    const data = await res.json();
    const grid = document.getElementById('sessions-grid');
    if (!data.sessions || data.sessions.length === 0) {
        grid.innerHTML = '<div class="glass-card" style="grid-column: 1/-1; padding: 3rem; text-align: center;"><p>No live sessions created yet.</p></div>';
        return;
    }
    grid.innerHTML = data.sessions.map(s => `
        <div class="glass-card session-card ${s.is_active ? 'is-live' : ''}" style="border-top: 3px solid ${s.is_active ? '#10b981' : 'var(--border)'}; padding: 1.5rem;">
            <div style="margin-bottom: 1rem;"><span class="badge-pill ${s.is_active ? 'success' : 'warning'}" style="font-weight: 700; font-size: 0.7rem; padding: 0.3rem 0.6rem;">${s.is_active ? '● ACTIVE' : 'ENDED'}</span></div>
            <h4 class="session-title" style="font-size: 1.1rem; font-weight: 700; color: white;">${s.title}</h4>
            <p class="session-desc" style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">${s.description || 'No description provided.'}</p>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
                📅 ${s.scheduled_at ? formatISTDate(s.scheduled_at) : 'ASAP'}
            </div>
            <div style="display:flex; justify-content: flex-start; align-items: center; gap: 0.75rem;">
                <a href="${s.meet_link}" target="_blank" class="btn" style="background: #10b981; color: white; padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; text-decoration: none;">Join Meet</a>
                <button class="btn btn-sm btn-secondary" onclick="toggleSession(${s.id})" style="padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600;">${s.is_active ? 'Stop' : 'Start'}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteSession(${s.id})" style="padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600;">Del</button>
            </div>
        </div>
        `).join('');
}

document.getElementById('session-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = {
        title: document.getElementById('sess-title').value,
        meet_link: document.getElementById('sess-link').value,
        description: document.getElementById('sess-desc').value,
        scheduled_at: document.getElementById('sess-schedule').value
    };
    const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(body)
    });
    if (res.ok) { showToast('Session created'); closeSessionModal(); loadSessions(); }
};

async function toggleSession(id) {
    const res = await fetch(`${API_BASE}/sessions/${id}/toggle`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) { showToast('Session updated'); loadSessions(); }
}

async function deleteSession(id) {
    if (!confirm('Delete this session?')) return;
    const res = await fetch(`${API_BASE}/sessions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) { showToast('Session deleted'); loadSessions(); }
}

// ── MESSAGING ──
async function loadStudentChats() {
    try {
        const res = await fetch(`${API_BASE}/admin/students`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const data = await res.json();
        const container = document.getElementById('student-chat-list');

        container.innerHTML = data.students.map(s => `
            <div class="student-chat-item ${selectedStudentId === s.id ? 'active' : ''}" onclick="selectStudentChat(${s.id}, '${s.full_name}')"
                 style="display:flex; align-items:center; gap:0.75rem; padding:0.75rem; cursor:pointer; border-radius:8px; margin-bottom:0.5rem; transition: background 0.2s; ${selectedStudentId === s.id ? 'background: rgba(139, 92, 246, 0.2);' : ''}">
                <div style="width:32px; height:32px; background:rgba(255,255,255,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:700;">${s.full_name.charAt(0)}</div>
                <div style="flex:1; overflow:hidden;">
                    <div style="font-weight:600; color:white; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.full_name}</div>
                    <div style="font-size:0.7rem; color:rgba(255,255,255,0.4);">@${s.username}</div>
                </div>
            </div>
        `).join('');
    } catch (err) { }
}

async function selectStudentChat(studentId, studentName) {
    selectedStudentId = studentId;
    selectedStudentName = studentName;

    // Update UI
    document.getElementById('chat-placeholder').style.display = 'none';
    document.getElementById('active-chat-header').style.display = 'block';
    document.getElementById('chat-messages').style.display = 'block';
    document.getElementById('admin-chat-input-area').style.display = 'block';

    document.getElementById('active-student-name').textContent = studentName;
    document.getElementById('active-student-avatar').textContent = studentName.charAt(0);

    loadStudentChats(); // Refresh list to show active
    loadMessages(studentId);
    loadStudentActivity(studentId);
}

async function loadStudentActivity(studentId) {
    try {
        const res = await fetch(`${API_BASE}/admin/students/${studentId}/activity`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const data = await res.json();
        const container = document.getElementById('activity-content');

        if (data.attempts.length === 0) {
            container.innerHTML = `<p style="color: rgba(255,255,255,0.4); font-size: 0.85rem; text-align: center; margin-top: 3rem;">No recent answers found for this student.</p>`;
            return;
        }

        container.innerHTML = data.attempts.map(a => `
            <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:0.75rem; margin-bottom:0.75rem; border:1px solid rgba(255,255,255,0.05);">
                <div style="font-weight:600; color:white; font-size:0.8rem; margin-bottom:0.25rem;">${a.category}</div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.75rem; color:rgba(255,255,255,0.5);">${formatISTDate(a.completed_at)}</span>
                    <span style="font-size:0.75rem; font-weight:700; color:var(--primary-light);">${a.score}/${a.total_questions}</span>
                </div>
            </div>
        `).join('');
    } catch (err) { }
}

async function loadMessages(studentId = null) {
    try {
        let url = `${API_BASE}/messages`;
        if (studentId) url += `?recipient_id=${studentId}`;

        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const data = await res.json();
        const container = document.getElementById('chat-messages');
        const oldScroll = container.scrollHeight;

        container.innerHTML = data.messages.map(m => `
            <div class="chat-msg ${m.sender_role === 'admin' ? 'sent' : 'received'} ${m.is_broadcast ? 'broadcast' : ''}" 
                 style="margin-bottom:1rem; position:relative; max-width:85%; ${m.sender_role === 'admin' ? 'margin-left:auto;' : 'margin-right:auto;'}">
                ${m.is_broadcast ? `
                    <div style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; padding: 0.75rem;">
                        <div style="font-size:0.65rem; color:#a855f7; font-weight:700; text-transform:uppercase; margin-bottom:0.25rem;">Campus Broadcast</div>
                        <div style="color:white; font-size:0.9rem;">${m.message_text}</div>
                        <div style="font-size:0.65rem; color:rgba(255,255,255,0.4); margin-top:0.4rem;">${formatISTDate(m.created_at)}</div>
                    </div>
                ` : `
                    <div style="background: ${m.sender_role === 'admin' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)'}; border-radius: 12px; padding: 0.75rem; position:relative;">
                        <div style="color:white; font-size:0.9rem;">${m.message_text}</div>
                        ${m.file_path ? `<a href="${m.file_path}" target="_blank" style="display:block; margin-top:0.5rem; font-size:0.8rem; color:#a855f7; text-decoration:none;">📎 ${m.file_name}</a>` : ''}
                        <div style="font-size:0.65rem; color:rgba(255,255,255,0.4); margin-top:0.4rem;">${formatISTDate(m.created_at)}</div>
                    </div>
                `}
            </div>
        `).join('');

        if (container.scrollHeight > oldScroll) container.scrollTop = container.scrollHeight;
    } catch (err) { }
}

function openBroadcastModal() { document.getElementById('broadcast-modal').style.display = 'flex'; }
function closeBroadcastModal() { document.getElementById('broadcast-modal').style.display = 'none'; }

document.getElementById('broadcast-form').onsubmit = async (e) => {
    e.preventDefault();
    const text = document.getElementById('broadcast-text').value;
    const file = document.getElementById('broadcast-file').files[0];

    const formData = new FormData();
    formData.append('message_text', text);
    formData.append('recipient_id', 'all');
    if (file) formData.append('file', file);

    const res = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData
    });

    if (res.ok) {
        showToast('Broadcast sent successfully');
        closeBroadcastModal();
        document.getElementById('broadcast-text').value = '';
        document.getElementById('broadcast-file').value = '';
        if (selectedStudentId) loadMessages(selectedStudentId);
        else loadMessages();
    }
};

async function sendMessage() {
    const text = document.getElementById('chat-input').value;
    if (!text && !activeFile) return;
    if (!selectedStudentId) return;

    const formData = new FormData();
    formData.append('message_text', text);
    formData.append('recipient_id', selectedStudentId);
    if (activeFile) formData.append('file', activeFile);

    const res = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData
    });

    if (res.ok) {
        document.getElementById('chat-input').value = '';
        clearFile();
        loadMessages(selectedStudentId);
    }
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
