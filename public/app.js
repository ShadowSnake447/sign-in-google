let currentClientId = '';
let currentUser = null;

const statusBadge = document.getElementById('statusBadge');
const setupNotice = document.getElementById('setupNotice');
const manualClientIdInput = document.getElementById('manualClientId');
const applyClientIdBtn = document.getElementById('applyClientIdBtn');
const loggedOutSection = document.getElementById('loggedOutSection');
const loggedInSection = document.getElementById('loggedInSection');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const userPicture = document.getElementById('userPicture');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const userId = document.getElementById('userId');
const toggleDetailsBtn = document.getElementById('toggleDetailsBtn');
const claimsJson = document.getElementById('claimsJson');
const signOutBtn = document.getElementById('signOutBtn');
const toastEl = document.getElementById('toast');

// Display toast message
function showToast(message, duration = 3500) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

// Fetch server configuration
async function checkServerConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();

    if (data.isConfigured && data.clientId) {
      currentClientId = data.clientId;
      statusBadge.textContent = 'Server Configured';
      statusBadge.className = 'badge badge-success';
      setupNotice.style.display = 'none';
      setupGoogleIdentity(currentClientId);
    } else {
      statusBadge.textContent = 'Setup Required';
      statusBadge.className = 'badge badge-warning';
      setupNotice.style.display = 'flex';
      if (data.clientId) {
        manualClientIdInput.value = data.clientId;
      }
    }
  } catch (err) {
    console.error('Failed to query /api/config', err);
    statusBadge.textContent = 'Standalone Mode';
    setupNotice.style.display = 'flex';
  }
}

// Ensure the Google Identity Services SDK is loaded
function waitForGoogleScript(callback, attempts = 0) {
  if (window.google && window.google.accounts && window.google.accounts.id) {
    callback();
  } else if (attempts < 50) {
    setTimeout(() => waitForGoogleScript(callback, attempts + 1), 100);
  } else {
    showToast('Failed to load Google Identity Services SDK. Check your internet connection.');
  }
}

// Initialize Google Identity Services
function setupGoogleIdentity(clientId) {
  if (!clientId || clientId.trim() === '' || clientId.includes('your-google-client-id')) {
    showToast('Please provide a valid Google Client ID.');
    return;
  }

  waitForGoogleScript(() => {
    try {
      google.accounts.id.initialize({
        client_id: clientId.trim(),
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });

      // Render the official Google Sign-In button
      googleSignInBtn.innerHTML = '';
      google.accounts.id.renderButton(googleSignInBtn, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        shape: 'rectangular',
        text: 'signin_with',
        logo_alignment: 'left',
        width: 280
      });

      // Display One Tap prompt if supported
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          console.log('One Tap prompt not displayed:', notification.getNotDisplayedReason());
        } else if (notification.isSkippedMoment()) {
          console.log('One Tap skipped:', notification.getSkippedReason());
        } else if (notification.isDismissedMoment()) {
          console.log('One Tap dismissed:', notification.getDismissedReason());
        }
      });

      showToast('Google Sign-In ready!');
    } catch (err) {
      console.error('Error initializing Google Identity:', err);
      showToast('Initialization error: ' + err.message);
    }
  });
}

// Callback when user signs in with Google
async function handleCredentialResponse(response) {
  console.log('Google Credential received');
  showToast('Verifying token with backend server...');

  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ credential: response.credential })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      currentUser = data.user;
      displayUserProfile(data.user);
      showToast(`Welcome, ${data.user.name || data.user.email}!`);
    } else {
      // Decode JWT locally for demo display if backend verification failed (e.g. mismatched client ID in .env)
      console.warn('Backend verification failed:', data.error);
      const decoded = parseJwt(response.credential);
      if (decoded) {
        showToast('Note: Backend verification failed (check Client ID), showing client claims.');
        displayUserProfile({
          name: decoded.name || 'User',
          email: decoded.email || 'No email',
          picture: decoded.picture || '',
          id: decoded.sub || '',
          emailVerified: decoded.email_verified || false,
          _rawClaims: decoded,
          _verificationError: data.error || 'Server error'
        });
      } else {
        alert('Authentication failed: ' + (data.error || 'Unknown error'));
      }
    }
  } catch (err) {
    console.error('Error calling /api/auth/google:', err);
    // Fallback: decode JWT on client for demo preview
    const decoded = parseJwt(response.credential);
    if (decoded) {
      showToast('Network error verifying token; displayed from token claims.');
      displayUserProfile({
        name: decoded.name,
        email: decoded.email,
        picture: decoded.picture,
        id: decoded.sub,
        emailVerified: decoded.email_verified,
        _rawClaims: decoded
      });
    }
  }
}

// Client-side helper to decode JWT payload safely
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// Display authenticated user information
function displayUserProfile(user) {
  userName.textContent = user.name || 'Anonymous User';
  userEmail.textContent = user.email || 'No email provided';
  userId.textContent = `ID: ${user.id ? user.id.substring(0, 12) + '...' : 'N/A'}`;

  if (user.picture) {
    userPicture.src = user.picture;
    userPicture.style.display = 'block';
  } else {
    userPicture.style.display = 'none';
  }

  claimsJson.textContent = JSON.stringify(user, null, 2);

  loggedOutSection.style.display = 'none';
  loggedInSection.style.display = 'block';
}

// Sign out handler
function handleSignOut() {
  if (window.google && window.google.accounts && window.google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  currentUser = null;
  loggedInSection.style.display = 'none';
  loggedOutSection.style.display = 'block';
  showToast('You have been signed out.');
}

// Event Listeners
applyClientIdBtn.addEventListener('click', () => {
  const customId = manualClientIdInput.value.trim();
  if (customId) {
    currentClientId = customId;
    statusBadge.textContent = 'Client-Side Key Set';
    statusBadge.className = 'badge badge-success';
    setupGoogleIdentity(customId);
  } else {
    showToast('Please enter a Google Client ID');
  }
});

signOutBtn.addEventListener('click', handleSignOut);

toggleDetailsBtn.addEventListener('click', () => {
  const isHidden = claimsJson.style.display === 'none';
  claimsJson.style.display = isHidden ? 'block' : 'none';
  toggleDetailsBtn.querySelector('.arrow').textContent = isHidden ? '▲' : '▼';
});

// Boot check
checkServerConfig();
