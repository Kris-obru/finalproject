import { AppState, API_BASE_URL } from './auth.js';
import { showError, showSuccess, showLoading, hideLoading } from './ui.js';

// Instructor dashboard functions
async function loadTeacherData() {
    try {
        // First, fetch and cache courses
        const response = await fetch(`${API_BASE_URL}/courses`, {
            headers: {
                'session-id': AppState.currentSessionId,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            },
            credentials: 'same-origin',
            cache: 'no-store'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load teacher data');
        }
        
        const courses = await response.json();
        AppState.cachedCourses = courses;
        AppState.cachedStudents = {};
        
        // Prefetch students for all courses
        if (courses.length > 0) {
            await Promise.all(courses.map(course => 
                fetch(`${API_BASE_URL}/courses/${course.course_id}/students`, {
                    headers: { 'session-id': AppState.currentSessionId }
                })
                .then(res => res.ok ? res.json() : [])
                .then(students => {
                    AppState.cachedStudents[course.course_id] = students;
                })
                .catch(err => {
                    console.error(`Error fetching students for course ${course.course_id}:`, err);
                    AppState.cachedStudents[course.course_id] = [];
                })
            ));
        }
        
        // Fetch and cache teams data
        try {
            const teamsResponse = await fetch(`${API_BASE_URL}/teams`, {
                headers: { 'session-id': AppState.currentSessionId }
            });
            
            if (teamsResponse.ok) {
                const teams = await teamsResponse.json();
                AppState.cachedTeams = teams;
                displayTeams();
            }
        } catch (error) {
            console.error('Error fetching teams data:', error);
            AppState.cachedTeams = [];
        }
        
        // Update UI
        updateTeacherDashboard(courses);
        
        // Load additional data
        await Promise.all([
            loadTeacherReviews(),
            loadTeacherStudentReports()
        ]);
        
    } catch (error) {
        console.error('Error loading teacher data:', error);
        showError('Failed to load teacher dashboard data');
    }
}

function updateTeacherDashboard(courses) {
    // Update teacher name
    document.getElementById('teacherUserName').textContent = AppState.currentUser.firstName;
    
    // Update courses table
    const coursesTableBody = document.getElementById('coursesTableBody');
    coursesTableBody.innerHTML = '';
    
    if (courses.length === 0) {
        coursesTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">No courses found. Create your first course!</td>
            </tr>
        `;
    } else {
        courses.forEach(course => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${course.course_name}</td>
                <td>${course.course_number}</td>
                <td>${course.course_section}</td>
                <td>${course.course_term}</td>
                <td>${new Date(course.start_date).toLocaleDateString()}</td>
                <td>${new Date(course.end_date).toLocaleDateString()}</td>
                <td>${course.course_id}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteCourse('${course.course_id}')">Delete</button>
                </td>
            `;
            coursesTableBody.appendChild(row);
        });
    }

    // Update overview counts
    document.getElementById('activeCoursesCount').textContent = courses.length;
    document.getElementById('totalStudentsCount').textContent = '0';
    document.getElementById('pendingReviewsCount').textContent = '0';
    document.getElementById('completedReviewsCount').textContent = '0';
}

function displayTeams() {
    const teamsTableBody = document.getElementById('teamsTableBody');
    if (!teamsTableBody) return;
    
    teamsTableBody.innerHTML = '';
    
    if (!AppState.cachedTeams || AppState.cachedTeams.length === 0) {
        teamsTableBody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center">No teams found. Create your first team!</td>
            </tr>
        `;
        return;
    }
    
    AppState.cachedTeams.forEach(team => {
        const row = document.createElement('tr');
        const membersText = Array.isArray(team.members) ? team.members.join(', ') : '';
        
        row.innerHTML = `
            <td>${team.group_name}</td>
            <td>${team.course_number} - ${team.course_name}</td>
            <td>${membersText}</td>
        `;
        
        teamsTableBody.appendChild(row);
    });
}

async function deleteCourse(courseId) {
    try {
        const result = await Swal.fire({
            title: 'Are you sure?',
            text: "You won't be able to revert this!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, delete it!'
        });

        if (!result.isConfirmed) return;

        const response = await fetch(`${API_BASE_URL}/courses/${courseId}`, {
            method: 'DELETE',
            headers: { 'session-id': AppState.currentSessionId }
        });

        if (!response.ok) throw new Error('Failed to delete course');

        showSuccess('Course deleted successfully');
        AppState.cachedCourses = [];
        AppState.cachedStudents = {};
        await loadTeacherData();
    } catch (error) {
        showError(error.message);
    }
}

async function loadTeacherReviews() {
    const pendingTableBody = document.getElementById('pendingReviewsTableBody');
    const completedTableBody = document.getElementById('completedReviewsTableBody');

    try {
        const response = await fetch(`${API_BASE_URL}/assessments/teacher`, {
            headers: { 'session-id': AppState.currentSessionId }
        });

        if (!response.ok) throw new Error('Failed to load reviews');

        const reviews = await response.json();
        const now = new Date();
        let pendingCount = 0;
        let completedCount = 0;

        pendingTableBody.innerHTML = '';
        completedTableBody.innerHTML = '';

        reviews.forEach(review => {
            const row = document.createElement('tr');
            const courseDisplay = `${review.course_number} - ${review.course_name}`;
            const endDate = new Date(review.end_time);
            const isPending = review.status === 'pending' || review.status === 'open';
            
            const statusBadge = isPending ? 
                '<span class="badge badge-warning">Pending/Open</span>' : 
                '<span class="badge badge-success">Completed</span>';
            const visibilityBadge = review.visibility === 'public' ? 
                '<span class="badge badge-success">Public</span>' : 
                '<span class="badge badge-info">Private</span>';

            row.innerHTML = `
                <td>${review.review_name}</td>
                <td>${courseDisplay}</td>
                <td>${endDate.toLocaleDateString()}</td>
                <td>${visibilityBadge}</td>
                <td>${statusBadge}</td>
            `;

            if (isPending) {
                pendingTableBody.appendChild(row);
                pendingCount++;
            } else {
                completedTableBody.appendChild(row);
                completedCount++;
            }
        });

        // Update counts
        document.getElementById('pendingReviewsCount').textContent = pendingCount;
        document.getElementById('completedReviewsCount').textContent = completedCount;

        // Show messages if no reviews
        if (pendingCount === 0) {
            pendingTableBody.innerHTML = '<tr><td colspan="5" class="text-center">No pending reviews found.</td></tr>';
        }
        if (completedCount === 0) {
            completedTableBody.innerHTML = '<tr><td colspan="5" class="text-center">No completed reviews found.</td></tr>';
        }

    } catch (error) {
        console.error('Error loading teacher reviews:', error);
        showError('Failed to load reviews');
        pendingTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading reviews.</td></tr>';
        completedTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading reviews.</td></tr>';
    }
}

async function loadTeacherStudentReports() {
    const tableBody = document.getElementById('studentAveragesTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="2" class="text-center">Loading reports...</td></tr>';

    try {
        const response = await fetch(`${API_BASE_URL}/reports/teacher/students`, {
            headers: { 'session-id': AppState.currentSessionId }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || contentType.indexOf("application/json") === -1) {
            throw new Error("Received non-JSON response from server.");
        }

        const reports = await response.json();
        tableBody.innerHTML = '';

        if (reports.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="2" class="text-center">No student data available for reports.</td></tr>';
            return;
        }

        reports.forEach(report => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${report.firstName} ${report.lastName}</td>
                <td>${report.average}</td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        console.error('Error loading teacher student reports:', error);
        showError('Failed to load student reports');
        tableBody.innerHTML = `<tr><td colspan="2" class="text-center text-danger">Error loading reports: ${error.message}</td></tr>`;
    }
}

// Export functions
export {
    loadTeacherData,
    displayTeams,
    deleteCourse,
    loadTeacherReviews,
    loadTeacherStudentReports
}; 