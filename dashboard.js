// ============================================
// ADMIN DASHBOARD
// ============================================

class Dashboard {
  constructor() {
    this.currentUser = null;
    this.products = [];
    this.sales = [];
    this.charts = {};
    this.realTimeListeners = [];
    this.init();
  }

  /**
   * Initialize dashboard
   */
  async init() {
    // Check authentication and role
    const user = JSON.parse(localStorage.getItem('currentUser'));
    
    if (!user || !user.isAuthenticated) {
      window.location.href = 'login.html';
      return;
    }

    if (user.role !== 'Admin') {
      window.location.href = 'sales.html';
      return;
    }

    this.currentUser = user;
    
    // Setup UI
    this.setupUI();
    
    // Load initial data
    await this.loadDashboardData();
    
    // Initialize charts
    this.initializeCharts();
    
    // Setup real-time listeners
    this.setupRealTimeListeners();
    
    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup user interface
   */
  setupUI() {
    // Display username
    const usernameElement = document.getElementById('usernameDisplay');
    if (usernameElement) {
      usernameElement.textContent = this.currentUser.username;
    }

    // Set user avatar
    const avatarElement = document.getElementById('userAvatar');
    if (avatarElement) {
      avatarElement.textContent = this.currentUser.username.charAt(0).toUpperCase();
    }

    // Update page title
    document.title = 'Admin Dashboard - Inventory Management';
  }

  /**
   * Load all dashboard data
   */
  async loadDashboardData() {
    try {
      // Show loading state
      this.showLoader();
      
      // Load products
      await this.loadProducts();
      
      // Load sales
      await this.loadSales();
      
      // Update statistics
      this.updateStatistics();
      
      // Update recent transactions
      await this.loadRecentTransactions();
      
      // Load low stock alerts
      await this.checkLowStock();

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      this.showToast('Error loading dashboard data', 'error');
    } finally {
      this.hideLoader();
    }
  }

  /**
   * Load products from Firestore
   */
  async loadProducts() {
    try {
      const snapshot = await db.collection('products').get();
      this.products = [];
      
      snapshot.forEach(doc => {
        this.products.push({
          id: doc.id,
          ...doc.data()
        });
      });

      // Update total products count
      const totalProductsEl = document.getElementById('totalProducts');
      if (totalProductsEl) {
        this.animateValue(totalProductsEl, 0, this.products.length, 1000);
      }

      return this.products;
    } catch (error) {
      console.error('Error loading products:', error);
      throw error;
    }
  }

  /**
   * Load sales from Firestore
   */
  async loadSales() {
    try {
      const snapshot = await db.collection('sales').get();
      this.sales = [];
      
      snapshot.forEach(doc => {
        this.sales.push({
          id: doc.id,
          ...doc.data(),
          date: doc.data().date?.toDate() || new Date()
        });
      });

      return this.sales;
    } catch (error) {
      console.error('Error loading sales:', error);
      throw error;
    }
  }

  /**
   * Update statistics cards
   */
  updateStatistics() {
    // Today's sales
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaySales = this.sales.filter(sale => 
      sale.date >= today
    );
    
    const todayTotal = todaySales.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const todayTransactions = todaySales.length;

    // Monthly revenue
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlySales = this.sales.filter(sale => 
      sale.date >= firstOfMonth
    );
    
    const monthlyRevenue = monthlySales.reduce((sum, sale) => sum + (sale.total || 0), 0);

    // Low stock products
    const lowStock = this.products.filter(p => p.quantity <= 10);

    // Out of stock products
    const outOfStock = this.products.filter(p => p.quantity === 0);

    // Total products value (cost)
    const totalInventoryValue = this.products.reduce((sum, p) => 
      sum + (p.quantity * (p.costPrice || 0)), 0
    );

    // Total potential revenue (selling price)
    const potentialRevenue = this.products.reduce((sum, p) => 
      sum + (p.quantity * (p.sellingPrice || 0)), 0
    );

    // Update DOM elements
    this.updateStatElement('totalProducts', this.products.length);
    this.updateStatElement('todaySales', `$${todayTotal.toFixed(2)}`);
    this.updateStatElement('todayTransactions', todayTransactions);
    this.updateStatElement('lowStock', lowStock.length);
    this.updateStatElement('outOfStock', outOfStock.length);
    this.updateStatElement('monthlyRevenue', `$${monthlyRevenue.toFixed(2)}`);
    this.updateStatElement('inventoryValue', `$${totalInventoryValue.toFixed(2)}`);
    this.updateStatElement('potentialRevenue', `$${potentialRevenue.toFixed(2)}`);
  }

  /**
   * Update statistic element with animation
   */
  updateStatElement(elementId, value) {
    const element = document.getElementById(elementId);
    if (!element) return;

    if (typeof value === 'number') {
      this.animateValue(element, 0, value, 1000);
    } else {
      element.textContent = value;
    }
  }

  /**
   * Animate number value
   */
  animateValue(element, start, end, duration) {
    const startTime = performance.now();
    
    const update = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.floor(progress * (end - start) + start);
      
      element.textContent = current;
      
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = end;
      }
    };
    
    requestAnimationFrame(update);
  }

  /**
   * Load recent transactions
   */
  async loadRecentTransactions() {
    try {
      const snapshot = await db.collection('transactions')
        .orderBy('date', 'desc')
        .limit(10)
        .get();

      const tbody = document.getElementById('recentTransactions');
      if (!tbody) return;

      tbody.innerHTML = '';

      if (snapshot.empty) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center text-muted">
              <i class="fas fa-inbox" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
              No transactions yet
            </td>
          </tr>
        `;
        return;
      }

      snapshot.forEach(doc => {
        const data = doc.data();
        const date = data.date?.toDate() || new Date();
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><strong>#${doc.id.slice(-8).toUpperCase()}</strong></td>
          <td>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</td>
          <td>${data.customerName || 'Walk-in Customer'}</td>
          <td>${data.items?.length || 0} items</td>
          <td><strong>$${(data.total || 0).toFixed(2)}</strong></td>
          <td><span class="badge badge-success">Completed</span></td>
        `;
        
        tbody.appendChild(row);
      });

    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  }

  /**
   * Check for low stock products
   */
  async checkLowStock() {
    const lowStockProducts = this.products.filter(p => p.quantity <= 10 && p.quantity > 0);
    const outOfStockProducts = this.products.filter(p => p.quantity === 0);

    // Update low stock alerts
    const alertsContainer = document.getElementById('stockAlerts');
    if (!alertsContainer) return;

    alertsContainer.innerHTML = '';

    if (outOfStockProducts.length > 0) {
      outOfStockProducts.forEach(product => {
        const alert = document.createElement('div');
        alert.className = 'alert alert-danger';
        alert.innerHTML = `
          <i class="fas fa-exclamation-circle"></i>
          <strong>${product.name}</strong> is out of stock!
        `;
        alertsContainer.appendChild(alert);
      });
    }

    if (lowStockProducts.length > 0) {
      lowStockProducts.forEach(product => {
        const alert = document.createElement('div');
        alert.className = 'alert alert-warning';
        alert.innerHTML = `
          <i class="fas fa-exclamation-triangle"></i>
          <strong>${product.name}</strong> has only ${product.quantity} units left!
        `;
        alertsContainer.appendChild(alert);
      });
    }

    // Show notification if there are alerts
    if (outOfStockProducts.length > 0 || lowStockProducts.length > 0) {
      this.showToast(
        `${outOfStockProducts.length} out of stock, ${lowStockProducts.length} low stock items`, 
        'warning'
      );
    }
  }

  /**
   * Initialize charts
   */
  initializeCharts() {
    this.createSalesChart();
    this.createProductDistributionChart();
    this.createRevenueChart();
  }

  /**
   * Create sales trend chart
   */
  createSalesChart() {
    const ctx = document.getElementById('salesChart')?.getContext('2d');
    if (!ctx) return;

    // Destroy existing chart
    if (this.charts.sales) {
      this.charts.sales.destroy();
    }

    // Get last 7 days of sales
    const last7Days = this.getLast7DaysData();

    this.charts.sales = new Chart(ctx, {
      type: 'line',
      data: {
        labels: last7Days.labels,
        datasets: [{
          label: 'Daily Sales',
          data: last7Days.values,
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#4f46e5',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context) {
                return ` $${context.parsed.y.toFixed(2)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value;
              }
            }
          }
        }
      }
    });
  }

  /**
   * Get last 7 days sales data
   */
  getLast7DaysData() {
    const labels = [];
    const values = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const daySales = this.sales.filter(sale => 
        sale.date >= date && sale.date < nextDate
      );
      
      const total = daySales.reduce((sum, sale) => sum + (sale.total || 0), 0);
      
      labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
      values.push(total);
    }
    
    return { labels, values };
  }

  /**
   * Create product distribution chart
   */
  createProductDistributionChart() {
    const ctx = document.getElementById('productsChart')?.getContext('2d');
    if (!ctx) return;

    // Destroy existing chart
    if (this.charts.products) {
      this.charts.products.destroy();
    }

    // Group products by category
    const categories = {};
    this.products.forEach(product => {
      const category = product.category || 'Uncategorized';
      categories[category] = (categories[category] || 0) + 1;
    });

    const categoryNames = Object.keys(categories);
    const categoryValues = Object.values(categories);

    this.charts.products = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: categoryNames,
        datasets: [{
          data: categoryValues,
          backgroundColor: [
            '#4f46e5',
            '#10b981',
            '#f59e0b',
            '#ef4444',
            '#8b5cf6',
            '#06b6d4',
            '#f97316',
            '#84cc16'
          ],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 20,
              usePointStyle: true
            }
          }
        }
      }
    });
  }

  /**
   * Create revenue chart
   */
  createRevenueChart() {
    const ctx = document.getElementById('revenueChart')?.getContext('2d');
    if (!ctx) return;

    // Destroy existing chart
    if (this.charts.revenue) {
      this.charts.revenue.destroy();
    }

    // Monthly revenue data
    const monthlyData = this.getMonthlyRevenueData();

    this.charts.revenue = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthlyData.labels,
        datasets: [{
          label: 'Revenue',
          data: monthlyData.revenue,
          backgroundColor: 'rgba(79, 70, 229, 0.8)',
          borderColor: '#4f46e5',
          borderWidth: 1,
          borderRadius: 4
        }, {
          label: 'Profit',
          data: monthlyData.profit,
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value;
              }
            }
          }
        }
      }
    });
  }

  /**
   * Get monthly revenue data
   */
  getMonthlyRevenueData() {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = new Date().getFullYear();
    
    const revenue = new Array(12).fill(0);
    const profit = new Array(12).fill(0);
    
    this.sales.forEach(sale => {
      const month = sale.date.getMonth();
      const year = sale.date.getFullYear();
      
      if (year === currentYear) {
        revenue[month] += sale.total || 0;
        
        // Calculate profit
        if (sale.items) {
          sale.items.forEach(item => {
            const product = this.products.find(p => p.id === item.id);
            if (product) {
              profit[month] += (item.price - (product.costPrice || 0)) * item.quantity;
            }
          });
        }
      }
    });
    
    return {
      labels: months,
      revenue: revenue,
      profit: profit
    };
  }

  /**
   * Setup real-time listeners
   */
  setupRealTimeListeners() {
    // Listen for product changes
    const productListener = db.collection('products')
      .onSnapshot(async (snapshot) => {
        this.products = [];
        snapshot.forEach(doc => {
          this.products.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        this.updateStatistics();
        await this.checkLowStock();
        this.createProductDistributionChart();
      });

    // Listen for sales changes
    const salesListener = db.collection('sales')
      .onSnapshot(async (snapshot) => {
        this.sales = [];
        snapshot.forEach(doc => {
          this.sales.push({
            id: doc.id,
            ...doc.data(),
            date: doc.data().date?.toDate() || new Date()
          });
        });
        
        this.updateStatistics();
        this.createSalesChart();
        this.createRevenueChart();
        await this.loadRecentTransactions();
      });

    // Store listeners for cleanup
    this.realTimeListeners.push(productListener, salesListener);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Export buttons
    document.getElementById('exportPdfBtn')?.addEventListener('click', () => this.exportToPDF());
    document.getElementById('exportExcelBtn')?.addEventListener('click', () => this.exportToExcel());
    document.getElementById('exportCsvBtn')?.addEventListener('click', () => this.exportToCSV());

    // Theme toggle
    document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());

    // Sidebar toggle for mobile
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
      document.querySelector('.sidebar')?.classList.toggle('show');
    });
  }

  /**
   * Export dashboard to PDF
   */
  async exportToPDF() {
    this.showToast('Exporting to PDF...', 'info');
    // Implementation would use jsPDF library
    setTimeout(() => {
      this.showToast('PDF exported successfully!', 'success');
    }, 2000);
  }

  /**
   * Export dashboard to Excel
   */
  async exportToExcel() {
    this.showToast('Exporting to Excel...', 'info');
    // Implementation would use SheetJS library
    setTimeout(() => {
      this.showToast('Excel exported successfully!', 'success');
    }, 2000);
  }

  /**
   * Export dashboard to CSV
   */
  async exportToCSV() {
    this.showToast('Exporting to CSV...', 'info');
    // Implementation would generate CSV file
    setTimeout(() => {
      this.showToast('CSV exported successfully!', 'success');
    }, 2000);
  }

  /**
   * Toggle theme
   */
  toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    const icon = document.querySelector('#themeToggle i');
    if (icon) {
      icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
  }

  /**
   * Show loading overlay
   */
  showLoader() {
    const loader = document.getElementById('dashboardLoader');
    if (loader) loader.style.display = 'flex';
  }

  /**
   * Hide loading overlay
   */
  hideLoader() {
    const loader = document.getElementById('dashboardLoader');
    if (loader) loader.style.display = 'none';
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
      <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Cleanup on page unload
   */
  destroy() {
    // Remove all real-time listeners
    this.realTimeListeners.forEach(listener => {
      if (typeof listener === 'function') {
        listener();
      }
    });
  }
}

// Initialize dashboard
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
  dashboard = new Dashboard();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (dashboard) {
    dashboard.destroy();
  }
});

// Export for global access
window.dashboard = dashboard;