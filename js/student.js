import { AppState, API_BASE_URL } from './auth.js';
import { showError, showSuccess, showLoading, hideLoading } from './ui.js';

// Student dashboard functions
async function loadStudentData() {
    try {
        console.log('Starting loadStudentData function');
        
        // First load enrollments
        const enrollmentsResponse = await fetch(`${API_BASE_URL}/enrollments/${AppState.currentUser.userId}`, {
            headers: {
                'session-id': AppState.currentSessionId
            }
        });
        
        if (!enrollmentsResponse.ok) {
            console.error('Failed to load enrollments:', enrollmentsResponse.status);
            throw new Error('Failed to load student data');
        }
        
        const enrollmentsData = await enrollmentsResponse.json();
        console.log('Loaded enrollments data:', enrollmentsData);
        
        // Update user name
        const userNameElement = document.getElementById('studentUserName');
        if (userNameElement) {
            userNameElement.textContent = AppState.currentUser.firstName;
        }
        
        // Update the courses table
        const tableBody = document.querySelector('#student-courses tbody');
        if (tableBody) {
            tableBody.innerHTML = '';
            if (enrollmentsData.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center">You are not enrolled in any courses yet.</td>
                    </tr>
                `;
            } else {
                enrollmentsData.forEach(course => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${course.course_name}</td>
                        <td>${course.course_number}</td>
                        <td>${course.course_section}</td>
                        <td>${course.instructor || 'N/A'}</td>
                    `;
                    tableBody.appendChild(row);
                });
            }
        }

        // Update the enrolled courses count
        const enrolledCoursesCount = document.getElementById('enrolledCoursesCount');
        if (enrolledCoursesCount) {
            enrolledCoursesCount.textContent = enrollmentsData.length;
        }

        // Load teams data
        await loadStudentTeams();
        
        // Load instructor reviews
        await loadInstructorReviews();
        
    } catch (error) {
        console.error('Error in loadStudentData:', error);
        showError('Failed to load student dashboard data');
    }
}

async function loadStudentTeams() {
    try {
        console.log('Starting loadStudentTeams function');
        
        const response = await fetch(`${API_BASE_URL}/teams/student`, {
            headers: {
                'session-id': AppState.currentSessionId,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to load student teams: ${response.status}`);
        }

        const teams = await response.json();
        console.log('Received teams data:', teams);

        const tableBody = document.querySelector('#student-teams tbody');
        if (!tableBody) {
            console.error('Could not find student-teams tbody element');
            return;
        }
        
        tableBody.innerHTML = '';

        if (!teams || teams.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center">You have not been assigned to any teams yet.</td>
                </tr>
            `;
            updateTeamsCount(0);
            return;
        }

        teams.forEach(team => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${team.group_name || 'N/A'}</td>
                <td>${team.course_number || 'N/A'} - ${team.course_name || 'N/A'}</td>
                <td>${Array.isArray(team.members) ? team.members.join(', ') : 'No members'}</td>
            `;
            tableBody.appendChild(row);
        });

        updateTeamsCount(teams.length);

    } catch (error) {
        console.error('Error in loadStudentTeams:', error);
        showError('Failed to load student teams: ' + error.message);
        const tableBody = document.querySelector('#student-teams tbody');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-danger">Error loading teams. Please try again later.</td>
                </tr>
            `;
        }
        updateTeamsCount(0);
    }
}

async function loadInstructorReviews() {
    const table = document.getElementById('instructorReviewsTableBody');
    if (!table) {
        console.log('Instructor reviews table not found');
        return;
    }

    try {
        console.log('Loading instructor reviews for student:', AppState.currentUser.userId);
        const response = await fetch(`${API_BASE_URL}/assessments/student/${AppState.currentUser.userId}`, {
            headers: { 
                'session-id': AppState.currentSessionId,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                console.log('No instructor reviews endpoint available yet');
                table.innerHTML = '<tr><td colspan="4" class="text-center">No instructor reviews available.</td></tr>';
                return;
            }
            throw new Error(`Failed to load reviews: ${response.status}`);
        }

        const reviews = await response.json();
        console.log('Loaded instructor reviews:', reviews);

        table.innerHTML = '';
        if (!reviews.length) {
            table.innerHTML = '<tr><td colspan="4" class="text-center">No instructor reviews assigned.</td></tr>';
            return;
        }

        reviews.forEach(review => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${review.name}</td>
                <td>${review.course_number} - ${review.course_name}</td>
                <td>${new Date(review.end_time).toLocaleDateString()}</td>
                <td><button class="btn btn-info btn-sm" onclick="openStudentReview('${review.assessment_id}')">View Review</button></td>
            `;
            table.appendChild(row);
        });
    } catch (err) {
        console.error('Error loading instructor reviews:', err);
        table.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading instructor reviews.</td></tr>';
    }
}

// Helper functions
function updateTeamsCount(count) {
    const teamsCountElement = document.getElementById('teamsCount');
    if (teamsCountElement) {
        teamsCountElement.textContent = count;
        console.log('Updated teams count to:', count);
    } else {
        console.error('Could not find teamsCount element');
    }
}

// Export functions
export {
    loadStudentData,
    loadStudentTeams,
    loadInstructorReviews
}; 