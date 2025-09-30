/**
 * SMS Tutorial Application
 * This application demonstrates OAuth 2.0 authentication and SMS sending using the GoTo API
 */

// Load environment variables from .env file into process.env
require("dotenv").config();

// Import OAuth 2.0 authorization code flow handler from simple-oauth2 library
var { AuthorizationCode } = require("simple-oauth2");

// Import crypto module for generating secure random strings
var crypto = require("crypto");

// Import Express.js web framework for creating HTTP server
var express = require("express");

// Import Axios HTTP client library for making API requests
var axios = require("axios").default;

// Import child_process module for executing system commands (to kill processes on ports)
var { exec } = require("child_process");

// Validate required environment variables
// Define an array of environment variables that must be present for the app to function
const requiredEnvVars = ['OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'OAUTH_SERVICE_URL', 'OAUTH_REDIRECT_URI'];

// Loop through each required environment variable
for (const envVar of requiredEnvVars) {
    // Check if the environment variable is missing or empty
    if (!process.env[envVar]) {
        // Log error message and exit the application if any required variable is missing
        console.error(`Missing required environment variable: ${envVar}`);
        process.exit(1); // Exit with error code 1
    }
}

/**
 * Function to kill any process running on a specific port
 * This prevents "port already in use" errors when starting the server
 * @param {number} port - The port number to check and clear
 * @returns {Promise} - Promise that resolves when all processes are killed
 */
function killProcessOnPort(port) {
    // Return a Promise to handle the asynchronous process killing
    return new Promise((resolve) => {
        // Execute 'lsof -ti :port' command to find process IDs using the specified port
        exec(`lsof -ti :${port}`, (error, stdout, stderr) => {
            // If there's an error or no output, no processes are using this port
            if (error || !stdout.trim()) {
                console.log(`No process found on port ${port}`);
                resolve(); // Resolve the promise since there's nothing to kill
                return;
            }
            
            // Split the output into individual process IDs (one per line)
            const pids = stdout.trim().split('\n');
            let killCount = 0; // Counter to track how many processes we've attempted to kill
            
            // Loop through each process ID and kill it
            pids.forEach(pid => {
                // Check if the PID is not empty after trimming whitespace
                if (pid.trim()) {
                    // Execute 'kill -9 pid' command to forcefully terminate the process
                    exec(`kill -9 ${pid.trim()}`, (killError) => {
                        // Check if the kill command was successful
                        if (!killError) {
                            console.log(`Killed process ${pid.trim()} on port ${port}`);
                        } else {
                            console.log(`Failed to kill process ${pid.trim()}: ${killError.message}`);
                        }
                        killCount++; // Increment the counter
                        // If we've processed all PIDs, resolve the promise
                        if (killCount === pids.length) {
                            resolve();
                        }
                    });
                }
            });
        });
    });
}

// Configure OAuth 2.0 client settings using environment variables
var oauthConfig = {
    client: {
        id: process.env.OAUTH_CLIENT_ID,        // OAuth client ID from environment
        secret: process.env.OAUTH_CLIENT_SECRET  // OAuth client secret from environment
    },
    auth: {
        tokenHost: process.env.OAUTH_SERVICE_URL // OAuth authorization server URL
    }
};

// Create an OAuth 2.0 Authorization Code client instance
var oauthClient = new AuthorizationCode(oauthConfig);

// In-memory store for OAuth state tokens (in production, use Redis or database)
// This Map stores state tokens to prevent CSRF attacks
var pendingStates = new Map();

// Token storage (in production, use Redis or database)
var tokenStorage = {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    
    // Store tokens with expiration time
    setTokens(tokenResponse) {
        this.accessToken = tokenResponse.token.access_token;
        this.refreshToken = tokenResponse.token.refresh_token;
        // Calculate expiration time (subtract 60 seconds for safety margin)
        const expiresIn = tokenResponse.token.expires_in || 3600;
        this.expiresAt = Date.now() + ((expiresIn - 60) * 1000);
        console.log(`Tokens stored. Expires in ${expiresIn} seconds`);
    },
    
    // Check if access token is valid and not expired
    isTokenValid() {
        return this.accessToken && this.expiresAt && Date.now() < this.expiresAt;
    },
    
    // Get current access token
    getAccessToken() {
        return this.isTokenValid() ? this.accessToken : null;
    },
    
    // Clear all tokens
    clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
        this.expiresAt = null;
        console.log('Tokens cleared');
    }
};

/**
 * Function to refresh access token using refresh token
 * @returns {Promise<string|null>} - Returns access token if successful, null if failed
 */
async function refreshAccessToken() {
    if (!tokenStorage.refreshToken) {
        console.log('No refresh token available');
        return null;
    }
    
    try {
        console.log('Refreshing access token...');
        const tokenResponse = await oauthClient.getToken({
            grant_type: 'refresh_token',
            refresh_token: tokenStorage.refreshToken
        });
        
        tokenStorage.setTokens(tokenResponse);
        console.log('Access token refreshed successfully');
        return tokenStorage.getAccessToken();
    } catch (error) {
        console.error('Failed to refresh token:', error.message);
        tokenStorage.clearTokens();
        return null;
    }
}

/**
 * Function to get a valid access token (refresh if needed)
 * @returns {Promise<string|null>} - Returns valid access token or null if authentication needed
 */
async function getValidAccessToken() {
    // Check if current token is valid
    if (tokenStorage.isTokenValid()) {
        return tokenStorage.getAccessToken();
    }
    
    // Try to refresh the token
    return await refreshAccessToken();
}

/**
 * Function to generate authorization URL with unique state token
 * Each authorization request gets a unique state to prevent CSRF attacks
 * @returns {Object} - Object containing the authorization URL and state token
 */
function generateAuthUrl() {
    // Generate a cryptographically secure random 15-byte string as hex
    var state = crypto.randomBytes(15).toString('hex');
    
    // Store the state token with current timestamp for later validation
    pendingStates.set(state, { timestamp: Date.now() });
    
    // Generate the OAuth authorization URL with required parameters
    var authorizationUrl = oauthClient.authorizeURL({
        redirect_uri: process.env.OAUTH_REDIRECT_URI, // Where to redirect after authorization
        scope: 'messaging.v1.send',                   // Requested OAuth scope for SMS sending
        state: state                                  // CSRF protection token
    });
    
    // Return both the URL and state for external use
    return { url: authorizationUrl, state: state };
}

// Generate initial authorization URL for manual testing
var { url: authorizationUrl } = generateAuthUrl();
console.log('Open in browser to send a SMS: ', authorizationUrl);

// Create Express.js application instance
var app = express();

// Middleware for CORS (Cross-Origin Resource Sharing)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Middleware to parse JSON request bodies
app.use(express.json());

// Serve static files (including index.html)
app.use(express.static(__dirname));

/**
 * OAuth callback endpoint - handles the redirect from the authorization server
 * This endpoint receives the authorization code and exchanges it for an access token
 * Then uses the token to send an SMS message
 */
app.get('/login/oauth2/code/goto', async function (req, res) {
    try {
        // Extract the state parameter from the query string
        const receivedState = req.query.state;
        
        // Validate that the state exists and matches one we generated (CSRF protection)
        if (!receivedState || !pendingStates.has(receivedState)) {
            console.log('Ignoring authorization code with invalid or missing state');
            // Return 403 Forbidden with error message
            return res.status(403).json({ error: 'Invalid state parameter' });
        }
        
        // Remove the used state token to prevent replay attacks
        pendingStates.delete(receivedState);
        
        // Extract the authorization code from the query string
        const authorizationCode = req.query.code;
        
        // Validate that the authorization code is present
        if (!authorizationCode) {
            console.log('Missing authorization code');
            // Return 400 Bad Request with error message
            return res.status(400).json({ error: 'Missing authorization code' });
        }
        
        // Prepare parameters for token exchange
        var tokenParams = {
            code: authorizationCode,                      // The authorization code received
            redirect_uri: process.env.OAUTH_REDIRECT_URI, // Must match the original redirect URI
            scope: 'messaging.v1.send'                    // Requested scope
        };
        
        // Initialize token response variable
        var tokenResponse = null;
        
        try {
            // Exchange authorization code for access token
            tokenResponse = await oauthClient.getToken(tokenParams);
            
            // Store the tokens for future use
            tokenStorage.setTokens(tokenResponse);
        } catch (error) {
            // Log the error and return 500 Internal Server Error
            console.log('Access Token Error', error.message);
            return res.status(500).json({ error: 'Failed to obtain access token' });
        }
        
        // Extract the access token from the response
        var accessToken = tokenResponse.token.access_token;
        
        // Configure phone numbers and message content from environment variables with fallbacks
        const ownerPhone = process.env.OWNER_PHONE_NUMBER || '+15625791776';           // Sender's phone number
        const contactPhone = process.env.CONTACT_PHONE_NUMBER || '+17143059601';       // Recipient's phone number
        const messageBody = process.env.SMS_MESSAGE || 'Congratulations! You have successfully completed the tutorial!'; // SMS content
        
        // Configure HTTP request options for SMS API call
        var options = {
            method: 'POST',                                    // HTTP method for sending SMS
            url: 'https://api.jive.com/messaging/v1/messages', // GoTo SMS API endpoint
            headers: {
                Authorization: `Bearer ${accessToken}`,        // OAuth bearer token for authentication
                'content-type': 'application/json'             // Request content type
            },
            data: {
                ownerPhoneNumber: ownerPhone,        // The phone number sending the SMS
                contactPhoneNumbers: [contactPhone], // Array of recipient phone numbers
                body: messageBody                    // The SMS message content
            }
        };

        try {
            // Send the SMS using Axios HTTP client
            const response = await axios.request(options);
            
            // Log successful SMS sending with response data
            console.log('SMS sent successfully:', response.data);
            
            // Return success response to the client
            res.status(200).json({ 
                success: true, 
                message: 'SMS sent successfully',
                data: response.data 
            });
        } catch (error) {
            // Log SMS sending failure with error details
            console.error('SMS sending failed:', error.response?.data || error.message);
            
            // Return error response to the client
            res.status(500).json({ 
                error: 'Failed to send SMS',
                details: error.response?.data || error.message 
            });
        }
        
    } catch (error) {
        // Catch any unexpected errors in the entire function
        console.error('Unexpected error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * API endpoint to send SMS messages
 * Accepts JSON with from, to, and message fields
 * Uses stored access token or returns error if authentication needed
 */
app.post('/api/send-sms', async (req, res) => {
    try {
        // Extract SMS parameters from request body
        const { from, to, message } = req.body;
        
        // Validate required fields
        if (!from || !to || !message) {
            return res.status(400).json({ 
                error: 'Missing required fields: from, to, message' 
            });
        }
        
        // Validate phone number format (basic E.164 check)
        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        if (!phoneRegex.test(from) || !phoneRegex.test(to)) {
            return res.status(400).json({ 
                error: 'Phone numbers must be in E.164 format (e.g., +15551234567)' 
            });
        }
        
        // Get a valid access token
        const accessToken = await getValidAccessToken();
        if (!accessToken) {
            return res.status(401).json({ 
                error: 'Authentication required. Please complete OAuth flow first.',
                authUrl: generateAuthUrl().url
            });
        }
        
        // Configure HTTP request options for SMS API call
        const options = {
            method: 'POST',
            url: 'https://api.jive.com/messaging/v1/messages',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'content-type': 'application/json'
            },
            data: {
                ownerPhoneNumber: from,
                contactPhoneNumbers: [to],
                body: message
            }
        };
        
        // Send the SMS using Axios HTTP client
        const response = await axios.request(options);
        
        // Log and return success response
        console.log('SMS sent successfully via API:', response.data);
        res.status(200).json({
            success: true,
            message: 'SMS sent successfully',
            id: response.data.id,
            data: response.data
        });
        
    } catch (error) {
        // Handle SMS API errors
        if (error.response && error.response.status === 401) {
            // Token expired or invalid, clear stored tokens
            tokenStorage.clearTokens();
            return res.status(401).json({
                error: 'Authentication expired. Please complete OAuth flow again.',
                authUrl: generateAuthUrl().url
            });
        }
        
        console.error('SMS API error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to send SMS',
            details: error.response?.data || error.message
        });
    }
});

/**
 * Endpoint to check authentication status
 * Returns whether user is authenticated and token info
 */
app.get('/api/auth-status', (req, res) => {
    const isAuthenticated = tokenStorage.isTokenValid();
    res.json({
        authenticated: isAuthenticated,
        tokenExpiry: tokenStorage.expiresAt ? new Date(tokenStorage.expiresAt).toISOString() : null,
        authUrl: isAuthenticated ? null : generateAuthUrl().url
    });
});

/**
 * Endpoint to manually trigger re-authentication
 * Clears stored tokens and returns new auth URL
 */
app.post('/api/re-authenticate', (req, res) => {
    tokenStorage.clearTokens();
    const { url } = generateAuthUrl();
    res.json({
        message: 'Tokens cleared. Please complete OAuth flow.',
        authUrl: url
    });
});

/**
 * Periodic cleanup of expired OAuth state tokens
 * This prevents memory leaks by removing old, unused state tokens
 * Runs every 5 minutes and removes tokens older than 10 minutes
 */
setInterval(() => {
    const now = Date.now();                               // Get current timestamp
    
    // Iterate through all stored state tokens
    for (const [state, data] of pendingStates.entries()) {
        // Check if the token is older than 10 minutes (10 * 60 * 1000 milliseconds)
        if (now - data.timestamp > 10 * 60 * 1000) {
            pendingStates.delete(state);                  // Remove expired token
        }
    }
}, 5 * 60 * 1000); // Execute this cleanup every 5 minutes

/**
 * Endpoint to generate a new authorization URL
 * Useful for getting fresh authorization URLs without restarting the server
 */
app.get('/auth/new', (req, res) => {
    // Generate a new authorization URL and state token
    const { url, state } = generateAuthUrl();
    
    // Return the new URL and state as JSON
    res.json({ authUrl: url, state: state });
});

/**
 * Health check endpoint
 * Returns server status and current timestamp for monitoring purposes
 */
app.get('/health', (req, res) => {
    // Return health status with current ISO timestamp
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get the port number from environment variable, default to 5000
const port = process.env.PORT || 5000;

/**
 * Async function to start the server
 * First kills any existing processes on the target port, then starts the Express server
 */
async function startServer() {
    // Check for and kill any existing processes using our target port
    console.log(`Checking for existing processes on port ${port}...`);
    await killProcessOnPort(port);
    
    // Start the Express server on the specified port
    app.listen(port, () => {
        // Log server startup information with helpful URLs
        console.log(`Server running on port ${port}`);
        console.log(`Health check: http://localhost:${port}/health`);
        console.log(`New auth URL: http://localhost:${port}/auth/new`);
    });
}

// Start the server by calling the async function
startServer();