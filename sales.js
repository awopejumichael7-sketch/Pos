// ============================================
// POINT OF SALE SYSTEM
// ============================================

class POSSystem {
    constructor() {
        // Cart state
        this.cart = [];
        this.products = [];
        this.allProducts = [];
        this.categories = new Set();
        this.currentCategory = 'all';
        
        // Tax and discount
        this.taxRate = 0.08; // 8% tax
        this.discountPercent = 0;
        this.discountType = 'percent'; // 'percent' or 'fixed'
        
        // Receipt data
        this.currentReceipt = null;
        this.lastSaleId = null;
        
        // Real-time listener
        this.realTimeListener = null;
        
        // Initialize
        this.init();
    }

    /**
     * Initialize POS system
     */
    async init() {
        // Check authentication
        const user = JSON.parse(localStorage.getItem('currentUser'));
        if (!user || !user.isAuthenticated) {
            window.location.href = 'login.html';
            return;
        }

        // Set cashier name
        document.getElementById('cashierName').textContent = user.username;
        document.getElementById('userFullName').textContent = user.username;
        document.getElementById('userAvatar').textContent = user.username.charAt(0).toUpperCase();
        document.getElementById('sidebarRole').textContent = user.role;

        // Setup event listeners
        this.setupEventListeners();
        
        // Load products
        await this.loadProducts();
        
        // Setup real-time sync
        this.setupRealTimeSync();
        
        // Focus search input
        setTimeout(() => {
            document.getElementById('posSearch')?.focus();
        }, 500);

        console.log('✅ POS System initialized');
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Search products
        const searchInput = document.getElementById('posSearch');
        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.searchProducts(e.target.value);
                }, 250);
            });
        }

        // Discount input
        const discountInput = document.getElementById('discountInput');
        if (discountInput) {
            discountInput.addEventListener('input', (e) => {
                this.discountPercent = parseFloat(e.target.value) || 0;
                this.updateCartDisplay();
            });
        }

        // Discount type
        const discountType = document.getElementById('discountType');
        if (discountType) {
            discountType.addEventListener('change', (e) => {
                this.discountType = e.target.value;
                this.updateCartDisplay();
            });
        }

        // Cash received input
        const cashInput = document.getElementById('cashReceived');
        if (cashInput) {
            cashInput.addEventListener('input', (e) => {
                this.calculateChange();
            });
        }

        // Complete sale button
        const completeSaleBtn = document.getElementById('completeSaleBtn');
        if (completeSaleBtn) {
            completeSaleBtn.addEventListener('click', () => {
                this.processSale();
            });
        }

        // Clear cart button
        const clearCartBtn = document.getElementById('clearCartBtn');
        if (clearCartBtn) {
            clearCartBtn.addEventListener('click', () => {
                this.clearCart();
            });
        }

        // Hold sale button
        const holdSaleBtn = document.getElementById('holdSaleBtn');
        if (holdSaleBtn) {
            holdSaleBtn.addEventListener('click', () => {
                this.holdSale();
            });
        }

        // Close modals on click outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('show');
                document.body.style.overflow = '';
            }
        });
    }

    /**
     * Load products from Firestore
     */
    async loadProducts() {
        try {
            this.showLoader();
            
            const snapshot = await db.collection('products')
                .orderBy('name', 'asc')
                .get();

            this.allProducts = [];
            this.categories = new Set();
            this.categories.add('all');

            snapshot.forEach(doc => {
                const data = doc.data();
                const product = {
                    id: doc.id,
                    name: data.name || 'Unnamed Product',
                    barcode: data.barcode || '',
                    category: data.category || 'Uncategorized',
                    quantity: data.quantity || 0,
                    costPrice: data.costPrice || 0,
                    sellingPrice: data.sellingPrice || 0,
                    supplier: data.supplier || '',
                    imageUrl: data.imageUrl || '',
                    dateAdded: data.dateAdded?.toDate() || new Date()
                };
                
                this.allProducts.push(product);
                
                if (product.category) {
                    this.categories.add(product.category);
                }
            });

            // Filter products with stock > 0
            this.products = this.allProducts.filter(p => p.quantity > 0);
            
            // Render categories
            this.renderCategories();
            
            // Render products
            this.renderProducts();
            
            // Update product count
            this.updateProductCount();

        } catch (error) {
            console.error('Error loading products:', error);
            this.showToast('Error loading products', 'error');
        } finally {
            this.hideLoader();
        }
    }

    /**
     * Setup real-time sync with Firestore
     */
    setupRealTimeSync() {
        this.realTimeListener = db.collection('products')
            .onSnapshot(async (snapshot) => {
                const changes = snapshot.docChanges();
                
                changes.forEach(change => {
                    const data = change.doc.data();
                    const product = {
                        id: change.doc.id,
                        name: data.name || 'Unnamed Product',
                        barcode: data.barcode || '',
                        category: data.category || 'Uncategorized',
                        quantity: data.quantity || 0,
                        costPrice: data.costPrice || 0,
                        sellingPrice: data.sellingPrice || 0,
                        supplier: data.supplier || '',
                        imageUrl: data.imageUrl || '',
                        dateAdded: data.dateAdded?.toDate() || new Date()
                    };

                    if (change.type === 'added') {
                        this.allProducts.push(product);
                        if (product.category) this.categories.add(product.category);
                    } else if (change.type === 'modified') {
                        const index = this.allProducts.findIndex(p => p.id === change.doc.id);
                        if (index !== -1) {
                            this.allProducts[index] = product;
                        }
                    } else if (change.type === 'removed') {
                        this.allProducts = this.allProducts.filter(p => p.id !== change.doc.id);
                        // Remove from cart if deleted
                        this.cart = this.cart.filter(item => item.id !== change.doc.id);
                    }
                });

                // Update available products (in stock)
                this.products = this.allProducts.filter(p => p.quantity > 0);
                
                // Re-render
                this.renderCategories();
                this.renderProducts();
                this.updateCartDisplay();
                this.updateProductCount();
            });
    }

    /**
     * Render category chips
     */
    renderCategories() {
        const container = document.getElementById('categoryChips');
        if (!container) return;

        container.innerHTML = '';
        
        Array.from(this.categories).sort().forEach(category => {
            const chip = document.createElement('button');
            chip.className = `category-chip ${this.currentCategory === category ? 'active' : ''}`;
            chip.textContent = category === 'all' ? 'All Products' : category;
            chip.dataset.category = category;
            chip.addEventListener('click', () => {
                this.filterByCategory(category);
            });
            container.appendChild(chip);
        });
    }

    /**
     * Render products grid
     */
    renderProducts(filteredProducts = null) {
        const container = document.getElementById('posProductsGrid');
        if (!container) return;

        const productsToShow = filteredProducts || this.products;

        if (productsToShow.length === 0) {
            container.innerHTML = `
                <div class="empty-cart" style="grid-column: 1 / -1;">
                    <i class="fas fa-box-open"></i>
                    <p>No products found</p>
                    <small>Try adjusting your search or add products in inventory</small>
                </div>
            `;
            return;
        }

        container.innerHTML = productsToShow.map(product => this.createProductCard(product)).join('');
    }

    /**
     * Create product card HTML
     */
    createProductCard(product) {
        const isOutOfStock = product.quantity === 0;
        const stockStatus = isOutOfStock ? 'out-of-stock' : 
                           product.quantity <= 10 ? 'low-stock' : '';
        
        return `
            <div class="pos-product-card ${isOutOfStock ? 'out-of-stock' : ''}" 
                 onclick="${isOutOfStock ? '' : `posSystem.addToCart('${product.id}')`}"
                 title="${product.name} - $${product.sellingPrice.toFixed(2)}">
                ${isOutOfStock ? '<span class="out-of-stock-badge">Out of Stock</span>' : ''}
                ${!isOutOfStock && product.quantity <= 10 ? `<span class="stock-badge ${stockStatus}">${product.quantity} left</span>` : ''}
                <img src="${product.imageUrl || 'assets/images/no-image.png'}" 
                     alt="${this.escapeHtml(product.name)}"
                     onerror="this.src='assets/images/no-image.png'">
                <div class="product-name">${this.escapeHtml(product.name)}</div>
                <div class="product-price">$${product.sellingPrice.toFixed(2)}</div>
                <div class="product-stock">Stock: ${product.quantity}</div>
            </div>
        `;
    }

    /**
     * Search products
     */
    searchProducts(query) {
        if (!query || query.trim() === '') {
            this.filterByCategory(this.currentCategory);
            return;
        }

        const searchTerm = query.toLowerCase().trim();
        const filtered = this.products.filter(product =>
            product.name.toLowerCase().includes(searchTerm) ||
            product.barcode.toLowerCase().includes(searchTerm) ||
            product.category.toLowerCase().includes(searchTerm)
        );

        this.renderProducts(filtered);
    }

    /**
     * Filter products by category
     */
    filterByCategory(category) {
        this.currentCategory = category;
        
        // Update active chip
        document.querySelectorAll('.category-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.category === category);
        });

        // Filter products
        let filtered;
        if (category === 'all') {
            filtered = this.products;
        } else {
            filtered = this.products.filter(p => p.category === category);
        }

        this.renderProducts(filtered);
    }

    /**
     * Add product to cart
     */
    addToCart(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) {
            this.showToast('Product not found', 'error');
            return;
        }

        if (product.quantity === 0) {
            this.showToast('Product is out of stock', 'warning');
            return;
        }

        // Check if already in cart
        const existingItem = this.cart.find(item => item.id === productId);
        
        if (existingItem) {
            // Check if we can add more
            if (existingItem.quantity < product.quantity) {
                existingItem.quantity++;
                this.showToast(`Added another ${product.name}`, 'success');
            } else {
                this.showToast(`Only ${product.quantity} available in stock`, 'warning');
                return;
            }
        } else {
            // Add new item to cart
            this.cart.push({
                id: product.id,
                name: product.name,
                price: product.sellingPrice,
                costPrice: product.costPrice,
                quantity: 1,
                maxQuantity: product.quantity,
                imageUrl: product.imageUrl
            });
            
            // Play add sound effect (optional)
            this.playAddSound();
            
            this.showToast(`${product.name} added to cart`, 'success');
        }

        // Update cart display
        this.updateCartDisplay();
        
        // Focus search for next product
        document.getElementById('posSearch')?.focus();
        document.getElementById('posSearch')?.select();
    }

    /**
     * Remove item from cart
     */
    removeFromCart(productId) {
        const item = this.cart.find(item => item.id === productId);
        if (item) {
            const itemName = item.name;
            this.cart = this.cart.filter(item => item.id !== productId);
            this.showToast(`${itemName} removed from cart`, 'warning');
        }
        this.updateCartDisplay();
    }

    /**
     * Update item quantity in cart
     */
    updateQuantity(productId, newQuantity) {
        const item = this.cart.find(item => item.id === productId);
        if (!item) return;

        if (newQuantity <= 0) {
            this.removeFromCart(productId);
            return;
        }

        if (newQuantity > item.maxQuantity) {
            this.showToast(`Maximum available: ${item.maxQuantity}`, 'warning');
            return;
        }

        item.quantity = newQuantity;
        this.updateCartDisplay();
    }

    /**
     * Calculate subtotal
     */
    calculateSubtotal() {
        return this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }

    /**
     * Calculate tax
     */
    calculateTax() {
        return this.calculateSubtotal() * this.taxRate;
    }

    /**
     * Calculate discount
     */
    calculateDiscount() {
        const subtotal = this.calculateSubtotal();
        
        if (this.discountType === 'percent') {
            return subtotal * (this.discountPercent / 100);
        } else {
            return this.discountPercent;
        }
    }

    /**
     * Calculate total
     */
    calculateTotal() {
        const subtotal = this.calculateSubtotal();
        const tax = this.calculateTax();
        const discount = this.calculateDiscount();
        return Math.max(0, subtotal + tax - discount);
    }

    /**
     * Calculate change from cash received
     */
    calculateChange() {
        const cashInput = document.getElementById('cashReceived');
        const changeDisplay = document.getElementById('changeDisplay');
        
        if (!cashInput || !changeDisplay) return;

        const cashReceived = parseFloat(cashInput.value) || 0;
        const total = this.calculateTotal();
        const change = cashReceived - total;

        changeDisplay.textContent = change >= 0 ? 
            `Change: $${change.toFixed(2)}` : 
            `Remaining: $${Math.abs(change).toFixed(2)}`;

        changeDisplay.className = `change-display ${change >= 0 ? 'change-positive' : 'change-negative'}`;
    }

    /**
     * Update cart display
     */
    updateCartDisplay() {
        const cartItems = document.getElementById('cartItems');
        const cartCount = document.getElementById('cartCount');
        
        if (!cartItems || !cartCount) return;

        // Update cart count
        const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCount.textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;

        // Render cart items
        if (this.cart.length === 0) {
            cartItems.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart"></i>
                    <p>Cart is empty</p>
                    <small>Click on products to add them</small>
                </div>
            `;
        } else {
            cartItems.innerHTML = this.cart.map(item => `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${this.escapeHtml(item.name)}</div>
                        <div class="cart-item-price">$${item.price.toFixed(2)} each</div>
                    </div>
                    <div class="cart-item-quantity">
                        <button class="qty-btn" onclick="posSystem.updateQuantity('${item.id}', ${item.quantity - 1})">
                            <i class="fas fa-minus"></i>
                        </button>
                        <span class="qty-display">${item.quantity}</span>
                        <button class="qty-btn" onclick="posSystem.updateQuantity('${item.id}', ${item.quantity + 1})">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div class="cart-item-total">
                        $${(item.price * item.quantity).toFixed(2)}
                    </div>
                    <button class="remove-item-btn" onclick="posSystem.removeFromCart('${item.id}')" title="Remove item">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
        }

        // Update totals
        const subtotal = this.calculateSubtotal();
        const tax = this.calculateTax();
        const discount = this.calculateDiscount();
        const total = this.calculateTotal();

        document.getElementById('subtotalDisplay').textContent = `$${subtotal.toFixed(2)}`;
        document.getElementById('taxDisplay').textContent = `$${tax.toFixed(2)}`;
        document.getElementById('discountDisplay').textContent = `-$${discount.toFixed(2)}`;
        document.getElementById('totalDisplay').textContent = `$${total.toFixed(2)}`;

        // Update change calculation
        this.calculateChange();
    }

    /**
     * Process the sale
     */
    async processSale() {
        // Validate cart
        if (this.cart.length === 0) {
            this.showToast('Cart is empty!', 'warning');
            return;
        }

        // Check cash received
        const cashInput = document.getElementById('cashReceived');
        const cashReceived = parseFloat(cashInput?.value) || 0;
        const total = this.calculateTotal();

        if (cashReceived < total) {
            this.showToast('Insufficient cash amount!', 'error');
            cashInput?.focus();
            return;
        }

        // Confirm sale
        const confirmed = confirm(`Complete sale for $${total.toFixed(2)}?\nCash: $${cashReceived.toFixed(2)}\nChange: $${(cashReceived - total).toFixed(2)}`);
        if (!confirmed) return;

        try {
            this.showLoader();

            // Get customer name
            const customerName = document.getElementById('customerName')?.value?.trim() || 'Walk-in Customer';

            // Prepare sale data
            const saleData = {
                items: this.cart.map(item => ({
                    productId: item.id,
                    name: item.name,
                    price: item.price,
                    costPrice: item.costPrice,
                    quantity: item.quantity,
                    subtotal: item.price * item.quantity
                })),
                subtotal: this.calculateSubtotal(),
                tax: this.calculateTax(),
                taxRate: this.taxRate,
                discount: this.calculateDiscount(),
                discountType: this.discountType,
                total: total,
                cashReceived: cashReceived,
                change: cashReceived - total,
                customerName: customerName,
                cashier: JSON.parse(localStorage.getItem('currentUser'))?.username || 'Unknown',
                date: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'completed',
                paymentMethod: 'cash'
            };

            // Save sale to Firestore
            const saleRef = await db.collection('sales').add(saleData);
            this.lastSaleId = saleRef.id;

            // Create transaction record
            await db.collection('transactions').add({
                saleId: saleRef.id,
                date: firebase.firestore.FieldValue.serverTimestamp(),
                customerName: customerName,
                items: saleData.items,
                total: total,
                cashier: saleData.cashier,
                type: 'sale'
            });

            // Update inventory quantities
            const batch = db.batch();
            
            for (const item of this.cart) {
                const productRef = db.collection('products').doc(item.id);
                const product = this.products.find(p => p.id === item.id);
                
                if (product) {
                    const newQuantity = Math.max(0, product.quantity - item.quantity);
                    batch.update(productRef, { 
                        quantity: newQuantity,
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            await batch.commit();

            // Generate receipt
            this.currentReceipt = this.generateReceipt(saleData, saleRef.id);
            
            // Show receipt modal
            this.showReceipt();

            // Log activity
            await this.logSaleActivity(saleRef.id, total);

            // Clear cart
            this.cart = [];
            this.updateCartDisplay();
            
            // Reset form fields
            if (document.getElementById('customerName')) {
                document.getElementById('customerName').value = '';
            }
            if (document.getElementById('discountInput')) {
                document.getElementById('discountInput').value = '';
            }
            if (cashInput) {
                cashInput.value = '';
            }
            document.getElementById('changeDisplay').textContent = 'Enter cash amount';

        } catch (error) {
            console.error('Error processing sale:', error);
            this.showToast('Error processing sale: ' + error.message, 'error');
        } finally {
            this.hideLoader();
        }
    }

    /**
     * Generate receipt HTML
     */
    generateReceipt(saleData, saleId) {
        const now = new Date();
        const receiptNumber = saleId.slice(-8).toUpperCase();
        const storeName = 'Inventory Pro Store';
        const storeAddress = '123 Business Street, City, State 12345';
        const storePhone = '(555) 123-4567';
        const storeEmail = 'support@inventorypro.com';

        let receiptHTML = `
            <div class="receipt" style="font-family: 'Courier New', monospace; font-size: 12px; max-width: 320px; margin: 0 auto; padding: 20px; background: white; color: #000;">
                <!-- Store Header -->
                <div style="text-align: center; margin-bottom: 15px;">
                    <h2 style="margin: 0; font-size: 18px;">${storeName}</h2>
                    <p style="margin: 2px 0; font-size: 10px;">${storeAddress}</p>
                    <p style="margin: 2px 0; font-size: 10px;">Tel: ${storePhone}</p>
                    <p style="margin: 2px 0; font-size: 10px;">${storeEmail}</p>
                </div>
                
                <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
                
                <!-- Receipt Info -->
                <div style="margin-bottom: 10px;">
                    <table style="width: 100%; font-size: 11px;">
                        <tr>
                            <td><strong>Receipt #:</strong></td>
                            <td style="text-align: right;">${receiptNumber}</td>
                        </tr>
                        <tr>
                            <td><strong>Date:</strong></td>
                            <td style="text-align: right;">${now.toLocaleDateString()}</td>
                        </tr>
                        <tr>
                            <td><strong>Time:</strong></td>
                            <td style="text-align: right;">${now.toLocaleTimeString()}</td>
                        </tr>
                        <tr>
                            <td><strong>Cashier:</strong></td>
                            <td style="text-align: right;">${saleData.cashier}</td>
                        </tr>
                        <tr>
                            <td><strong>Customer:</strong></td>
                            <td style="text-align: right;">${saleData.customerName}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
                
                <!-- Items -->
                <div style="margin-bottom: 10px;">
                    <table style="width: 100%; font-size: 11px;">
                        <thead>
                            <tr style="border-bottom: 1px solid #000;">
                                <th style="text-align: left;">Item</th>
                                <th style="text-align: center;">Qty</th>
                                <th style="text-align: right;">Price</th>
                                <th style="text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${saleData.items.map(item => `
                                <tr>
                                    <td>${item.name.substring(0, 15)}</td>
                                    <td style="text-align: center;">${item.quantity}</td>
                                    <td style="text-align: right;">$${item.price.toFixed(2)}</td>
                                    <td style="text-align: right;">$${item.subtotal.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
                
                <!-- Totals -->
                <div style="margin-bottom: 10px;">
                    <table style="width: 100%; font-size: 11px;">
                        <tr>
                            <td>Subtotal:</td>
                            <td style="text-align: right;">$${saleData.subtotal.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td>Tax (8%):</td>
                            <td style="text-align: right;">$${saleData.tax.toFixed(2)}</td>
                        </tr>
                        ${saleData.discount > 0 ? `
                        <tr>
                            <td>Discount:</td>
                            <td style="text-align: right;">-$${saleData.discount.toFixed(2)}</td>
                        </tr>
                        ` : ''}
                        <tr style="font-weight: bold; font-size: 14px;">
                            <td>TOTAL:</td>
                            <td style="text-align: right;">$${saleData.total.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td>Cash Received:</td>
                            <td style="text-align: right;">$${saleData.cashReceived.toFixed(2)}</td>
                        </tr>
                        <tr style="font-weight: bold;">
                            <td>Change:</td>
                            <td style="text-align: right;">$${saleData.change.toFixed(2)}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
                
                <!-- Footer -->
                <div style="text-align: center; margin-top: 15px;">
                    <p style="margin: 2px 0; font-weight: bold;">Thank you for your purchase!</p>
                    <p style="margin: 2px 0; font-size: 10px;">Have a great day! 😊</p>
                    <p style="margin: 2px 0; font-size: 10px; margin-top: 8px;">Items can be returned within 30 days</p>
                    <p style="margin: 2px 0; font-size: 10px;">with original receipt</p>
                </div>
            </div>
        `;

        return receiptHTML;
    }

    /**
     * Show receipt in modal
     */
    showReceipt() {
        const receiptContent = document.getElementById('receiptContent');
        const receiptModal = document.getElementById('receiptModal');
        
        if (receiptContent && this.currentReceipt) {
            receiptContent.innerHTML = this.currentReceipt;
        }
        
        if (receiptModal) {
            receiptModal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    }

    /**
     * Print receipt
     */
    printReceipt() {
        if (!this.currentReceipt) return;
        
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Receipt - Inventory Pro</title>
                    <style>
                        @page { margin: 0; size: 80mm auto; }
                        body { margin: 0; padding: 0; display: flex; justify-content: center; }
                        @media print { body { margin: 0; } }
                    </style>
                </head>
                <body>
                    ${this.currentReceipt}
                    <script>
                        window.onload = function() {
                            window.print();
                            setTimeout(() => window.close(), 500);
                        }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    }

    /**
     * Clear the cart
     */
    clearCart() {
        if (this.cart.length === 0) return;
        
        const confirmed = confirm('Are you sure you want to clear the cart?');
        if (!confirmed) return;

        this.cart = [];
        this.updateCartDisplay();
        
        // Reset form fields
        const customerName = document.getElementById('customerName');
        const discountInput = document.getElementById('discountInput');
        const cashInput = document.getElementById('cashReceived');
        
        if (customerName) customerName.value = '';
        if (discountInput) discountInput.value = '';
        if (cashInput) cashInput.value = '';
        
        const changeDisplay = document.getElementById('changeDisplay');
        if (changeDisplay) changeDisplay.textContent = 'Enter cash amount';
        
        this.showToast('Cart cleared', 'info');
        
        // Focus search
        document.getElementById('posSearch')?.focus();
    }

    /**
     * Hold the current sale (save to localStorage)
     */
    holdSale() {
        if (this.cart.length === 0) {
            this.showToast('Cart is empty!', 'warning');
            return;
        }

        const holdData = {
            cart: this.cart,
            discountPercent: this.discountPercent,
            discountType: this.discountType,
            customerName: document.getElementById('customerName')?.value || '',
            timestamp: new Date().toISOString()
        };

        // Save to localStorage
        const heldSales = JSON.parse(localStorage.getItem('heldSales') || '[]');
        heldSales.push(holdData);
        localStorage.setItem('heldSales', JSON.stringify(heldSales));

        // Clear cart
        this.cart = [];
        this.updateCartDisplay();
        
        // Reset fields
        if (document.getElementById('customerName')) document.getElementById('customerName').value = '';
        if (document.getElementById('discountInput')) document.getElementById('discountInput').value = '';
        if (document.getElementById('cashReceived')) document.getElementById('cashReceived').value = '';

        this.showToast(`Sale held (${heldSales.length} held sale${heldSales.length > 1 ? 's' : ''})`, 'info');
    }

    /**
     * Resume a held sale
     */
    resumeSale(index) {
        const heldSales = JSON.parse(localStorage.getItem('heldSales') || '[]');
        
        if (index >= 0 && index < heldSales.length) {
            const holdData = heldSales[index];
            
            // Validate stock availability
            let allAvailable = true;
            holdData.cart.forEach(item => {
                const product = this.products.find(p => p.id === item.id);
                if (!product || product.quantity < item.quantity) {
                    allAvailable = false;
                }
            });

            if (!allAvailable) {
                const proceed = confirm('Some items may have insufficient stock. Continue anyway?');
                if (!proceed) return;
            }

            // Restore cart
            this.cart = holdData.cart;
            this.discountPercent = holdData.discountPercent;
            this.discountType = holdData.discountType;
            
            if (document.getElementById('customerName')) {
                document.getElementById('customerName').value = holdData.customerName;
            }
            if (document.getElementById('discountInput')) {
                document.getElementById('discountInput').value = holdData.discountPercent;
            }
            if (document.getElementById('discountType')) {
                document.getElementById('discountType').value = holdData.discountType;
            }

            // Remove from held sales
            heldSales.splice(index, 1);
            localStorage.setItem('heldSales', JSON.stringify(heldSales));

            this.updateCartDisplay();
            this.showToast('Sale resumed', 'success');
        }
    }

    /**
     * Log sale activity
     */
    async logSaleActivity(saleId, total) {
        try {
            const user = JSON.parse(localStorage.getItem('currentUser'));
            await db.collection('activity_logs').add({
                action: 'sale_completed',
                saleId: saleId,
                total: total,
                items: this.cart.length,
                performedBy: user?.username || 'Unknown',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.warn('Failed to log activity:', error);
        }
    }

    /**
     * Update product count display
     */
    updateProductCount() {
        const count = this.products.length;
        const totalCount = this.allProducts.length;
        
        // You can update a counter element if it exists
        const counterElement = document.getElementById('productCountDisplay');
        if (counterElement) {
            counterElement.textContent = `${count} of ${totalCount} products available`;
        }
    }

    /**
     * Play add to cart sound (optional)
     */
    playAddSound() {
        try {
            // Create a simple beep sound using Web Audio API
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.1;
            
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (error) {
            // Silently fail if audio is not available
        }
    }

    /**
     * Show loading overlay
     */
    showLoader() {
        const loader = document.getElementById('posLoader');
        if (loader) loader.style.display = 'flex';
    }

    /**
     * Hide loading overlay
     */
    hideLoader() {
        const loader = document.getElementById('posLoader');
        if (loader) loader.style.display = 'none';
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Remove existing toasts
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
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Complete sale and start new one
     */
    completeAndNewSale() {
        // Close receipt modal
        const receiptModal = document.getElementById('receiptModal');
        if (receiptModal) {
            receiptModal.classList.remove('show');
            document.body.style.overflow = '';
        }

        // Reset everything
        this.cart = [];
        this.currentReceipt = null;
        this.discountPercent = 0;
        
        if (document.getElementById('customerName')) {
            document.getElementById('customerName').value = '';
        }
        if (document.getElementById('discountInput')) {
            document.getElementById('discountInput').value = '';
        }
        if (document.getElementById('cashReceived')) {
            document.getElementById('cashReceived').value = '';
        }
        if (document.getElementById('discountType')) {
            document.getElementById('discountType').value = 'percent';
        }

        this.updateCartDisplay();
        
        const changeDisplay = document.getElementById('changeDisplay');
        if (changeDisplay) {
            changeDisplay.textContent = 'Enter cash amount';
            changeDisplay.className = 'change-display';
        }

        // Focus search for next sale
        document.getElementById('posSearch')?.focus();
    }

    /**
     * Cleanup on page unload
     */
    destroy() {
        if (this.realTimeListener) {
            this.realTimeListener();
        }
    }
}

// ============================================
// INITIALIZATION
// ============================================

let posSystem;

document.addEventListener('DOMContentLoaded', () => {
    posSystem = new POSSystem();
    
    // Make available globally
    window.posSystem = posSystem;
});

// ============================================
// CLEANUP
// ============================================

window.addEventListener('beforeunload', () => {
    if (posSystem) {
        posSystem.destroy();
    }
});

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

document.addEventListener('keydown', (e) => {
    // Only process if posSystem exists
    if (!posSystem) return;

    // F8 - Complete Sale
    if (e.key === 'F8') {
        e.preventDefault();
        posSystem.processSale();
    }
    
    // F9 - Clear Cart
    if (e.key === 'F9') {
        e.preventDefault();
        posSystem.clearCart();
    }
    
    // Escape - Focus search
    if (e.key === 'Escape') {
        e.preventDefault();
        document.getElementById('posSearch')?.focus();
        document.getElementById('posSearch')?.select();
    }
    
    // Ctrl+H - Hold Sale
    if (e.ctrlKey && e.key === 'h') {
        e.preventDefault();
        posSystem.holdSale();
    }
});

console.log('✅ Sales.js loaded successfully');