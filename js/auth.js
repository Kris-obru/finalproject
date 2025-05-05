// API base URL
const API_BASE_URL = 'http://localhost:3000/api';

// State management
const AppState = {
    currentPage: 'landing',
    currentUser: null,
    currentSessionId: null,
    isLoading: false,
    cachedCourses: [],
    cachedStudents: {},
    cachedTeams: []
};

// Authentication functions
async function handleLogin() {
    try {
        console.log('Attempting login with email:', txtEmail.value.trim());
        
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                email: txtEmail.value.trim(), 
                password: txtPassword.value.trim() 
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Login failed');
        }

        const data = await response.json();
        AppState.currentUser = data.user;
        AppState.currentSessionId = data.sessionId;
        
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        localStorage.setItem('sessionId', data.sessionId);
        
        closeModal('authModal');
        updateUIForLoggedInUser();
        showDashboard();
    } catch (error) {
        console.error('Login error:', error);
        showError(error.message);
    }
}

async function handleRegister() {
    showLoading();
    const email = txtRegEmail.value.trim();
    const password = txtRegPassword.value.trim();
    const confirmPassword = txtConfirmPassword.value.trim();
    const firstName = txtFirstName.value.trim();
    const lastName = txtLastName.value.trim();
    const userType = document.querySelector('input[name="userType"]:checked').value;

    if (!validateEmail(email)) {
        showError("Please enter a valid email address.");
        return;
    }
    if (!validateEduEmail(email)) {
        showError("Please use your university email address (.edu).");
        return;
    }
    if (password.length < 6) {
        showError("Your password needs to be at least 6 characters long.");
        return;
    }
    if (password !== confirmPassword) {
        showError("The passwords don't match. Please try again.");
        return;
    }
    if (firstName.length < 1 || lastName.length < 1) {
        showError("Please enter both your first and last name.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                password,
                firstName,
                lastName,
                userType
            })
        });

        if (!response.ok) {
            throw new Error('Registration failed');
        }

        const data = await response.json();
        AppState.currentUser = data.user;
        AppState.currentSessionId = data.sessionId;
        
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        localStorage.setItem('sessionId', data.sessionId);
        
        closeModal('authModal');
        updateUIForLoggedInUser();
        showDashboard();
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

async function signOut() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'session-id': AppState.currentSessionId
            }
        });

        if (!response.ok) {
            throw new Error('Logout failed');
        }

        // Clear local state
        AppState.currentUser = null;
        AppState.currentSessionId = null;
        AppState.cachedCourses = [];
        AppState.cachedStudents = {};
        localStorage.removeItem('currentUser');
        localStorage.removeItem('sessionId');
        
        // Update UI
        updateUIForLoggedOutUser();
        showLanding();
    } catch (error) {
        showError(error.message);
    }
}

async function verifySession(sessionId) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/verify`, {
            method: 'GET',
            headers: {
                'session-id': sessionId
            }
        });
        return response.ok;
    } catch (error) {
        console.error('Session verification error:', error);
        return false;
    }
}

function handleSessionExpiration() {
    AppState.currentUser = null;
    AppState.currentSessionId = null;
    AppState.cachedCourses = [];
    AppState.cachedStudents = {};
    AppState.cachedTeams = [];
    localStorage.removeItem('currentUser');
    localStorage.removeItem('sessionId');
    
    updateUIForLoggedOutUser();
    showLanding();
    
    showError('Your session has expired. Please sign in again.');
}

// Validation functions
function validateEmail(email) {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

function validateEduEmail(email) {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.edu$/.test(email);
}

// Export functions
export {
    AppState,
    handleLogin,
    handleRegister,
    signOut,
    verifySession,
    handleSessionExpiration,
    validateEmail,
    validateEduEmail
}; 