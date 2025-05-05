const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');

const app = express();
const port = process.env.PORT || 3000;

// Validation functions
const validateEmail = body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail();

const validatePassword = body('password')
    .trim()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/\d/)
    .withMessage('Password must contain at least one number')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[!@#$%^&*(),.?":{}|<>]/)
    .withMessage('Password must contain at least one special character');

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database setup
let db;
try {
    db = new sqlite3.Database('./database.db', (err) => {
        if (err) {
            console.error('Error opening database:', err);
            console.log('Server will continue running but database operations will fail');
        } else {
            console.log('Connected to SQLite database');
            // Verify tables exist
            db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
                if (err) {
                    console.error('Error checking tables:', err);
                } else {
                    console.log('Available tables:', tables.map(t => t.name));
                }
            });
        }
    });

    // Add error handler for database
    db.on('error', (err) => {
        console.error('Database error:', err);
    });
} catch (error) {
    console.error('Failed to initialize database:', error);
    console.log('Server will continue running but database operations will fail');
}

// Keep process running
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Authentication routes
app.post('/api/auth/register', [
    validateEmail,
    validatePassword,
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
    body('userType').isIn(['student', 'teacher'])
], async (req, res) => {
    console.log('Registration attempt:', { email: req.body.email, userType: req.body.userType });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, userType } = req.body;

    // Check if email is .edu
    if (!email.endsWith('.edu')) {
        console.log('Invalid email domain:', email);
        return res.status(400).json({ error: 'Please use a .edu email address' });
    }

    try {
        // Check if user exists
        db.get('SELECT * FROM tbl_users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                console.error('Database error checking user:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (user) {
                console.log('User already exists:', email);
                return res.status(400).json({ error: 'Email already registered' });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            console.log('Password hashed successfully');

            // Start transaction
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // Insert new user
                const userId = uuidv4();
                console.log('Creating user with ID:', userId);
                
                db.run(
                    'INSERT INTO tbl_users (user_id, first_name, last_name, email, password, user_type, last_login) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                    [userId, firstName, lastName, email, hashedPassword, userType],
                    function(err) {
                        if (err) {
                            console.error('Error creating user:', err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Error creating user' });
                        }

                        // Create session
                        const sessionId = uuidv4();
                        console.log('Creating session with ID:', sessionId);
                        
                        db.run(
                            'INSERT INTO tbl_sessions (session_id, user_id, start_datetime, last_used_datetime, status) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)',
                            [sessionId, userId, 'active'],
                            function(err) {
                                if (err) {
                                    console.error('Error creating session:', err);
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Error creating session' });
                                }

                                // Commit transaction
                                db.run('COMMIT', function(err) {
                                    if (err) {
                                        console.error('Error committing transaction:', err);
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: 'Error completing registration' });
                                    }

                                    console.log('User registered successfully:', { userId, email, userType });
                                    res.status(201).json({
                                        message: 'User registered successfully',
                                        user: { 
                                            userId, 
                                            email, 
                                            firstName, 
                                            lastName, 
                                            userType 
                                        },
                                        sessionId
                                    });
                                });
                            }
                        );
                    }
                );
            });
        });
    } catch (error) {
        console.error('Server error during registration:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', [
    validateEmail,
    body('password').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    console.log('Login attempt for:', email);

    try {
        db.get('SELECT * FROM tbl_users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                console.error('Database error during login:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (!user) {
                console.log('User not found:', email);
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            console.log('Found user:', { 
                email: user.email, 
                user_type: user.user_type,
                first_name: user.first_name,
                last_name: user.last_name 
            });

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                console.log('Invalid password for:', email);
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Start transaction
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // Update last login
                db.run('UPDATE tbl_users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?', [user.user_id], function(err) {
                    if (err) {
                        console.error('Error updating last login:', err);
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Error during login' });
                    }

                    // Create new session
                    const sessionId = uuidv4();
                    db.run(
                        'INSERT INTO tbl_sessions (session_id, user_id, start_datetime, last_used_datetime, status) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)',
                        [sessionId, user.user_id, 'active'],
                        function(err) {
                            if (err) {
                                console.error('Error creating session:', err);
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Error creating session' });
                            }

                            // Commit transaction
                            db.run('COMMIT', function(err) {
                                if (err) {
                                    console.error('Error committing transaction:', err);
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Error completing login' });
                                }

                                const response = {
                                    user: {
                                        userId: user.user_id,
                                        email: user.email,
                                        firstName: user.first_name,
                                        lastName: user.last_name,
                                        userType: user.user_type
                                    },
                                    sessionId
                                };

                                console.log('Login successful, sending response:', response);
                                res.json(response);
                            });
                        }
                    );
                });
            });
        });
    } catch (error) {
        console.error('Server error during login:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update authentication middleware to use sessions
const authenticateUser = (req, res, next) => {
    const sessionId = req.headers['session-id'];
    if (!sessionId) {
        return res.status(401).json({ error: 'Session ID required' });
    }

    db.get(`
        SELECT u.* 
        FROM tbl_users u
        JOIN tbl_sessions s ON u.user_id = s.user_id
        WHERE s.session_id = ? AND s.status = 'active'
    `, [sessionId], (err, user) => {
        if (err) {
            console.error('Database error during authentication:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        // Update session last used time
        db.run('UPDATE tbl_sessions SET last_used_datetime = CURRENT_TIMESTAMP WHERE session_id = ?', [sessionId], (err) => {
            if (err) {
                console.error('Error updating session:', err);
            }
        });

        req.user = user;
        next();
    });
};

// Add logout endpoint
app.post('/api/auth/logout', authenticateUser, (req, res) => {
    const sessionId = req.headers['session-id'];
    
    db.run('UPDATE tbl_sessions SET status = ? WHERE session_id = ?', ['expired', sessionId], (err) => {
        if (err) {
            console.error('Error during logout:', err);
            return res.status(500).json({ error: 'Error during logout' });
        }
        res.json({ message: 'Logged out successfully' });
    });
});

// Utility function to generate course code
function generateCourseCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Course routes
app.post('/api/courses', authenticateUser, [
    body('courseName').trim().notEmpty(),
    body('courseNumber').trim().notEmpty(),
    body('courseSection').trim().notEmpty(),
    body('courseTerm').trim().notEmpty(),
    body('startDate').isISO8601(),
    body('endDate').isISO8601()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { courseName, courseNumber, courseSection, courseTerm, startDate, endDate } = req.body;
    const courseId = generateCourseCode();

    db.run(
        'INSERT INTO tbl_courses (course_id, course_name, course_number, course_section, course_term, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [courseId, courseName, courseNumber, courseSection, courseTerm, startDate, endDate],
        (err) => {
            if (err) {
                return res.status(500).json({ error: 'Error creating course' });
            }
            res.status(201).json({ message: 'Course created successfully', courseId });
        }
    );
});

app.get('/api/courses', authenticateUser, (req, res) => {
    db.all('SELECT * FROM tbl_courses', (err, courses) => {
        if (err) {
            return res.status(500).json({ error: 'Error fetching courses' });
        }
        res.json(courses);
    });
});

// Add DELETE endpoint for courses
app.delete('/api/courses/:courseId', authenticateUser, (req, res) => {
    const { courseId } = req.params;

    db.run('DELETE FROM tbl_courses WHERE course_id = ?', [courseId], function(err) {
        if (err) {
            console.error('Error deleting course:', err);
            return res.status(500).json({ error: 'Error deleting course' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }
        
        res.json({ message: 'Course deleted successfully' });
    });
});

// Enroll routes
app.post('/api/enrollments', authenticateUser, [
    body('courseId').notEmpty(),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { courseId } = req.body;
    const userId = req.user.user_id;

    db.get('SELECT * FROM tbl_courses WHERE course_id = ?', [courseId], (err, course) => {
        if (err) return res.status(500).json({ error: 'Database error checking course' });
        if (!course) return res.status(404).json({ error: 'Course not found' });

        // Check if already enrolled
        db.get('SELECT * FROM tbl_enrollments WHERE course_id = ? AND user_id = ?', [courseId, userId], (err, existing) => {
            if (err) return res.status(500).json({ error: 'Database error checking enrollment' });
            if (existing) return res.status(400).json({ error: 'Already enrolled in this course' });

            // Enroll student
            db.run('INSERT INTO tbl_enrollments (course_id, user_id) VALUES (?, ?)', [courseId, userId], (err) => {
                if (err) return res.status(500).json({ error: 'Error enrolling in course' });
                res.status(200).json({ message: 'Enrolled successfully', courseName: course.course_name });
            });
        });
    });
    
})

app.get('/api/enrollments/:userId', authenticateUser, (req, res) => {
    const { userId } = req.params 

    db.all(`
        SELECT c.course_name, c.course_number, c.course_section, c.course_term
        FROM tbl_enrollments e
        JOIN tbl_courses c ON e.course_id = c.course_id
        WHERE e.user_id = ?
        `, [userId], (err, rows) => {
            if (err) {
                console.error('Error fetching enrollments:', err);
                return res.status(500).json({ error: 'Error fetching enrollments' });
            }
            res.json(rows);
    })
})

// Team routes
app.post('/api/teams', authenticateUser, [
    body('courseId').notEmpty(),
    body('groupName').trim().notEmpty(),
    body('members').isArray()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { courseId, groupName, members } = req.body;
    const groupId = uuidv4();

    console.log('Creating team:', { courseId, groupName, members }); // Debug log

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // First, create the course group
        db.run(
            'INSERT INTO tbl_course_groups (course_group_id, course_id, group_name) VALUES (?, ?, ?)',
            [groupId, courseId, groupName],
            function(err) {
                if (err) {
                    console.error('Error creating course group:', err);
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error creating team' });
                }

                console.log('Course group created with ID:', groupId); // Debug log

                // Then add members to the group
                const stmt = db.prepare('INSERT INTO tbl_group_members (group_id, user_id) VALUES (?, ?)');
                let hasError = false;

                members.forEach(userId => {
                    if (!hasError) {
                        stmt.run(groupId, userId, function(err) {
                            if (err) {
                                console.error('Error adding member:', err);
                                hasError = true;
                            }
                        });
                    }
                });

                stmt.finalize();

                if (hasError) {
                    console.error('Error occurred while adding members');
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error adding members to team' });
                }

                // If everything succeeded, commit the transaction
                db.run('COMMIT', function(err) {
                    if (err) {
                        console.error('Error committing transaction:', err);
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Error creating team' });
                    }
                    console.log('Team created successfully'); // Debug log
                    res.status(201).json({ 
                        message: 'Team created successfully', 
                        groupId,
                        groupName,
                        courseId,
                        members
                    });
                });
            }
        );
    });
});

app.get('/api/teams/student', authenticateUser, (req, res) => {
    const userId = req.user.user_id;

    const query = `
        SELECT 
            cg.group_name,
            c.course_number,
            c.course_name,
            GROUP_CONCAT(u.first_name || ' ' || u.last_name) AS members
        FROM tbl_group_members gm
        JOIN tbl_course_groups cg ON gm.group_id = cg.course_group_id
        JOIN tbl_courses c ON cg.course_id = c.course_id
        LEFT JOIN tbl_group_members gm2 ON gm2.group_id = cg.course_group_id
        LEFT JOIN tbl_users u ON gm2.user_id = u.user_id
        WHERE gm.user_id = ?
        GROUP BY cg.course_group_id
    `;

    db.all(query, [userId], (err, rows) => {
        if (err) {
            console.error('Error fetching student teams:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        const teams = rows.map(row => ({
            ...row,
            members: row.members ? row.members.split(',') : []
        }));

        res.json(teams);
    });
});

app.get('/api/teams', authenticateUser, (req, res) => {
    if (req.user.user_type !== 'teacher') {
        return res.status(403).json({ error: 'Only instructors can view teams' });
    }

    const query = `
        SELECT 
            cg.course_group_id,
            cg.group_name,
            c.course_number,
            c.course_name,
            GROUP_CONCAT(u.first_name || ' ' || u.last_name) AS members
        FROM tbl_course_groups cg
        JOIN tbl_courses c ON cg.course_id = c.course_id
        LEFT JOIN tbl_group_members gm ON cg.course_group_id = gm.group_id
        LEFT JOIN tbl_users u ON gm.user_id = u.user_id
        WHERE c.course_id IN (
            SELECT course_id FROM tbl_courses
        )
        GROUP BY cg.course_group_id
    `;

    db.all(query, (err, rows) => {
        if (err) {
            console.error('Error fetching teams:', err);
            return res.status(500).json({ error: 'Database error fetching teams' });
        }

        // Convert comma-separated members string to array
        const teams = rows.map(row => ({
            ...row,
            members: row.members ? row.members.split(',') : []
        }));

        res.json(teams);
    });
});

app.post('/api/teams/assign', authenticateUser, [
    body('groupId').notEmpty(),
    body('userIds').isArray({min: 1})
], (req, res) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }   

    const { groupId, userIds } = req.body;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare('INSERT OR IGNORE INTO tbl_group_members (group_id, user_id) VALUES (?, ?)');

        for (const userId of userIds) {
            stmt.run(groupId, userId, (err) => {
                if (err) {
                    console.error('Failed to assign user to group:', err);
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Failed to assign students' });
                }
            });
        }

        stmt.finalize((err) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Error finalizing group assignment' });
            }
            db.run('COMMIT');
            res.status(200).json({ message: 'Students assigned to group successfully' });
        });
    });
})

app.get('/api/courses/:courseId/students', authenticateUser, (req, res) => {
    const { courseId } = req.params;

    // Ensure only instructors can access
    if (req.user.user_type !== 'teacher') {
        return res.status(403).json({ error: 'Only instructors can view enrolled students' });
    }

    const query = `
        SELECT u.user_id, u.first_name, u.last_name, u.email
        FROM tbl_enrollments e
        JOIN tbl_users u ON e.user_id = u.user_id
        WHERE e.course_id = ?
    `;

    db.all(query, [courseId], (err, rows) => {
        if (err) {
            console.error('Error fetching students for course:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Assessment routes
app.post('/api/assessments', authenticateUser, [
    body('courseId').notEmpty(),
    body('name').trim().notEmpty(),
    body('type').isIn(['quiz', 'survey']),
    body('startTime').isISO8601(),
    body('endTime').isISO8601(),
    body('questions').isArray()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { courseId, name, type, startTime, endTime, questions } = req.body;
    const assessmentId = uuidv4();

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.run(
            'INSERT INTO tbl_assessments (assessment_id, course_id, user_id, name, type, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [assessmentId, courseId, req.user.user_id, name, type, startTime, endTime],
            (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error creating assessment' });
                }

                const stmt = db.prepare(
                    'INSERT INTO tbl_assessment_questions (assessment_question_id, assessment_id, question_type, question_text, options) VALUES (?, ?, ?, ?, ?)'
                );

                questions.forEach(question => {
                    const questionId = uuidv4();
                    stmt.run(
                        questionId,
                        assessmentId,
                        question.type,
                        question.text,
                        JSON.stringify(question.options)
                    );
                });

                stmt.finalize();
                db.run('COMMIT', (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Error creating assessment' });
                    }
                    res.status(201).json({ message: 'Assessment created successfully', assessmentId });
                });
            }
        );
    });
});

// Response routes
app.post('/api/responses', authenticateUser, [
    body('assessmentId').notEmpty(),
    body('questionId').notEmpty(),
    body('responseText').trim().notEmpty(),
    body('visibility').isIn(['public', 'private']),
    body('targetUserId').optional()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { assessmentId, questionId, responseText, visibility, targetUserId } = req.body;
    const responseId = uuidv4();

    db.run(
        'INSERT INTO tbl_assessment_responses (assessment_response_id, assessment_id, user_id, target_user_id, question_id, response_text, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [responseId, assessmentId, req.user.user_id, targetUserId, questionId, responseText, visibility],
        (err) => {
            if (err) {
                return res.status(500).json({ error: 'Error submitting response' });
            }
            res.status(201).json({ message: 'Response submitted successfully', responseId });
        }
    );
});

// Reports routes
app.get('/api/reports/student/:userId', authenticateUser, (req, res) => {
    const { userId } = req.params;

    db.all(`
        SELECT a.name, AVG(CAST(ar.response_text AS FLOAT)) as average
        FROM tbl_assessment_responses ar
        JOIN tbl_assessments a ON ar.assessment_id = a.assessment_id
        WHERE ar.user_id = ? AND ar.visibility = 'public'
        GROUP BY a.assessment_id
    `, [userId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Error fetching student report' });
        }
        res.json(results);
    });
});

app.get('/api/reports/course/:courseId', authenticateUser, (req, res) => {
    const { courseId } = req.params;

    db.all(`
        SELECT 
            u.first_name,
            u.last_name,
            AVG(CAST(ar.response_text AS FLOAT)) as average
        FROM tbl_assessment_responses ar
        JOIN tbl_users u ON ar.user_id = u.user_id
        JOIN tbl_assessments a ON ar.assessment_id = a.assessment_id
        WHERE a.course_id = ? AND ar.visibility = 'public'
        GROUP BY u.user_id
    `, [courseId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Error fetching course report' });
        }
        res.json(results);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Something broke!' });
});

// Start server
const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Handle server errors
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use`);
        process.exit(1);
    } else {
        console.error('Server error:', error);
    }
});

// Keep process running
setInterval(() => {
    console.log('Server is still running...');
}, 60000); // Log every minute to keep process alive
