// UI utility functions
function showError(message) {
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: message,
        timer: 3000,
        showConfirmButton: false
    });
}

function showSuccess(message) {
    Swal.fire({
        icon: 'success',
        title: 'Success',
        text: message,
        timer: 3000,
        showConfirmButton: false
    });
}

function showLoading(message = 'Loading...') {
    Swal.fire({
        title: message,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
}

function hideLoading() {
    Swal.close();
}

function setupModals() {
    const modalIds = [
        'loginModal',
        'registerModal',
        'createCourseModal',
        'createTeamModal',
        'createAssessmentModal',
        'studentReviewModal',
        'instructorReviewModal'
    ];

    modalIds.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        // Close button functionality
        const closeBtn = modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.style.display = 'none';
            };
        }

        // Click outside modal to close
        window.onclick = (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };
    });
}

function setupTabNavigation() {
    const tabLinks = document.querySelectorAll('.nav-link[data-bs-toggle="tab"]');
    tabLinks.forEach(link => {
        link.addEventListener('shown.bs.tab', (event) => {
            const targetId = event.target.getAttribute('href').substring(1);
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.scrollTop = 0;
            }
        });
    });
}

function updateDashboardCounts(counts) {
    Object.entries(counts).forEach(([id, count]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = count;
        }
    });
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString();
}

function createBadge(text, type = 'primary') {
    return `<span class="badge badge-${type}">${text}</span>`;
}

function createButton(text, type = 'primary', onClick = null, additionalClasses = '') {
    const button = document.createElement('button');
    button.className = `btn btn-${type} ${additionalClasses}`;
    button.textContent = text;
    if (onClick) {
        button.onclick = onClick;
    }
    return button;
}

function createTableRow(cells, rowClass = '') {
    const row = document.createElement('tr');
    if (rowClass) {
        row.className = rowClass;
    }
    cells.forEach(cell => {
        const td = document.createElement('td');
        if (typeof cell === 'string') {
            td.innerHTML = cell;
        } else {
            td.appendChild(cell);
        }
        row.appendChild(td);
    });
    return row;
}

function createEmptyTableMessage(colspan, message) {
    return `<tr><td colspan="${colspan}" class="text-center">${message}</td></tr>`;
}

function createErrorMessage(colspan, message) {
    return `<tr><td colspan="${colspan}" class="text-center text-danger">${message}</td></tr>`;
}

function createLoadingMessage(colspan) {
    return `<tr><td colspan="${colspan}" class="text-center">Loading...</td></tr>`;
}

// Export functions
export {
    showError,
    showSuccess,
    showLoading,
    hideLoading,
    setupModals,
    setupTabNavigation,
    updateDashboardCounts,
    formatDate,
    formatDateTime,
    createBadge,
    createButton,
    createTableRow,
    createEmptyTableMessage,
    createErrorMessage,
    createLoadingMessage
}; 