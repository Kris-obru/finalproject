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
    const courseId = uuidv4();

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
