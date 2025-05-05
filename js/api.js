import { AppState } from './auth.js';
import { showError } from './ui.js';

const API_BASE_URL = '/api';

async function apiRequest(endpoint, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'session-id': AppState.currentSessionId
        },
        credentials: 'same-origin'
    };

    const finalOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, finalOptions);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await response.json();
        }
        
        return await response.text();
    } catch (error) {
        console.error(`API request failed for ${endpoint}:`, error);
        showError(error.message);
        throw error;
    }
}

// Authentication endpoints
async function login(email, password) {
    return apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });
}

async function register(userData) {
    return apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData)
    });
}

async function verifySession() {
    return apiRequest('/auth/verify');
}

// Course endpoints
async function getCourses() {
    return apiRequest('/courses');
}

async function createCourse(courseData) {
    return apiRequest('/courses', {
        method: 'POST',
        body: JSON.stringify(courseData)
    });
}

async function deleteCourse(courseId) {
    return apiRequest(`/courses/${courseId}`, {
        method: 'DELETE'
    });
}

async function getCourseStudents(courseId) {
    return apiRequest(`/courses/${courseId}/students`);
}

// Team endpoints
async function getTeams() {
    return apiRequest('/teams');
}

async function getStudentTeams() {
    return apiRequest('/teams/student');
}

async function createTeam(teamData) {
    return apiRequest('/teams', {
        method: 'POST',
        body: JSON.stringify(teamData)
    });
}

// Assessment endpoints
async function getTeacherAssessments() {
    return apiRequest('/assessments/teacher');
}

async function getStudentAssessments() {
    return apiRequest('/assessments/student');
}

async function createAssessment(assessmentData) {
    return apiRequest('/assessments', {
        method: 'POST',
        body: JSON.stringify(assessmentData)
    });
}

async function submitReview(assessmentId, reviewData) {
    return apiRequest(`/assessments/${assessmentId}/review`, {
        method: 'POST',
        body: JSON.stringify(reviewData)
    });
}

// Report endpoints
async function getTeacherStudentReports() {
    return apiRequest('/reports/teacher/students');
}

async function getStudentReports() {
    return apiRequest('/reports/student');
}

// Export functions
export {
    API_BASE_URL,
    apiRequest,
    login,
    register,
    verifySession,
    getCourses,
    createCourse,
    deleteCourse,
    getCourseStudents,
    getTeams,
    getStudentTeams,
    createTeam,
    getTeacherAssessments,
    getStudentAssessments,
    createAssessment,
    submitReview,
    getTeacherStudentReports,
    getStudentReports
}; 