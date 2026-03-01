const { createApp, ref, reactive, onMounted } = Vue;

const API_BASE = '';

createApp({
    setup() {
        const activeTab = ref('student-login');
        const loading = ref(false);
        const message = ref('');
        const messageType = ref('info');
        const showPass = ref(false);

        const admin = reactive({ username: '', password: '' });
        const student = reactive({ username: '', password: '' });
        const reg = reactive({ full_name: '', username: '', email: '', password: '' });

        const updateBodyClass = (tab) => {
            const body = document.body;
            body.classList.remove('admin-mode', 'student-mode', 'register-mode');
            if (tab === 'admin-login') body.classList.add('admin-mode');
            else if (tab === 'student-login') body.classList.add('student-mode');
            else if (tab === 'register') body.classList.add('register-mode');
        };

        Vue.watch(activeTab, (newTab) => {
            updateBodyClass(newTab);
        });

        onMounted(() => {
            updateBodyClass(activeTab.value);
            checkAuth();
        });

        const showMsg = (text, type = 'info') => {
            message.value = text;
            messageType.value = type;
            setTimeout(() => { if (message.value === text) message.value = ''; }, 5000);
        };

        const handleLogin = async (payload, role) => {
            loading.value = true;
            message.value = '';
            try {
                const res = await fetch(`${API_BASE}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, role })
                });
                const data = await res.json();
                if (res.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    if (typeof playNotificationSound === 'function') playNotificationSound(true);
                    showMsg('Login successful! Redirecting...', 'success');
                    setTimeout(() => window.location.href = role === 'admin' ? '/admin' : '/student', 1000);
                } else {
                    showMsg(data.error || 'Login failed', 'error');
                }
            } catch (err) {
                showMsg('Connection failed. Is the server running?', 'error');
            } finally {
                loading.value = false;
            }
        };

        const handleAdminLogin = () => handleLogin(admin, 'admin');
        const handleStudentLogin = () => handleLogin(student, 'student');

        const handleRegister = async () => {
            loading.value = true;
            message.value = '';
            try {
                const res = await fetch(`${API_BASE}/api/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reg)
                });
                const data = await res.json();
                if (res.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    if (typeof playNotificationSound === 'function') playNotificationSound(true);
                    showMsg('Account created! Redirecting...', 'success');
                    setTimeout(() => window.location.href = '/student', 1000);
                } else {
                    showMsg(data.error || 'Registration failed', 'error');
                }
            } catch (err) {
                showMsg('Registration failed. Try again.', 'error');
            } finally {
                loading.value = false;
            }
        };

        const checkAuth = () => {
            const token = localStorage.getItem('token');
            const user = localStorage.getItem('user');
            if (token && user) {
                try {
                    const userData = JSON.parse(user);
                    window.location.href = userData.role === 'admin' ? '/admin' : '/student';
                } catch (e) {
                    localStorage.clear();
                }
            }
        };

        return {
            activeTab, loading, message, messageType, showPass,
            admin, student, reg,
            handleAdminLogin, handleStudentLogin, handleRegister
        };
    }
}).mount('#app');
