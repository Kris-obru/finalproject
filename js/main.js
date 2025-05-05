import { AppState, handleLogin, handleRegister, signOut, verifySession } from './auth.js';
import { loadStudentData } from './student.js';
import { loadTeacherData } from './instructor.js';
import { setupModals, setupTabNavigation, showError } from './ui.js';
import { API_BASE_URL } from './api.js';

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    setupModals();
    setupTabNavigation();
    checkSession();
});

// Session management
async function checkSession() {
    const currentUser = localStorage.getItem('currentUser');
    const sessionId = localStorage.getItem('sessionId');

    if (!currentUser || !sessionId) {
        showLandingPage();
        return;
    }

    try {
        AppState.currentUser = JSON.parse(currentUser);
        AppState.currentSessionId = sessionId;

        const isValid = await verifySession();
        if (!isValid) {
            handleSessionExpiration();
            return;
        }

        showDashboard();
    } catch (error) {
        console.error('Session check failed:', error);
        handleSessionExpiration();
    }
}

function handleSessionExpiration() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('sessionId');
    showLandingPage();
    showError('Your session has expired. Please log in again.');
}

function showLandingPage() {
    document.getElementById('landingPage').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
}

function showDashboard() {
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';

    if (AppState.currentUser.userType === 'student') {
        document.getElementById('studentDashboard').style.display = 'block';
        document.getElementById('teacherDashboard').style.display = 'none';
        loadStudentData();
    } else {
        document.getElementById('studentDashboard').style.display = 'none';
        document.getElementById('teacherDashboard').style.display = 'block';
        loadTeacherData();
    }
}

// Event listeners
document.getElementById('loginForm').addEventListener('submit', handleLogin);
document.getElementById('registerForm').addEventListener('submit', handleRegister);
document.getElementById('signOutBtn').addEventListener('click', signOut);

// Make functions available globally
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.signOut = signOut;
window.loadStudentData = loadStudentData;
window.loadTeacherData = loadTeacherData;
window.showLandingPage = showLandingPage;
window.showDashboard = showDashboard; 