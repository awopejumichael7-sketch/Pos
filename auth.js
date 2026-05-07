// ============================================
// AUTHENTICATION SYSTEM
// ============================================

class AuthSystem {
  constructor() {
    this.currentUser = null;
    this.sessionTimeout = null;
    this.SESSION_DURATION = 30 * 60 * 1000; // 30 minutes
    this.init();
  }

  /**
   * Initialize authentication system
   */
  init() {
    // Check for existing session
    this.checkExistingSession();
    
    // Setup login form
    this.setupLoginForm();
    
    // Setup logout functionality
    this.setupLogout();
    
    // Setup session timeout
    this.startSessionTimer();
    
    // Protect routes
    this.protectRoutes();
    
    // Setup theme
    this.loadTheme();
  }

  /**
   * Default login credentials
   */
  getDefaultCredentials() {
    return {
      admin: {
        username: 'admin',
        password: 'admin123',
        role: 'Admin',
        permissions: ['all']
      },
      sales: {
        username: 'sales',
        password: 'sales123',
        role: 'Sales Representative',
        permissions: ['view_products', 'create_sales', 'view_receipts']
      }
    };
  }

  /**
   * Check for existing valid session
   */
  checkExistingSession() {
    const sessionData = localStorage.getItem('session');
    
    if (sessionData) {
      try {
        const session = JSON.parse(sessionData);
        const now = new Date().getTime();
        
        // Check if session is still valid
        if (session.expiry && now < session.expiry) {
          this.currentUser = session.user;
          this.redirectBasedOnRole();
        } else {
          // Session expired
          localStorage.removeItem('session');
          this.redirectToLogin();
        }
      } catch (error) {
        console.error('Session parsing error:', error);
        localStorage.removeItem('session');
      }
    } else {
      // Check legacy format
      const legacyUser = localStorage.getItem('currentUser');
      if (legacyUser) {
        try {
          const user = JSON.parse(legacyUser);
          if (user && user.isAuthenticated) {
            this.createSession(user);
            this.redirectBasedOnRole();
          }
        } catch (error) {
          localStorage.removeItem('currentUser');
        }
      }
    }
  }

  /**
   * Setup login form event listeners
   */
  setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin();
    });

    // Add input validation on blur
    const inputs = loginForm.querySelectorAll('input');
    inputs.forEach(input => {
      input.addEventListener('blur', () => this.validateInput(input));
      input.addEventListener('input', () => this.clearError());
    });
  }

  /**
   * Validate individual input fields
   */
  validateInput(input) {
    const value = input.value.trim();
    
    if (!value) {
      this.showInputError(input, 'This field is required');
      return false;
    }
    
    if (input.id === 'username' && value.length < 3) {
      this.showInputError(input, 'Username must be at least 3 characters');
      return false;
    }
    
    if (input.id === 'password' && value.length < 6) {
      this.showInputError(input, 'Password must be at least 6 characters');
      return false;
    }
    
    this.clearInputError(input);
    return true;
  }

  /**
   * Handle login form submission
   */
  async handleLogin() {
    const username = document.getElementById('username')?.value?.trim();
    const password = document.getElementById('password')?.value;

    // Validate inputs
    if (!username || !password) {
      this.showError('Please enter both username and password');
      return;
    }

    // Show loading state
    this.toggleLoading(true);
    this.clearError();

    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 800));

      // Validate credentials
      const credentials = this.getDefaultCredentials();
      const user = credentials[username.toLowerCase()];

      if (!user || user.password !== password) {
        throw new Error('Invalid credentials');
      }

      // Create user object
      const userData = {
        username: user.username,
        role: user.role,
        permissions: user.permissions,
        loginTime: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        isAuthenticated: true
      };

      // Create session
      this.createSession(userData);
      
      // Save to Firestore for tracking
      await this.logLoginActivity(userData);
      
      // Show success message
      this.showSuccess('Login successful! Redirecting...');
      
      // Redirect after brief delay
      setTimeout(() => {
        this.redirectBasedOnRole();
      }, 500);

    } catch (error) {
      console.error('Login error:', error);
      this.showError(error.message || 'Login failed. Please try again.');
    } finally {
      this.toggleLoading(false);
    }
  }

  /**
   * Create secure session
   */
  createSession(userData) {
    const session = {
      user: userData,
      created: new Date().getTime(),
      expiry: new Date().getTime() + this.SESSION_DURATION,
      token: this.generateSessionToken()
    };

    localStorage.setItem('session', JSON.stringify(session));
    // Also maintain legacy support
    localStorage.setItem('currentUser', JSON.stringify(userData));
    
    this.currentUser = userData;
    this.startSessionTimer();
  }

  /**
   * Generate random session token
   */
  generateSessionToken() {
    return 'session_' + Math.random().toString(36).substr(2) + Date.now().toString(36);
  }

  /**
   * Log login activity to Firestore
   */
  async logLoginActivity(userData) {
    try {
      await db.collection('login_activity').add({
        username: userData.username,
        role: userData.role,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language
      });
    } catch (error) {
      console.warn('Failed to log activity:', error);
      // Non-critical, continue without logging
    }
  }

  /**
   * Redirect user based on role
   */
  redirectBasedOnRole() {
    const user = this.currentUser || JSON.parse(localStorage.getItem('currentUser'));
    
    if (!user) {
      this.redirectToLogin();
      return;
    }

    const currentPage = window.location.pathname.split('/').pop();
    
    // Determine target page based on role
    let targetPage = 'dashboard.html';
    if (user.role === 'Sales Representative') {
      targetPage = 'sales.html';
    }

    // Only redirect if not already on the correct page
    if (currentPage !== targetPage && 
        currentPage !== 'index.html' && 
        currentPage !== '') {
      window.location.href = targetPage;
    } else if (currentPage === 'login.html') {
      window.location.href = targetPage;
    }
  }

  /**
   * Redirect to login page
   */
  redirectToLogin() {
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage !== 'login.html' && currentPage !== '') {
      window.location.href = 'login.html';
    }
  }

  /**
   * Setup logout functionality
   */
  setupLogout() {
    document.addEventListener('click', (e) => {
      if (e.target.id === 'logoutBtn' || e.target.closest('#logoutBtn')) {
        e.preventDefault();
        this.logout();
      }
    });
  }

  /**
   * Logout user
   */
  async logout() {
    try {
      // Log logout activity
      if (this.currentUser) {
        await db.collection('login_activity').add({
          username: this.currentUser.username,
          role: this.currentUser.role,
          action: 'logout',
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {}); // Ignore errors
      }
    } finally {
      // Clear all session data
      localStorage.removeItem('session');
      localStorage.removeItem('currentUser');
      this.currentUser = null;
      
      // Clear session timeout
      if (this.sessionTimeout) {
        clearTimeout(this.sessionTimeout);
      }
      
      // Redirect to login
      window.location.href = 'login.html';
    }
  }

  /**
   * Start session timeout timer
   */
  startSessionTimer() {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
    }

    this.sessionTimeout = setTimeout(() => {
      this.showSessionExpired();
    }, this.SESSION_DURATION);
  }

  /**
   * Show session expired notification
   */
  showSessionExpired() {
    this.showToast('Session expired. Please login again.', 'warning');
    setTimeout(() => {
      this.logout();
    }, 2000);
  }

  /**
   * Protect routes based on authentication
   */
  protectRoutes() {
    const currentPage = window.location.pathname.split('/').pop();
    const publicPages = ['login.html', 'index.html', ''];
    
    // Allow public pages
    if (publicPages.includes(currentPage)) {
      return;
    }

    // Check authentication
    const user = JSON.parse(localStorage.getItem('currentUser'));
    
    if (!user || !user.isAuthenticated) {
      this.redirectToLogin();
      return;
    }

    // Protect admin pages
    if (currentPage === 'dashboard.html' && user.role !== 'Admin') {
      window.location.href = 'sales.html';
      return;
    }

    // Protect inventory page
    if (currentPage === 'inventory.html' && user.role !== 'Admin') {
      window.location.href = 'sales.html';
      return;
    }

    // Protect reports page
    if (currentPage === 'reports.html' && user.role !== 'Admin') {
      window.location.href = 'sales.html';
      return;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    const user = this.currentUser || JSON.parse(localStorage.getItem('currentUser'));
    return user && user.isAuthenticated;
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    if (!this.currentUser) {
      const saved = localStorage.getItem('currentUser');
      if (saved) {
        this.currentUser = JSON.parse(saved);
      }
    }
    return this.currentUser;
  }

  /**
   * Check if user has specific role
   */
  hasRole(role) {
    const user = this.getCurrentUser();
    return user && user.role === role;
  }

  /**
   * Show error message
   */
  showError(message) {
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
      errorDiv.classList.add('animate-fade-in');
      
      // Auto hide after 5 seconds
      setTimeout(() => {
        errorDiv.style.display = 'none';
        errorDiv.classList.remove('animate-fade-in');
      }, 5000);
    }
  }

  /**
   * Clear error message
   */
  clearError() {
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
      errorDiv.style.display = 'none';
      errorDiv.textContent = '';
    }
  }

  /**
   * Show input error
   */
  showInputError(input, message) {
    input.style.borderColor = '#ef4444';
    const errorSpan = input.parentElement.querySelector('.input-error');
    if (errorSpan) {
      errorSpan.textContent = message;
    } else {
      const span = document.createElement('span');
      span.className = 'input-error';
      span.style.cssText = 'color: #ef4444; font-size: 12px; margin-top: 4px; display: block;';
      span.textContent = message;
      input.parentElement.appendChild(span);
    }
  }

  /**
   * Clear input error
   */
  clearInputError(input) {
    input.style.borderColor = '';
    const errorSpan = input.parentElement.querySelector('.input-error');
    if (errorSpan) {
      errorSpan.remove();
    }
  }

  /**
   * Toggle loading state
   */
  toggleLoading(show) {
    const spinner = document.getElementById('loginSpinner');
    const submitBtn = document.querySelector('#loginForm button[type="submit"]');
    
    if (spinner) {
      spinner.style.display = show ? 'inline-block' : 'none';
    }
    
    if (submitBtn) {
      submitBtn.disabled = show;
      if (show) {
        submitBtn.dataset.originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="spinner"></span> Signing in...';
      } else {
        submitBtn.innerHTML = submitBtn.dataset.originalText || 'Sign In';
      }
    }
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    this.showToast(message, 'success');
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    // Remove existing toasts
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
      <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      toast.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Load theme preference
   */
  loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
}

// Initialize auth system
const authSystem = new AuthSystem();

// Export for use in other modules
window.authSystem = authSystem;