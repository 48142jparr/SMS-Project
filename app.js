require("dotenv").config({ path: __dirname + '/.env' });
// Now you can access: process.env.OAUTH_CLIENT_ID, process.env.OAUTH_CLIENT_SECRET, etc.
var { AuthorizationCode } = require("simple-oauth2");
var crypto = require("crypto");
var express = require("express");
var axios = require("axios").default;

var oauthConfig = {
    client: {
        id: process.env.OAUTH_CLIENT_ID,
        secret: process.env.OAUTH_CLIENT_SECRET
    },
    auth: {
        tokenHost: process.env.OAUTH_SERVICE_URL,
        authorizePath: '/oauth/authorize',
        tokenPath: '/oauth/token'
    }
};
var oauthClient = new AuthorizationCode(oauthConfig);

var expectedStateForAuthorizationCode = crypto.randomBytes(15).toString('hex');
var authorizationUrl = oauthClient.authorizeURL({
    redirect_uri: process.env.OAUTH_REDIRECT_URI,
    scope: 'messaging.v1.send',
    state: expectedStateForAuthorizationCode
});
console.log('Open in browser to send a SMS: ', authorizationUrl);

var app = express();

// Add error handling for OAuth failures
app.get('/login/oauth2/code/goto', async function (req, res) {
    console.log('Received OAuth callback with query:', req.query);
    
    // Check for OAuth error
    if (req.query.error) {
        console.error('OAuth Error:', req.query.error);
        console.error('Error Description:', req.query.error_description);
        res.status(400).send(`OAuth Error: ${req.query.error} - ${req.query.error_description}`);
        return;
    }
    
    if (req.query.state != expectedStateForAuthorizationCode) {
        console.log('Ignoring authorization code with unexpected state');
        res.sendStatus(403);
        return;
    }
    
    res.sendStatus(200);
    var authorizationCode = req.query.code;
    var tokenParams = {
        code: authorizationCode,
        redirect_uri: process.env.OAUTH_REDIRECT_URI,
        scope: 'messaging.v1.send'
    };
    var tokenResponse = null;
    try {
        tokenResponse = await oauthClient.getToken(tokenParams);
    } catch (error) {
        console.log('Access Token Error', error.message);
        return;
    }
    var accessToken = tokenResponse.token.access_token;
    var options = {
        method: 'POST',
        url: 'https://api.jive.com/messaging/v1/messages',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json'
        },
        data: {
            ownerPhoneNumber: '+15625791776',
            contactPhoneNumbers: ['+17143059601'],
            body: 'Congratulations! You have successfully completed the tutorial!'
        }
    };

    axios.request(options).then(function (response) {
        console.log(response.data);
    }).catch(function (error) {
        console.error(error);
    });
});

app.listen(5000, () => {
    console.log('Server is running on port 5000');
});