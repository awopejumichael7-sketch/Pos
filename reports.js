// ============================================
// REPORTS & ANALYTICS SYSTEM
// ============================================

class ReportsManager {
    constructor() {
        // State
        this.currentFilter = 'daily';
        this.sales = [];
        this.products = [];
        this.customStartDate = null;
        this.customEndDate = null;
        this.charts = {};
        
        // Real-time listeners
        this.realTimeListeners = [];
        
        // Initialize
        this.init();
    }

    /**
     * Initialize reports manager
     */
    async init() {
        // Check authentication
        const user = JSON.parse(localStorage.getItem('currentUser'));
        if (!user || !user.isAuthenticated || user.role !== 'Admin') {
            window.location.href = 'login.html';
            return;
        }

        // Set up date range display
        this.updateDateRangeDisplay();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load data
        await this.loadData();
        
        // Setup real-time sync
        this.setupRealTimeSync();

        console.log('✅ Reports Manager initialized');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Period filter buttons
        document.querySelectorAll('.filter-period-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update active button
                document.querySelectorAll('.filter-period-btn').forEach(b => 
                    b.classList.remove('active')
                );
                e.target.classList.add('active');
                
                // Update filter
                this.currentFilter = e.target.dataset.period;
                this.customStartDate = null;
                this.customEndDate = null;
                
                // Clear date inputs
                document.getElementById('startDate').value = '';
                document.getElementById('endDate').value = '';
                
                // Reload data
                this.loadReports();
            });
        });

        // Date range apply button
        const applyDateBtn = document.getElementById('applyDateRange');
        if (applyDateBtn) {
            applyDateBtn.addEventListener('click', () => {
                const startDate = document.getElementById('startDate').value;
                const endDate = document.getElementById('endDate').value;
                
                if (startDate && endDate) {
                    this.customStartDate = new Date(startDate);
                    this.customEndDate = new Date(endDate);
                    this.customEndDate.setHours(23, 59, 59, 999);
                    this.currentFilter = 'custom';
                    
                    // Update button states
                    document.querySelectorAll('.filter-period-btn').forEach(b => 
                        b.classList.remove('active')
                    );
                    
                    this.loadReports();
                } else {
                    this.showToast('Please select both start and end dates', 'warning');
                }
            });
        }

        // Export buttons
        document.getElementById('exportPdfBtn')?.addEventListener('click', () => this.exportReport('pdf'));
        document.getElementById('exportExcelBtn')?.addEventListener('click', () => this.exportReport('excel'));
        document.getElementById('exportCsvBtn')?.addEventListener('click', () => this.exportReport('csv'));
    }

    /**
     * Load all required data
     */
    async loadData() {
        try {
            this.showLoader();
            
            // Load products
            await this.loadProducts();
            
            // Load sales
            await this.loadSales();
            
            // Generate reports
            this.loadReports();
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showToast('Error loading report data', 'error');
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
                const data = doc.data();
                this.products.push({
                    id: doc.id,
                    name: data.name || 'Unknown',
                    category: data.category || 'Uncategorized',
                    quantity: data.quantity || 0,
                    costPrice: data.costPrice || 0,
                    sellingPrice: data.sellingPrice || 0
                });
            });
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
            let query = db.collection('sales');
            
            // Apply date filter
            const dateRange = this.getDateRange();
            
            if (dateRange.start) {
                query = query.where('date', '>=', firebase.firestore.Timestamp.fromDate(dateRange.start));
            }
            if (dateRange.end) {
                query = query.where('date', '<=', firebase.firestore.Timestamp.fromDate(dateRange.end));
            }
            
            const snapshot = await query.orderBy('date', 'desc').get();
            
            this.sales = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                this.sales.push({
                    id: doc.id,
                    ...data,
                    date: data.date?.toDate() || new Date()
                });
            });
            
        } catch (error) {
            console.error('Error loading sales:', error);
            throw error;
        }
    }

    /**
     * Get date range based on current filter
     */
    getDateRange() {
        const now = new Date();
        let start = null;
        let end = null;

        switch (this.currentFilter) {
            case 'daily':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                break;
                
            case 'weekly':
                start = new Date(now);
                start.setDate(now.getDate() - now.getDay());
                start.setHours(0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                break;
                
            case 'monthly':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                break;
                
            case 'yearly':
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                break;
                
            case 'custom':
                start = this.customStartDate;
                end = this.customEndDate;
                break;
        }

        return { start, end };
    }

    /**
     * Load and generate reports
     */
    async loadReports() {
        try {
            this.showLoader();
            
            // Reload sales with current filter
            await this.loadSales();
            
            // Update summary statistics
            this.updateSummaryStatistics();
            
            // Update charts
            this.updateCharts();
            
            // Update best sellers table
            this.updateBestSellersTable();
            
            // Update sales history table
            this.updateSalesHistoryTable();
            
            // Update date range display
            this.updateDateRangeDisplay();
            
        } catch (error) {
            console.error('Error generating reports:', error);
            this.showToast('Error generating reports', 'error');
        } finally {
            this.hideLoader();
        }
    }

    /**
     * Load reports by custom date range
     */
    async loadReportsByDateRange(startDate, endDate) {
        if (startDate && endDate) {
            this.customStartDate = new Date(startDate);
            this.customEndDate = new Date(endDate);
            this.customEndDate.setHours(23, 59, 59, 999);
            this.currentFilter = 'custom';
            
            document.querySelectorAll('.filter-period-btn').forEach(b => 
                b.classList.remove('active')
            );
            
            await this.loadReports();
        }
    }

    /**
     * Update summary statistics
     */
    updateSummaryStatistics() {
        // Total sales count
        const totalSales = this.sales.length;
        this.updateElement('totalSalesCount', totalSales);

        // Total revenue
        const totalRevenue = this.sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
        this.animateValue('totalRevenue', 0, totalRevenue, 1000, (val) => `$${val.toFixed(2)}`);

        // Total profit
        let totalProfit = 0;
        this.sales.forEach(sale => {
            if (sale.items) {
                sale.items.forEach(item => {
                    const product = this.products.find(p => p.id === item.productId);
                    if (product) {
                        totalProfit += (item.price - product.costPrice) * item.quantity;
                    }
                });
            }
        });
        this.animateValue('totalProfit', 0, totalProfit, 1000, (val) => `$${val.toFixed(2)}`);

        // Average sale
        const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0;
        this.animateValue('averageSale', 0, averageSale, 1000, (val) => `$${val.toFixed(2)}`);

        // Total items sold
        let totalItems = 0;
        this.sales.forEach(sale => {
            if (sale.items) {
                sale.items.forEach(item => {
                    totalItems += item.quantity || 0;
                });
            }
        });
        this.updateElement('totalItemsSold', totalItems);

        // Profit margin
        const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
        this.animateValue('profitMargin', 0, profitMargin, 1000, (val) => `${val.toFixed(1)}%`);
    }

    /**
     * Update all charts
     */
    updateCharts() {
        this.createSalesTrendChart();
        this.createCategoryChart();
        this.createRevenueProfitChart();
        this.createTopProductsChart();
    }

    /**
     * Create sales trend chart
     */
    createSalesTrendChart() {
        const ctx = document.getElementById('salesTrendChart')?.getContext('2d');
        if (!ctx) return;

        // Destroy existing chart
        if (this.charts.salesTrend) {
            this.charts.salesTrend.destroy();
        }

        // Group sales by date
        const salesByDate = this.groupSalesByDate();
        const labels = Object.keys(salesByDate).sort();
        const values = labels.map(date => salesByDate[date]);

        this.charts.salesTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sales Amount',
                    data: values,
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#4f46e5',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Sales: $${context.parsed.y.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => '$' + value.toFixed(0)
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
    }

    /**
     * Create category distribution chart
     */
    createCategoryChart() {
        const ctx = document.getElementById('categoryChart')?.getContext('2d');
        if (!ctx) return;

        // Destroy existing chart
        if (this.charts.category) {
            this.charts.category.destroy();
        }

        // Group sales by category
        const categorySales = {};
        this.sales.forEach(sale => {
            if (sale.items) {
                sale.items.forEach(item => {
                    const product = this.products.find(p => p.id === item.productId);
                    const category = product?.category || 'Uncategorized';
                    categorySales[category] = (categorySales[category] || 0) + (item.price * item.quantity);
                });
            }
        });

        const labels = Object.keys(categorySales);
        const values = Object.values(categorySales);
        const colors = [
            '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
            '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6'
        ];

        this.charts.category = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 3,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            padding: 15,
                            usePointStyle: true,
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const total = values.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return ` ${context.label}: $${context.parsed.toFixed(2)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Create revenue vs profit chart
     */
    createRevenueProfitChart() {
        const ctx = document.getElementById('revenueProfitChart')?.getContext('2d');
        if (!ctx) return;

        // Destroy existing chart
        if (this.charts.revenueProfit) {
            this.charts.revenueProfit.destroy();
        }

        // Get monthly data
        const monthlyData = this.getMonthlyRevenueProfit();
        
        this.charts.revenueProfit = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: monthlyData.labels,
                datasets: [
                    {
                        label: 'Revenue',
                        data: monthlyData.revenue,
                        backgroundColor: 'rgba(79, 70, 229, 0.8)',
                        borderColor: '#4f46e5',
                        borderWidth: 2,
                        borderRadius: 6
                    },
                    {
                        label: 'Profit',
                        data: monthlyData.profit,
                        backgroundColor: 'rgba(16, 185, 129, 0.8)',
                        borderColor: '#10b981',
                        borderWidth: 2,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label}: $${context.parsed.y.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => '$' + value
                        }
                    }
                }
            }
        });
    }

    /**
     * Create top products chart
     */
    createTopProductsChart() {
        const ctx = document.getElementById('topProductsChart')?.getContext('2d');
        if (!ctx) return;

        // Destroy existing chart
        if (this.charts.topProducts) {
            this.charts.topProducts.destroy();
        }

        // Get top 10 products
        const productSales = {};
        this.sales.forEach(sale => {
            if (sale.items) {
                sale.items.forEach(item => {
                    const productName = item.name || 'Unknown';
                    productSales[productName] = (productSales[productName] || 0) + (item.price * item.quantity);
                });
            }
        });

        const sorted = Object.entries(productSales)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        this.charts.topProducts = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(([name]) => name.length > 15 ? name.substring(0, 15) + '...' : name),
                datasets: [{
                    label: 'Revenue',
                    data: sorted.map(([, value]) => value),
                    backgroundColor: [
                        'rgba(79, 70, 229, 0.9)',
                        'rgba(79, 70, 229, 0.8)',
                        'rgba(79, 70, 229, 0.7)',
                        'rgba(79, 70, 229, 0.6)',
                        'rgba(79, 70, 229, 0.5)',
                        'rgba(79, 70, 229, 0.4)',
                        'rgba(79, 70, 229, 0.3)',
                        'rgba(79, 70, 229, 0.2)',
                        'rgba(79, 70, 229, 0.2)',
                        'rgba(79, 70, 229, 0.1)'
                    ],
                    borderColor: '#4f46e5',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Revenue: $${context.parsed.x.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => '$' + value
                        }
                    }
                }
            }
        });
    }

    /**
     * Update best sellers table
     */
    updateBestSellersTable() {
        const tbody = document.getElementById('bestSellersTable');
        if (!tbody) return;

        // Calculate product performance
        const productPerformance = {};
        this.sales.forEach(sale => {
            if (sale.items) {
                sale.items.forEach(item => {
                    const product = this.products.find(p => p.id === item.productId);
                    if (!productPerformance[item.name]) {
                        productPerformance[item.name] = {
                            name: item.name,
                            category: product?.category || 'Unknown',
                            quantity: 0,
                            revenue: 0,
                            profit: 0,
                            currentStock: product?.quantity || 0
                        };
                    }
                    productPerformance[item.name].quantity += item.quantity;
                    productPerformance[item.name].revenue += item.price * item.quantity;
                    if (product) {
                        productPerformance[item.name].profit += (item.price - product.costPrice) * item.quantity;
                    }
                });
            }
        });

        const sorted = Object.values(productPerformance)
            .sort((a, b) => b.revenue - a.revenue);

        if (sorted.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div style="text-align: center; padding: 48px;">
                            <i class="fas fa-chart-bar" style="font-size: 48px; color: var(--text-muted); display: block; margin-bottom: 16px;"></i>
                            <p>No sales data available for this period</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = sorted.map((product, index) => {
            const stockStatus = product.currentStock === 0 ? 'out-of-stock' :
                               product.currentStock <= 10 ? 'low-stock' : 'in-stock';
            const stockBadge = stockStatus === 'out-of-stock' ? 
                '<span class="badge badge-danger">Out of Stock</span>' :
                stockStatus === 'low-stock' ? 
                '<span class="badge badge-warning">Low Stock</span>' :
                '<span class="badge badge-success">In Stock</span>';

            return `
                <tr>
                    <td><strong>#${index + 1}</strong></td>
                    <td>${this.escapeHtml(product.name)}</td>
                    <td>${this.escapeHtml(product.category)}</td>
                    <td><strong>${product.quantity}</strong></td>
                    <td>$${product.revenue.toFixed(2)}</td>
                    <td style="color: ${product.profit >= 0 ? '#10b981' : '#ef4444'};">
                        $${product.profit.toFixed(2)}
                    </td>
                    <td>${stockBadge}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Update sales history table
     */
    updateSalesHistoryTable() {
        const tbody = document.getElementById('salesHistoryTable');
        if (!tbody) return;

        if (this.sales.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9">
                        <div style="text-align: center; padding: 48px;">
                            <i class="fas fa-receipt" style="font-size: 48px; color: var(--text-muted); display: block; margin-bottom: 16px;"></i>
                            <p>No sales recorded for this period</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        // Show last 50 sales
        const recentSales = this.sales.slice(0, 50);

        tbody.innerHTML = recentSales.map(sale => {
            const date = sale.date instanceof Date ? sale.date : new Date(sale.date);
            const receiptNumber = sale.id.slice(-8).toUpperCase();
            const itemCount = sale.items ? sale.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

            return `
                <tr>
                    <td><strong>#${receiptNumber}</strong></td>
                    <td>
                        ${date.toLocaleDateString()}<br>
                        <small style="color: var(--text-muted);">${date.toLocaleTimeString()}</small>
                    </td>
                    <td>${this.escapeHtml(sale.customerName || 'Walk-in')}</td>
                    <td>${itemCount} items</td>
                    <td>$${(sale.subtotal || 0).toFixed(2)}</td>
                    <td>$${(sale.tax || 0).toFixed(2)}</td>
                    <td>$${(sale.discount || 0).toFixed(2)}</td>
                    <td><strong>$${(sale.total || 0).toFixed(2)}</strong></td>
                    <td>${this.escapeHtml(sale.cashier || 'Unknown')}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Get monthly revenue and profit data
     */
    getMonthlyRevenueProfit() {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentYear = new Date().getFullYear();
        
        const revenue = new Array(12).fill(0);
        const profit = new Array(12).fill(0);
        
        this.sales.forEach(sale => {
            const date = sale.date instanceof Date ? sale.date : new Date(sale.date);
            const year = date.getFullYear();
            const month = date.getMonth();
            
            if (year === currentYear) {
                revenue[month] += sale.total || 0;
                
                if (sale.items) {
                    sale.items.forEach(item => {
                        const product = this.products.find(p => p.id === item.productId);
                        if (product) {
                            profit[month] += (item.price - product.costPrice) * item.quantity;
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
     * Group sales by date
     */
    groupSalesByDate() {
        const grouped = {};
        
        this.sales.forEach(sale => {
            const date = sale.date instanceof Date ? sale.date : new Date(sale.date);
            const dateKey = date.toLocaleDateString();
            grouped[dateKey] = (grouped[dateKey] || 0) + (sale.total || 0);
        });
        
        return grouped;
    }

    /**
     * Update date range display
     */
    updateDateRangeDisplay() {
        const display = document.getElementById('reportDateRange');
        if (!display) return;

        const dateRange = this.getDateRange();
        const start = dateRange.start ? dateRange.start.toLocaleDateString() : 'N/A';
        const end = dateRange.end ? dateRange.end.toLocaleDateString() : 'N/A';
        
        display.textContent = `Showing data from ${start} to ${end}`;
    }

    /**
     * Export report in specified format
     */
    async exportReport(format) {
        try {
            this.showToast(`Preparing ${format.toUpperCase()} export...`, 'info');
            
            switch (format) {
                case 'pdf':
                    await this.exportToPDF();
                    break;
                case 'excel':
                    await this.exportToExcel();
                    break;
                case 'csv':
                    await this.exportToCSV();
                    break;
                default:
                    this.showToast('Unsupported export format', 'error');
            }
            
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('Error exporting report', 'error');
        }
    }

    /**
     * Export to PDF
     */
    async exportToPDF() {
        // Create a simple printable report
        const reportContent = this.generatePrintableReport();
        
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Report - Inventory Pro</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            padding: 40px; 
                            max-width: 800px; 
                            margin: 0 auto; 
                        }
                        h1 { color: #4f46e5; }
                        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background: #4f46e5; color: white; }
                        .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin: 20px 0; }
                        .summary-card { background: #f3f4f6; padding: 16px; border-radius: 8px; }
                        @media print { body { padding: 0; } }
                    </style>
                </head>
                <body>
                    ${reportContent}
                    <script>
                        window.onload = function() {
                            window.print();
                        }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
        
        this.showToast('PDF report generated successfully', 'success');
    }

    /**
     * Export to Excel (CSV format that Excel can open)
     */
    async exportToExcel() {
        const csv = this.generateCSV();
        this.downloadFile('report.csv', csv, 'text/csv');
        this.showToast('Excel report exported successfully', 'success');
    }

    /**
     * Export to CSV
     */
    async exportToCSV() {
        const csv = this.generateCSV();
        this.downloadFile('report.csv', csv, 'text/csv');
        this.showToast('CSV report exported successfully', 'success');
    }

    /**
     * Generate printable report HTML
     */
    generatePrintableReport() {
        const totalRevenue = this.sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
        const totalProfit = this.sales.reduce((sum, sale) => {
            if (sale.items) {
                sale.items.forEach(item => {
                    const product = this.products.find(p => p.id === item.productId);
                    if (product) {
                        sum += (item.price - product.costPrice) * item.quantity;
                    }
                });
            }
            return sum;
        }, 0);

        return `
            <h1>Inventory Pro - Sales Report</h1>
            <p>Generated on: ${new Date().toLocaleString()}</p>
            <p>Period: ${this.getDateRange().start?.toLocaleDateString() || 'N/A'} - ${this.getDateRange().end?.toLocaleDateString() || 'N/A'}</p>
            
            <div class="summary">
                <div class="summary-card">
                    <strong>Total Sales:</strong> ${this.sales.length}
                </div>
                <div class="summary-card">
                    <strong>Total Revenue:</strong> $${totalRevenue.toFixed(2)}
                </div>
                <div class="summary-card">
                    <strong>Total Profit:</strong> $${totalProfit.toFixed(2)}
                </div>
                <div class="summary-card">
                    <strong>Average Sale:</strong> $${(this.sales.length > 0 ? totalRevenue / this.sales.length : 0).toFixed(2)}
                </div>
            </div>
            
            <h2>Sales History</h2>
            <table>
                <thead>
                    <tr>
                        <th>Receipt #</th>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Items</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.sales.slice(0, 100).map(sale => `
                        <tr>
                            <td>#${sale.id.slice(-8).toUpperCase()}</td>
                            <td>${new Date(sale.date).toLocaleDateString()}</td>
                            <td>${sale.customerName || 'Walk-in'}</td>
                            <td>${sale.items ? sale.items.reduce((sum, i) => sum + i.quantity, 0) : 0}</td>
                            <td>$${(sale.total || 0).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Generate CSV data
     */
    generateCSV() {
        const headers = ['Receipt #', 'Date', 'Customer', 'Items', 'Subtotal', 'Tax', 'Discount', 'Total', 'Cashier'];
        const rows = this.sales.map(sale => [
            sale.id.slice(-8).toUpperCase(),
            new Date(sale.date).toLocaleDateString(),
            sale.customerName || 'Walk-in',
            sale.items ? sale.items.reduce((sum, i) => sum + i.quantity, 0) : 0,
            (sale.subtotal || 0).toFixed(2),
            (sale.tax || 0).toFixed(2),
            (sale.discount || 0).toFixed(2),
            (sale.total || 0).toFixed(2),
            sale.cashier || 'Unknown'
        ]);

        return [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');
    }

    /**
     * Download file
     */
    downloadFile(filename, content, type) {
        const blob = new Blob([content], { type });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }

    /**
     * Setup real-time sync
     */
    setupRealTimeSync() {
        // Listen for new sales
        const salesListener = db.collection('sales')
            .onSnapshot(() => {
                this.loadReports();
            });

        this.realTimeListeners.push(salesListener);
    }

    /**
     * Update DOM element with value
     */
    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    /**
     * Animate value change
     */
    animateValue(elementId, start, end, duration, formatter = (val) => val) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const startTime = performance.now();
        
        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = start + (end - start) * eased;
            
            element.textContent = formatter(current);
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = formatter(end);
            }
        };
        
        requestAnimationFrame(update);
    }

    /**
     * Show loading overlay
     */
    showLoader() {
        const loader = document.getElementById('reportsLoader');
        if (loader) loader.style.display = 'flex';
    }

    /**
     * Hide loading overlay
     */
    hideLoader() {
        const loader = document.getElementById('reportsLoader');
        if (loader) loader.style.display = 'none';
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(toast => toast.remove());

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Cleanup
     */
    destroy() {
        // Destroy all charts
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });

        // Remove listeners
        this.realTimeListeners.forEach(listener => {
            if (typeof listener === 'function') {
                listener();
            }
        });
    }
}

// ============================================
// INITIALIZATION
// ============================================

let reportsManager;

document.addEventListener('DOMContentLoaded', () => {
    reportsManager = new ReportsManager();
    
    // Make available globally
    window.reportsManager = reportsManager;
});

// ============================================
// CLEANUP
// ============================================

window.addEventListener('beforeunload', () => {
    if (reportsManager) {
        reportsManager.destroy();
    }
});

console.log('✅ Reports.js loaded successfully');