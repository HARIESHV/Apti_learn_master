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
        if (!response.ok) throw new Error('Auth failed');
        const data = await response.json();
        currentUser = data.user;

        // Populate Top Navbar Profile
        document.getElementById('nav-name').textContent = currentUser.full_name;
        document.getElementById('nav-avatar').textContent = currentUser.full_name.charAt(0);

        // Populate Sidebar Profile
        document.getElementById('side-name').textContent = currentUser.full_name;
        document.getElementById('side-avatar').textContent = currentUser.full_name.charAt(0);
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
    if (sectionId === 'overview') {
        if (window.refreshDashboardStats) window.refreshDashboardStats();
    }
    if (sectionId === 'categories') loadCategories();
    if (sectionId === 'questions') { loadCategoriesForFilter(); loadQuestions(); }
    if (sectionId === 'students') loadStudents();
    if (sectionId === 'sessions') loadSessions();
    if (sectionId === 'messages') { loadStudentChats(); loadMessages(); }
    if (sectionId === 'leaderboard') loadLeaderboard();
    if (sectionId === 'submissions') loadSubmissions();
    if (sectionId === 'subtopics') { loadCategoriesForFilter(); loadSubtopics(); }
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
        const response = await fetch(`${API_BASE}/admin/dashboard`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        return data;
    } catch (err) { console.error(err); return null; }
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

// ── CATEGORIES ──
async function loadCategories() {
    const response = await fetch(`${API_BASE}/admin/categories`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const data = await response.json();
    const tbody = document.getElementById('categories-body');
    tbody.innerHTML = data.categories.map(cat => `
        <tr>
            <td style="font-size: 1.5rem;">${cat.icon}</td>
            <td><strong>${cat.name}</strong></td>
            <td>${cat.description || '-'}</td>
            <td>${cat.question_count}</td>
            <td>${cat.time_limit > 0 ? cat.time_limit + ' min' : '<span class="badge-pill" style="background: rgba(99,102,241,0.1); color: var(--brand-indigo)">No Limit</span>'}</td>
            <td><span class="badge-pill ${cat.access_type === 'lifetime' ? 'success' : 'warning'}">${cat.access_type}</span></td>
            <td>
                <div style="display:flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary" onclick="editCategory(${JSON.stringify(cat).replace(/"/g, '&quot;')})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCategory(${cat.id})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openCategoryModal() {
    document.getElementById('cat-modal-title').textContent = 'Add New Category';
    document.getElementById('cat-edit-id').value = '';
    document.getElementById('category-form').reset();
    document.getElementById('category-modal').classList.add('active');
}

function closeCategoryModal() { document.getElementById('category-modal').classList.remove('active'); }

function editCategory(cat) {
    document.getElementById('cat-modal-title').textContent = 'Edit Category';
    document.getElementById('cat-edit-id').value = cat.id;
    document.getElementById('cat-name').value = cat.name;
    document.getElementById('cat-description').value = cat.description;
    document.getElementById('cat-icon').value = cat.icon;
    document.getElementById('cat-time-limit').value = cat.time_limit;
    document.getElementById('cat-access-type').value = cat.access_type;
    document.getElementById('category-modal').classList.add('active');
}

document.getElementById('category-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('cat-edit-id').value;
    const body = {
        name: document.getElementById('cat-name').value,
        description: document.getElementById('cat-description').value,
        icon: document.getElementById('cat-icon').value,
        time_limit: parseInt(document.getElementById('cat-time-limit').value),
        access_type: document.getElementById('cat-access-type').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_BASE}/admin/categories/${id}` : `${API_BASE}/admin/categories`;

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(body)
    });

    if (res.ok) {
        if (typeof playNotificationSound === 'function') playNotificationSound(true);
        showToast(id ? 'Category updated' : 'Category created');
        closeCategoryModal();
        loadCategories();
    } else {
        const d = await res.json();
        showToast(d.error || 'Failed to save', 'error');
    }
};

async function deleteCategory(id) {
    if (!confirm('Are you sure? All questions in this category will be deleted.')) return;
    const res = await fetch(`${API_BASE}/admin/categories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) { showToast('Category deleted'); loadCategories(); }
}

// ── QUESTIONS ──
async function loadCategoriesForFilter() {
    const res = await fetch(`${API_BASE}/admin/categories`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
    const data = await res.json();
    const filter = document.getElementById('filter-category');
    const select = document.getElementById('q-category');
    const subtopicFilter = document.getElementById('filter-subtopic-category');
    const subtopicSelect = document.getElementById('st-category');
    const opts = data.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    if (filter) filter.innerHTML = '<option value="">All Categories</option>' + opts;
    if (select) select.innerHTML = '<option value="">Select Category</option>' + opts;
    if (subtopicFilter) subtopicFilter.innerHTML = '<option value="">All Categories</option>' + opts;
    if (subtopicSelect) subtopicSelect.innerHTML = '<option value="">Select Category</option>' + opts;
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
                <strong>${q.question_text}</strong>
                ${q.question_description ? `<div style="color:var(--text-muted); font-size:0.75rem; margin-top:4px;">${q.question_description}</div>` : ''}
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
    document.getElementById('question-modal').classList.add('active');
}

function closeQuestionModal() { document.getElementById('question-modal').classList.remove('active'); }

async function editQuestion(q) {
    document.getElementById('question-modal-title').textContent = 'Edit Question';
    document.getElementById('q-edit-id').value = q.id;
    document.getElementById('q-category').value = q.category_id;
    await loadSubtopicsForQuestionForm(q.category_id);
    document.getElementById('q-subtopic').value = q.subtopic_id || '';
    document.getElementById('q-text').value = q.question_text;
    document.getElementById('q-option-a').value = q.option_a;
    document.getElementById('q-option-b').value = q.option_b;
    document.getElementById('q-option-c').value = q.option_c;
    document.getElementById('q-option-d').value = q.option_d;
    document.getElementById('q-correct').value = q.correct_answer;
    document.getElementById('q-description').value = q.question_description || '';
    document.getElementById('q-difficulty').value = q.difficulty;

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
        subtopic_id: document.getElementById('q-subtopic').value || null,
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

    if (res.ok) {
        if (typeof playNotificationSound === 'function') playNotificationSound(true);
        showToast(id ? 'Question updated' : 'Question created');
        closeQuestionModal();
        loadQuestions();
    }
};

async function deleteQuestion(id) {
    if (!confirm('Are you sure?')) return;
    const res = await fetch(`${API_BASE}/admin/questions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) { showToast('Question deleted'); loadQuestions(); }
}

// ── SUBTOPICS ──
async function loadSubtopics() {
    const catId = document.getElementById('filter-subtopic-category').value;
    const url = `${API_BASE}/admin/subtopics${catId ? '?category_id=' + catId : ''}`;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const data = await res.json();
        const tbody = document.getElementById('subtopics-body');

        if (!data.subtopics || data.subtopics.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No subtopics found</p></td></tr>';
            return;
        }

        tbody.innerHTML = data.subtopics.map(st => `
            <tr>
                <td style="font-size: 1.5rem;">${st.icon}</td>
                <td><strong>${st.name}</strong></td>
                <td><span class="badge badge-medium">${st.category_name}</span></td>
                <td>${st.description || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteSubtopic(${st.id})">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (err) { console.error('Error loading subtopics:', err); }
}

async function loadSubtopicsForQuestionForm(categoryId) {
    const select = document.getElementById('q-subtopic');
    if (!categoryId) {
        select.innerHTML = '<option value="">— Select a Subtopic —</option>';
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/admin/subtopics?category_id=${categoryId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        const opts = (data.subtopics || []).map(st => `<option value="${st.id}">${st.name}</option>`).join('');
        select.innerHTML = '<option value="">— Select a Subtopic (Optional) —</option>' + opts;
    } catch (err) {
        select.innerHTML = '<option value="">— Select a Subtopic —</option>';
    }
}

document.getElementById('subtopic-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
        category_id: document.getElementById('st-category').value,
        name: document.getElementById('st-name').value,
        description: document.getElementById('st-desc').value,
        icon: document.getElementById('st-icon').value
    };

    const res = await fetch(`${API_BASE}/admin/subtopics`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(body)
    });

    if (res.ok) {
        showToast('Subtopic created!');
        document.getElementById('subtopic-form').reset();
        loadSubtopics();
    } else {
        const err = await res.json();
        showToast(err.error || 'Failed to create subtopic', 'error');
    }
});

async function deleteSubtopic(id) {
    if (!confirm('Are you sure you want to delete this subtopic? Questions linked to it will not be deleted, but they will lose the subtopic tag.')) return;

    const res = await fetch(`${API_BASE}/admin/subtopics/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });

    if (res.ok) {
        showToast('Subtopic deleted!');
        loadSubtopics();
    } else {
        showToast('Failed to delete subtopic', 'error');
    }
}

async function loadLeaderboard() {
    const grid = document.getElementById('leaderboard-list');
    try {
        const response = await fetch(`${API_BASE}/student/leaderboard`, {
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
        </tr>
        </tr>
    `).join('');
}

// ── SUBMISSIONS ──
async function loadSubmissions() {
    try {
        const res = await fetch(`${API_BASE}/admin/submissions`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const data = await res.json();
        const tbody = document.getElementById('submissions-body');

        if (data.submissions.length === 0) {
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
    if (data.sessions.length === 0) {
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
