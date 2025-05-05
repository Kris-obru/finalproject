const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const fs = require('fs');

const app = express();
const HTTP_PORT = process.env.PORT || 3000;
const intSalt = 10;

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
    const dbPath = path.join(__dirname, 'database.db');
    console.log('Attempting to connect to database at:', dbPath);
    
    // Read the SQL schema file
    const schemaPath = path.join(__dirname, 'dbquery.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Error opening database:', err);
            console.log('Server will continue running but database operations will fail');
        } else {
            console.log('Connected to SQLite database');
            
            // Create tables if they don't exist
            db.exec(schema, (err) => {
                if (err) {
                    console.error('Error creating tables:', err);
                } else {
                    console.log('Database tables verified/created successfully');
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
app.post('/api/auth/register', (req, res) => {
    console.log('Registration attempt:', { email: req.body.email, userType: req.body.userType })
    
    let strEmail = req.body.email ? req.body.email.trim().toLowerCase() : ''
    let strPassword = req.body.password
    let strFirstName = req.body.firstName ? req.body.firstName.trim() : ''
    let strLastName = req.body.lastName ? req.body.lastName.trim() : ''
    let strUserType = req.body.userType

    // Validate input
    if (!strEmail || !strPassword || !strFirstName || !strLastName || !strUserType) {
        return res.status(400).json({ error: 'All fields are required' })
    }

    // Email validation using regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(strEmail)) {
        return res.status(400).json({ error: "Please enter a valid email address" })
    }

    // Check if email is .edu
    if (!strEmail.endsWith('.edu')) {
        console.log('Invalid email domain:', strEmail)
        return res.status(400).json({ error: 'Please use a .edu email address' })
    }

    // Password validation
    if (strPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters long" })
    }
    if (!/[A-Z]/.test(strPassword)) {
        return res.status(400).json({ error: "Password must contain at least one uppercase letter" })
    }
    if (!/[a-z]/.test(strPassword)) {
        return res.status(400).json({ error: "Password must contain at least one lowercase letter" })
    }
    if (!/[0-9]/.test(strPassword)) {
        return res.status(400).json({ error: "Password must contain at least one number" })
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(strPassword)) {
        return res.status(400).json({ error: "Password must contain at least one special character" })
    }

    // User type validation
    if (strUserType !== 'student' && strUserType !== 'teacher') {
        return res.status(400).json({ error: "User type must be either 'student' or 'teacher'" })
    }

    // Check if user exists
    db.get('SELECT * FROM tbl_users WHERE email = ?', [strEmail], (err, user) => {
        if (err) {
            console.error('Database error checking user:', err)
            return res.status(500).json({ error: 'Database error' })
        }
        if (user) {
            console.log('User already exists:', strEmail)
            return res.status(400).json({ error: 'Email already registered' })
        }

        // Hash password
        bcrypt.hash(strPassword, intSalt, (err, strHashedPassword) => {
            if (err) {
                console.error('Error hashing password:', err)
                return res.status(500).json({ error: 'Error creating user' })
            }
            
            console.log('Password hashed successfully')

            // Start transaction
            db.serialize(() => {
                db.run('BEGIN TRANSACTION')

                // Insert new user
                let strUserId = uuidv4()
                console.log('Creating user with ID:', strUserId)
                
                db.run(
                    'INSERT INTO tbl_users (user_id, first_name, last_name, email, password, user_type, last_login) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                    [strUserId, strFirstName, strLastName, strEmail, strHashedPassword, strUserType],
                    function(err) {
                        if (err) {
                            console.error('Error creating user:', err)
                            db.run('ROLLBACK')
                            return res.status(500).json({ error: 'Error creating user' })
                        }

                        // Create session
                        let strSessionId = uuidv4()
                        console.log('Creating session with ID:', strSessionId)
                        
                        db.run(
                            'INSERT INTO tbl_sessions (session_id, user_id, start_datetime, last_used_datetime, status) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)',
                            [strSessionId, strUserId, 'active'],
                            function(err) {
                                if (err) {
                                    console.error('Error creating session:', err)
                                    db.run('ROLLBACK')
                                    return res.status(500).json({ error: 'Error creating session' })
                                }

                                // Commit transaction
                                db.run('COMMIT', function(err) {
                                    if (err) {
                                        console.error('Error committing transaction:', err)
                                        db.run('ROLLBACK')
                                        return res.status(500).json({ error: 'Error completing registration' })
                                    }

                                    console.log('User registered successfully:', { strUserId, strEmail, strUserType })
                                    res.status(201).json({
                                        message: 'User registered successfully',
                                        user: { 
                                            userId: strUserId, 
                                            email: strEmail, 
                                            firstName: strFirstName, 
                                            lastName: strLastName, 
                                            userType: strUserType 
                                        },
                                        sessionId: strSessionId
                                    })
                                })
                            }
                        )
                    }
                )
            })
        })
    })
})

app.post('/api/auth/login', (req, res) => {
    let strEmail = req.body.email ? req.body.email.trim().toLowerCase() : ''
    let strPassword = req.body.password
    
    if (!strEmail || !strPassword) {
        return res.status(400).json({ error: 'Email and password are required' })
    }

    console.log('Login attempt for:', strEmail)

    db.get('SELECT * FROM tbl_users WHERE email = ?', [strEmail], (err, user) => {
        if (err) {
            console.error('Database error during login:', err)
            return res.status(500).json({ error: 'Database error' })
        }
        if (!user) {
            console.log('User not found:', strEmail)
            return res.status(401).json({ error: 'Invalid credentials' })
        }

        console.log('Found user:', { 
            email: user.email, 
            user_type: user.user_type,
            first_name: user.first_name,
            last_name: user.last_name 
        })

        bcrypt.compare(strPassword, user.password, (err, isMatch) => {
            if (err) {
                console.error('Error comparing passwords:', err)
                return res.status(500).json({ error: 'Login error' })
            }
            
            if (!isMatch) {
                console.log('Invalid password for:', strEmail)
                return res.status(401).json({ error: 'Invalid credentials' })
            }

            // Start transaction
            db.serialize(() => {
                db.run('BEGIN TRANSACTION')

                // Update last login
                db.run('UPDATE tbl_users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?', [user.user_id], function(err) {
                    if (err) {
                        console.error('Error updating last login:', err)
                        db.run('ROLLBACK')
                        return res.status(500).json({ error: 'Error during login' })
                    }

                    // Create new session
                    let strSessionId = uuidv4()
                    db.run(
                        'INSERT INTO tbl_sessions (session_id, user_id, start_datetime, last_used_datetime, status) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)',
                        [strSessionId, user.user_id, 'active'],
                        function(err) {
                            if (err) {
                                console.error('Error creating session:', err)
                                db.run('ROLLBACK')
                                return res.status(500).json({ error: 'Error creating session' })
                            }

                            // Commit transaction
                            db.run('COMMIT', function(err) {
                                if (err) {
                                    console.error('Error committing transaction:', err)
                                    db.run('ROLLBACK')
                                    return res.status(500).json({ error: 'Error completing login' })
                                }

                                let objResponse = {
                                    user: {
                                        userId: user.user_id,
                                        email: user.email,
                                        firstName: user.first_name,
                                        lastName: user.last_name,
                                        userType: user.user_type
                                    },
                                    sessionId: strSessionId
                                }

                                console.log('Login successful, sending response:', objResponse)
                                res.json(objResponse)
                            })
                        }
                    )
                })
            })
        })
    })
})

// Authentication middleware
function authenticateUser(req, res, next) {
    let strSessionId = req.headers['session-id']
    if (!strSessionId) {
        return res.status(401).json({ error: 'Session ID required' })
    }

    let strQuery = `
        SELECT u.* 
        FROM tbl_users u
        JOIN tbl_sessions s ON u.user_id = s.user_id
        WHERE s.session_id = ? AND s.status = 'active'
    `
    
    db.get(strQuery, [strSessionId], (err, user) => {
        if (err) {
            console.error('Database error during authentication:', err)
            return res.status(500).json({ error: 'Database error' })
        }
        if (!user) {
            return res.status(401).json({ error: 'Invalid or expired session' })
        }

        // Update session last used time
        db.run('UPDATE tbl_sessions SET last_used_datetime = CURRENT_TIMESTAMP WHERE session_id = ?', [strSessionId], (err) => {
            if (err) {
                console.error('Error updating session:', err)
            }
        })

        req.user = user
        next()
    })
}

// Add logout endpoint
app.post('/api/auth/logout', authenticateUser, (req, res) => {
    let strSessionId = req.headers['session-id']
    
    db.run('UPDATE tbl_sessions SET status = ? WHERE session_id = ?', ['expired', strSessionId], (err) => {
        if (err) {
            console.error('Error during logout:', err)
            return res.status(500).json({ error: 'Error during logout' })
        }
        res.json({ message: 'Logged out successfully' })
    })
})

// Utility function to generate course code
function generateCourseCode() {
    let strChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let strCode = ''
    for (let i = 0; i < 6; i++) {
        strCode += strChars.charAt(Math.floor(Math.random() * strChars.length))
    }
    return strCode
}

// Course routes
app.post('/api/courses', authenticateUser, (req, res) => {
    let strCourseName = req.body.courseName ? req.body.courseName.trim() : ''
    let strCourseNumber = req.body.courseNumber ? req.body.courseNumber.trim() : ''
    let strCourseSection = req.body.courseSection ? req.body.courseSection.trim() : ''
    let strCourseTerm = req.body.courseTerm ? req.body.courseTerm.trim() : ''
    let strStartDate = req.body.startDate
    let strEndDate = req.body.endDate
    
    // Validate input
    let blnErrorFound = false
    let strMessage = ''
    
    if (!strCourseName || !strCourseNumber || !strCourseSection || !strCourseTerm || !strStartDate || !strEndDate) {
        return res.status(400).json({ error: 'All fields are required' })
    }
    
    // Validate dates
    let regexDate = /^\d{4}-\d{2}-\d{2}$/
    if (!regexDate.test(strStartDate) || !regexDate.test(strEndDate)) {
        return res.status(400).json({ error: 'Dates must be in YYYY-MM-DD format' })
    }
    
    let strCourseId = generateCourseCode()

    let strQuery = 'INSERT INTO tbl_courses (course_id, course_name, course_number, course_section, course_term, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
    db.run(
        strQuery,
        [strCourseId, strCourseName, strCourseNumber, strCourseSection, strCourseTerm, strStartDate, strEndDate],
        function(err) {
            if (err) {
                console.error('Error creating course:', err)
                return res.status(500).json({ error: 'Error creating course' })
            }
            res.status(201).json({ message: 'Course created successfully', courseId: strCourseId })
        }
    )
})

app.get('/api/courses', authenticateUser, (req, res) => {
    let strQuery = 'SELECT * FROM tbl_courses'
    db.all(strQuery, (err, courses) => {
        if (err) {
            console.error('Error fetching courses:', err)
            return res.status(500).json({ error: 'Error fetching courses' })
        }
        res.json(courses)
    })
})

// Add DELETE endpoint for courses
app.delete('/api/courses/:courseId', authenticateUser, (req, res) => {
    let strCourseId = req.params.courseId

    let strQuery = 'DELETE FROM tbl_courses WHERE course_id = ?'
    db.run(strQuery, [strCourseId], function(err) {
        if (err) {
            console.error('Error deleting course:', err)
            return res.status(500).json({ error: 'Error deleting course' })
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Course not found' })
        }
        
        res.json({ message: 'Course deleted successfully' })
    })
})

// Enroll routes
app.post('/api/enrollments', authenticateUser, (req, res) => {
    let strCourseId = req.body.courseId
    let strUserId = req.user.user_id

    if (!strCourseId) {
        return res.status(400).json({ error: 'Course ID is required' })
    }

    let strCheckCourseQuery = 'SELECT * FROM tbl_courses WHERE course_id = ?'
    db.get(strCheckCourseQuery, [strCourseId], (err, course) => {
        if (err) {
            console.error('Error checking course:', err)
            return res.status(500).json({ error: 'Database error checking course' })
        }
        if (!course) {
            return res.status(404).json({ error: 'Course not found' })
        }

        // Check if already enrolled
        let strCheckEnrollmentQuery = 'SELECT * FROM tbl_enrollments WHERE course_id = ? AND user_id = ?'
        db.get(strCheckEnrollmentQuery, [strCourseId, strUserId], (err, existing) => {
            if (err) {
                console.error('Error checking enrollment:', err)
                return res.status(500).json({ error: 'Database error checking enrollment' })
            }
            if (existing) {
                return res.status(400).json({ error: 'Already enrolled in this course' })
            }

            // Enroll student
            let strEnrollQuery = 'INSERT INTO tbl_enrollments (course_id, user_id) VALUES (?, ?)'
            db.run(strEnrollQuery, [strCourseId, strUserId], (err) => {
                if (err) {
                    console.error('Error enrolling in course:', err)
                    return res.status(500).json({ error: 'Error enrolling in course' })
                }
                res.status(200).json({ 
                    message: 'Enrolled successfully', 
                    courseName: course.course_name,
                    courseNumber: course.course_number,
                    courseSection: course.course_section,
                    courseTerm: course.course_term
                })
            })
        })
    })
})

app.get('/api/enrollments/:userId', authenticateUser, (req, res) => {
    let strUserId = req.params.userId

    let strQuery = `
        SELECT c.course_name, c.course_number, c.course_section, c.course_term
        FROM tbl_enrollments e
        JOIN tbl_courses c ON e.course_id = c.course_id
        WHERE e.user_id = ?
    `
    
    db.all(strQuery, [strUserId], (err, rows) => {
        if (err) {
            console.error('Error fetching enrollments:', err)
            return res.status(500).json({ error: 'Error fetching enrollments' })
        }
        res.json(rows)
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
    body('type').isIn(['quiz', 'survey', 'review']),
    body('startTime').isISO8601(),
    body('endTime').isISO8601().withMessage('Valid Due Date is required'),
    body('visibility').isIn(['public', 'private']).withMessage('Visibility must be public or private'),
    body('questions').isArray({ min: 1 }).withMessage('At least one question is required')
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.error('Validation errors creating assessment:', errors.array());
        const specificError = errors.array().map(e => `${e.param}: ${e.msg}`).join(', ');
        return res.status(400).json({ error: `Validation failed: ${specificError}` });
    }

    const { courseId, name, type, startTime, endTime, visibility, questions } = req.body;
    const assessmentId = uuidv4();

    console.log('Received assessment data:', req.body);

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.run(
            'INSERT INTO tbl_assessments (assessment_id, course_id, user_id, name, type, start_time, end_time, visibility, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [assessmentId, courseId, req.user.user_id, name, type, startTime, endTime, visibility, 'pending'],
            (err) => {
                if (err) {
                    console.error('Error inserting into tbl_assessments:', err);
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error creating assessment record' });
                }

                console.log('Assessment record created:', assessmentId);

                const stmt = db.prepare(
                    'INSERT INTO tbl_assessment_questions (assessment_question_id, assessment_id, question_type, question_text, options) VALUES (?, ?, ?, ?, ?)'
                );

                let questionInsertError = null;
                questions.forEach((question, index) => {
                    if (!question.type || !question.text) {
                        questionInsertError = `Question ${index + 1} is missing type or text.`;
                        return;
                    }
                    const questionId = uuidv4();
                    const optionsJson = question.options ? JSON.stringify(question.options) : '[]';
                    
                    console.log(`Inserting question ${index + 1}:`, { questionId, assessmentId, type: question.type, text: question.text, options: optionsJson });

                    stmt.run(
                        questionId,
                        assessmentId,
                        question.type,
                        question.text,
                        optionsJson,
                        (err) => {
                            if (err) {
                                console.error(`Error inserting question ${index + 1}:`, err);
                                questionInsertError = `Error inserting question ${index + 1}.`;
                            }
                        }
                    );
                });

                stmt.finalize((err) => {
                    if (err) {
                        console.error('Error finalizing statement:', err);
                        if (!questionInsertError) questionInsertError = 'Error finalizing question insertion.';
                    }

                    if (questionInsertError) {
                        console.error('Rolling back due to question insertion error:', questionInsertError);
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: questionInsertError });
                    }

                    db.run('COMMIT', (err) => {
                        if (err) {
                            console.error('Error committing transaction:', err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Error finalizing assessment creation' });
                        }
                        console.log('Assessment created successfully:', assessmentId);
                        res.status(201).json({ message: 'Assessment created successfully', assessmentId });
                    });
                });
            }
        );
    });
});

// Add endpoint to fetch assessments for a teacher
app.get('/api/assessments/teacher', authenticateUser, (req, res) => {
    if (req.user.user_type !== 'teacher') {
        return res.status(403).json({ error: 'Only instructors can view their assessments' });
    }

    const teacherUserId = req.user.user_id;

    const query = `
        SELECT 
            a.assessment_id, 
            a.name AS review_name, 
            a.type, 
            a.status,
            a.visibility,
            a.start_time, 
            a.end_time, 
            c.course_name, 
            c.course_number,
            (SELECT COUNT(*) FROM tbl_assessment_responses WHERE assessment_id = a.assessment_id) AS response_count
        FROM tbl_assessments a
        JOIN tbl_courses c ON a.course_id = c.course_id
        WHERE a.user_id = ?
        ORDER BY a.end_time DESC;
    `;

    db.all(query, [teacherUserId], (err, assessments) => {
        if (err) {
            console.error('Error fetching teacher assessments:', err);
            return res.status(500).json({ error: 'Database error fetching assessments' });
        }
        res.json(assessments);
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

// Endpoint for teacher student reports (averages)
app.get('/api/reports/teacher/students', authenticateUser, (req, res) => {
    if (req.user.user_type !== 'teacher') {
        return res.status(403).json({ error: 'Only instructors can view student reports' });
    }

    const teacherUserId = req.user.user_id;

    // This query calculates the average numeric response for each student 
    // enrolled in any course taught by the requesting teacher, 
    // considering only public responses to assessments created by that teacher.
    const query = `
        SELECT 
            u.user_id,
            u.first_name,
            u.last_name,
            AVG(CASE WHEN ar.response_text GLOB '*[0-9]*' THEN CAST(ar.response_text AS REAL) ELSE NULL END) as average_score
        FROM tbl_users u
        -- Join to find students enrolled in the teacher's courses
        JOIN tbl_enrollments e ON u.user_id = e.user_id
        JOIN tbl_courses c ON e.course_id = c.course_id
        -- Join to get responses linked to assessments created by the teacher
        JOIN tbl_assessments a ON c.course_id = a.course_id
        LEFT JOIN tbl_assessment_responses ar ON u.user_id = ar.user_id AND a.assessment_id = ar.assessment_id
        WHERE 
            a.user_id = ? -- Filter assessments created by the teacher
            AND u.user_type = 'student' -- Only include students
            AND (
                ar.visibility = 'public' -- Only consider public responses
                OR ar.assessment_response_id IS NULL -- Include students even if they have no responses yet
            )
        GROUP BY u.user_id, u.first_name, u.last_name
        ORDER BY u.last_name, u.first_name;
    `;

    console.log('Executing student report query for teacher:', teacherUserId);
    db.all(query, [teacherUserId], (err, results) => {
        if (err) {
            console.error('SQL Error fetching student report data:', err);
            // Ensure JSON response even on error
            return res.status(500).json({ error: 'Database error fetching student reports', details: err.message });
        }

        // Format results (handle null averages, format percentage)
        const formattedResults = results.map(student => ({
            studentId: student.user_id,
            firstName: student.first_name,
            lastName: student.last_name,
            average: student.average_score !== null ? `${student.average_score.toFixed(1)}%` : 'N/A' // Format as percentage or N/A
        }));

        res.json(formattedResults);
    });
});

// Add verification endpoint for sessions
app.get('/api/auth/verify', (req, res) => {
    let strSessionId = req.headers['session-id'];
    if (!strSessionId) {
        return res.status(401).json({ error: 'Session ID required' });
    }

    let strQuery = `
        SELECT u.* 
        FROM tbl_users u
        JOIN tbl_sessions s ON u.user_id = s.user_id
        WHERE s.session_id = ? AND s.status = 'active'
    `;
    
    db.get(strQuery, [strSessionId], (err, user) => {
        if (err) {
            console.error('Database error during session verification:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        // Update session last used time
        db.run('UPDATE tbl_sessions SET last_used_datetime = CURRENT_TIMESTAMP WHERE session_id = ?', [strSessionId], (err) => {
            if (err) {
                console.error('Error updating session timestamp:', err);
            }
        });

        // Session is valid
        res.status(200).json({ valid: true });
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Something broke!' });
});

// Start server
const server = app.listen(HTTP_PORT, () => {
    console.log(`Server running on port ${HTTP_PORT}`);
});

// Handle server errors
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${HTTP_PORT} is already in use`);
        process.exit(1);
    } else {
        console.error('Server error:', error);
    }
});

// Keep process running
setInterval(() => {
    console.log('Server is still running...');
}, 60000); // Log every minute to keep process alive
