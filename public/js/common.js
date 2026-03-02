
function initBackgroundAnimations() {
    // Animations removed
}

function initScrollAnimations() {
    // Navbar Shrink / Blur on Scroll
    const navbar = document.querySelector('.saas-navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
    }
}

function formatISTDate(dateStr) {
    if (!dateStr) return '-';

    let date;
    try {
        if (typeof dateStr === 'string') {
            let s = dateStr.trim();
            // Handle SQL/Standard dates by ensuring T and Z for UTC if zone is missing
            if (s.length >= 10 && !s.includes('Z') && !s.includes('+')) {
                s = s.replace(' ', 'T');
                if (s.includes('T')) s += 'Z';
            }
            date = new Date(s);
        } else {
            date = new Date(dateStr);
        }
    } catch (e) {
        return dateStr;
    }

    if (isNaN(date.getTime())) return dateStr;

    return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).toUpperCase();
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeToggleUI(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeToggleUI(newTheme);
}

function updateThemeToggleUI(theme) {
    const icons = ['theme-icon', 'theme-icon-nav'];
    icons.forEach(id => {
        const icon = document.getElementById(id);
        if (icon) {
            icon.textContent = theme === 'light' ? '🌙' : '☀️';
        }
    });
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initScrollAnimations();

    // Start notification polling if logged in
    if (localStorage.getItem('token')) {
        startNotificationPolling();
    }
});

function playNotificationSound(isSuccess = false) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        const playTone = (freq, startTime, duration, volume = 0.3) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            // Premium "soft" wave
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.01, startTime + duration);

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(startTime);
            osc.stop(startTime + duration);
        };

        const now = audioCtx.currentTime;

        if (isSuccess) {
            // Uplifting melody for success
            playTone(523.25, now, 0.6); // C5
            playTone(659.25, now + 0.1, 0.7); // E5
            playTone(783.99, now + 0.2, 0.8, 0.2); // G5
        } else {
            // Elegant double-chime for alert
            playTone(659.25, now, 0.5); // E5
            playTone(830.61, now + 0.08, 0.6, 0.2); // G#5
        }
    } catch (e) {
        console.log('Audio feedback not available');
    }
}

function showToast(message, type = 'success', targetSection = '') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    if (targetSection) {
        toast.classList.add('clickable');
        toast.style.cursor = 'pointer';
        toast.title = `Click to view ${targetSection}`;
        toast.onclick = () => {
            if (typeof showSection === 'function') {
                showSection(targetSection);
                toast.remove();
            }
        };
    }

    // Icon mapping
    let icon = '✨';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'info') icon = 'ℹ️';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
        ${targetSection ? '<span style="margin-left:auto; font-size: 0.7rem; opacity: 0.6;">View →</span>' : ''}
    `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 500);
    }, 6000); // Slightly longer for clickable ones
}

async function startNotificationPolling() {
    // Poll every 5 seconds
    setInterval(async () => {
        try {
            const res = await fetch('/api/notifications', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (!res.ok) return;
            const data = await res.json();

            if (data.notifications && data.notifications.length > 0) {
                // Play Sound once for the batch
                playNotificationSound();

                // Show a toast for each notification
                data.notifications.forEach(n => {
                    // if it's a message or file, show specific icon
                    let icon = '🔔';
                    if (n.type === 'message') icon = '💬';
                    else if (n.type === 'file' || n.type === 'quiz_file') icon = '📎';
                    else if (n.type === 'registration') icon = '👋';

                    if (typeof showToast === 'function') {
                        showToast(`${icon} ${n.message}`, 'info', n.target_url);
                    }
                });

                // Mark all fetched notifications as read
                await fetch('/api/notifications/read-all', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });

                // If on message section, maybe refresh messages (hacky but functional)
                if (typeof loadMessages === 'function' && document.getElementById('section-messages') && document.getElementById('section-messages').style.display !== 'none') {
                    loadMessages();
                }
            }
        } catch (e) {
            // silent fail on network errors during polling
        }
    }, 5000);
}
