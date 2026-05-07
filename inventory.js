// ============================================
// INVENTORY MANAGEMENT SYSTEM
// ============================================

class InventoryManager {
  constructor() {
    this.products = [];
    this.filteredProducts = [];
    this.currentPage = 1;
    this.itemsPerPage = 12;
    this.sortField = 'dateAdded';
    this.sortDirection = 'desc';
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.realTimeListener = null;
    this.init();
  }

  /**
   * Initialize inventory manager
   */
  async init() {
    // Check authentication
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user || !user.isAuthenticated || user.role !== 'Admin') {
      window.location.href = 'login.html';
      return;
    }

    // Setup UI
    this.setupUI();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Load products
    await this.loadProducts();
    
    // Setup real-time sync
    this.setupRealTimeSync();
  }

  /**
   * Setup user interface
   */
  setupUI() {
    // Initialize select2 or custom select if needed
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
      this.loadCategories(categoryFilter);
    }
  }

  /**
   * Load categories for filter
   */
  async loadCategories(selectElement) {
    try {
      const snapshot = await db.collection('products').get();
      const categories = new Set();
      
      snapshot.forEach(doc => {
        const category = doc.data().category;
        if (category) categories.add(category);
      });

      // Add categories to select
      categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        selectElement.appendChild(option);
      });

    } catch (error) {
      console.error('Error loading categories:', error);
    }
  }

  /**
   * Load products from Firestore
   */
  async loadProducts() {
    try {
      this.showLoader();
      
      const snapshot = await db.collection('products')
        .orderBy(this.sortField, this.sortDirection)
        .get();

      this.products = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        this.products.push({
          id: doc.id,
          name: data.name || '',
          barcode: data.barcode || '',
          category: data.category || 'Uncategorized',
          quantity: data.quantity || 0,
          costPrice: data.costPrice || 0,
          sellingPrice: data.sellingPrice || 0,
          supplier: data.supplier || '',
          imageUrl: data.imageUrl || '',
          dateAdded: data.dateAdded?.toDate() || new Date(),
          lastUpdated: data.lastUpdated?.toDate() || new Date()
        });
      });

      // Apply filters
      this.applyFilters();
      
      // Render products
      this.renderProducts();
      
      // Update statistics
      this.updateInventoryStats();

    } catch (error) {
      console.error('Error loading products:', error);
      this.showToast('Error loading products', 'error');
    } finally {
      this.hideLoader();
    }
  }

  /**
   * Add new product
   */
  async addProduct(formData) {
    try {
      this.showLoader();

      // Upload image if provided
      let imageUrl = null;
      const imageFile = formData.get('image');
      if (imageFile && imageFile.size > 0) {
        imageUrl = await this.uploadProductImage(imageFile);
      }

      // Prepare product data
      const productData = {
        name: formData.get('name').trim(),
        barcode: formData.get('barcode').trim(),
        category: formData.get('category'),
        quantity: parseInt(formData.get('quantity')) || 0,
        costPrice: parseFloat(formData.get('costPrice')) || 0,
        sellingPrice: parseFloat(formData.get('sellingPrice')) || 0,
        supplier: formData.get('supplier').trim(),
        imageUrl: imageUrl,
        dateAdded: firebase.firestore.FieldValue.serverTimestamp(),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      };

      // Validate data
      if (!productData.name) {
        throw new Error('Product name is required');
      }

      if (productData.sellingPrice < productData.costPrice) {
        throw new Error('Selling price must be greater than cost price');
      }

      // Add to Firestore
      const docRef = await db.collection('products').add(productData);
      
      // Log activity
      await this.logActivity('added', docRef.id, productData.name);

      this.showToast('Product added successfully!', 'success');
      this.closeModal('addProductModal');
      
      // Reload products
      await this.loadProducts();

      return docRef.id;

    } catch (error) {
      console.error('Error adding product:', error);
      this.showToast(error.message || 'Error adding product', 'error');
      throw error;
    } finally {
      this.hideLoader();
    }
  }

  /**
   * Edit product
   */
  async editProduct(productId, formData) {
    try {
      this.showLoader();

      // Get existing product
      const existingProduct = this.products.find(p => p.id === productId);
      if (!existingProduct) {
        throw new Error('Product not found');
      }

      // Upload new image if provided
      let imageUrl = existingProduct.imageUrl;
      const imageFile = formData.get('image');
      if (imageFile && imageFile.size > 0) {
        // Delete old image if exists
        if (existingProduct.imageUrl) {
          await this.deleteProductImage(existingProduct.imageUrl);
        }
        imageUrl = await this.uploadProductImage(imageFile);
      }

      // Prepare update data
      const updateData = {
        name: formData.get('name').trim(),
        barcode: formData.get('barcode').trim(),
        category: formData.get('category'),
        quantity: parseInt(formData.get('quantity')) || 0,
        costPrice: parseFloat(formData.get('costPrice')) || 0,
        sellingPrice: parseFloat(formData.get('sellingPrice')) || 0,
        supplier: formData.get('supplier').trim(),
        imageUrl: imageUrl,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      };

      // Validate data
      if (!updateData.name) {
        throw new Error('Product name is required');
      }

      if (updateData.sellingPrice < updateData.costPrice) {
        throw new Error('Selling price must be greater than cost price');
      }

      // Update in Firestore
      await db.collection('products').doc(productId).update(updateData);
      
      // Log activity
      await this.logActivity('updated', productId, updateData.name);

      this.showToast('Product updated successfully!', 'success');
      this.closeModal('editProductModal');
      
      // Reload products
      await this.loadProducts();

    } catch (error) {
      console.error('Error updating product:', error);
      this.showToast(error.message || 'Error updating product', 'error');
      throw error;
    } finally {
      this.hideLoader();
    }
  }

  /**
   * Delete product
   */
  async deleteProduct(productId) {
    // Find product
    const product = this.products.find(p => p.id === productId);
    if (!product) {
      this.showToast('Product not found', 'error');
      return;
    }

    // Confirm deletion
    if (!confirm(`Are you sure you want to delete "${product.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      this.showLoader();

      // Delete image from storage if exists
      if (product.imageUrl) {
        await this.deleteProductImage(product.imageUrl);
      }

      // Delete from Firestore
      await db.collection('products').doc(productId).delete();
      
      // Log activity
      await this.logActivity('deleted', productId, product.name);

      this.showToast('Product deleted successfully!', 'success');
      
      // Reload products
      await this.loadProducts();

    } catch (error) {
      console.error('Error deleting product:', error);
      this.showToast('Error deleting product', 'error');
    } finally {
      this.hideLoader();
    }
  }

  /**
   * Upload product image to Firebase Storage
   */
  async uploadProductImage(file) {
    try {
      // Validate file
      if (!file.type.startsWith('image/')) {
        throw new Error('Please upload an image file');
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image size must be less than 5MB');
      }

      const timestamp = Date.now();
      const filename = `products/${timestamp}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const storageRef = storage.ref(filename);
      
      // Upload with metadata
      const metadata = {
        contentType: file.type,
        customMetadata: {
          uploadedBy: JSON.parse(localStorage.getItem('currentUser'))?.username || 'unknown',
          uploadTime: new Date().toISOString()
        }
      };

      const uploadTask = await storageRef.put(file, metadata);
      const downloadUrl = await uploadTask.ref.getDownloadURL();
      
      return downloadUrl;

    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  }

  /**
   * Delete product image from Firebase Storage
   */
  async deleteProductImage(imageUrl) {
    try {
      const storageRef = storage.refFromURL(imageUrl);
      await storageRef.delete();
    } catch (error) {
      console.warn('Error deleting image:', error);
      // Non-critical error, continue
    }
  }

  /**
   * Search products
   */
  searchProducts(query) {
    this.searchQuery = query.toLowerCase().trim();
    this.currentPage = 1;
    this.applyFilters();
    this.renderProducts();
  }

  /**
   * Filter products by category
   */
  filterByCategory(category) {
    this.currentFilter = category;
    this.currentPage = 1;
    this.applyFilters();
    this.renderProducts();
  }

  /**
   * Apply all filters
   */
  applyFilters() {
    let filtered = [...this.products];

    // Apply category filter
    if (this.currentFilter !== 'all') {
      filtered = filtered.filter(product => 
        product.category === this.currentFilter
      );
    }

    // Apply search filter
    if (this.searchQuery) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(this.searchQuery) ||
        product.barcode?.toLowerCase().includes(this.searchQuery) ||
        product.category?.toLowerCase().includes(this.searchQuery) ||
        product.supplier?.toLowerCase().includes(this.searchQuery)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let compareA, compareB;
      
      switch (this.sortField) {
        case 'name':
          compareA = a.name.toLowerCase();
          compareB = b.name.toLowerCase();
          break;
        case 'price':
          compareA = a.sellingPrice;
          compareB = b.sellingPrice;
          break;
        case 'quantity':
          compareA = a.quantity;
          compareB = b.quantity;
          break;
        case 'dateAdded':
        default:
          compareA = a.dateAdded.getTime();
          compareB = b.dateAdded.getTime();
      }

      if (this.sortDirection === 'asc') {
        return compareA > compareB ? 1 : -1;
      } else {
        return compareA < compareB ? 1 : -1;
      }
    });

    this.filteredProducts = filtered;
  }

  /**
   * Sort products
   */
  sortProducts(field) {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
    
    this.applyFilters();
    this.renderProducts();
  }

  /**
   * Render products grid
   */
  renderProducts() {
    const container = document.getElementById('productsGrid');
    if (!container) return;

    // Pagination
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    const pageProducts = this.filteredProducts.slice(startIndex, endIndex);

    if (pageProducts.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 48px;">
          <i class="fas fa-box-open" style="font-size: 64px; color: var(--text-muted); margin-bottom: 16px;"></i>
          <h3>No products found</h3>
          <p class="text-muted">${this.searchQuery ? 'Try adjusting your search terms' : 'Add your first product to get started'}</p>
          ${!this.searchQuery ? '<button onclick="inventoryManager.showModal(\'addProductModal\')" class="btn btn-primary mt-3"><i class="fas fa-plus"></i> Add Product</button>' : ''}
        </div>
      `;
    } else {
      container.innerHTML = pageProducts.map(product => this.createProductCard(product)).join('');
    }

    // Update pagination
    this.renderPagination();
    
    // Update product count
    const countElement = document.getElementById('productCount');
    if (countElement) {
      countElement.textContent = `Showing ${startIndex + 1}-${Math.min(endIndex, this.filteredProducts.length)} of ${this.filteredProducts.length} products`;
    }
  }

  /**
   * Create product card HTML
   */
  createProductCard(product) {
    const stockStatus = product.quantity === 0 ? 'out-of-stock' : 
                       product.quantity <= 10 ? 'low-stock' : 'in-stock';
    
    const profitMargin = product.sellingPrice > 0 ? 
      ((product.sellingPrice - product.costPrice) / product.sellingPrice * 100).toFixed(1) : 0;

    return `
      <div class="product-card" data-id="${product.id}">
        <div class="product-image">
          <img src="${product.imageUrl || 'assets/images/no-image.png'}" 
               alt="${this.escapeHtml(product.name)}"
               onerror="this.src='assets/images/no-image.png'">
          <span class="stock-badge ${stockStatus}">
            ${stockStatus === 'out-of-stock' ? 'Out of Stock' : 
              stockStatus === 'low-stock' ? 'Low Stock' : 'In Stock'}
          </span>
        </div>
        <div class="product-info">
          <h4>${this.escapeHtml(product.name)}</h4>
          <div class="product-meta">
            <span class="category-badge">${this.escapeHtml(product.category)}</span>
            <span class="barcode">${product.barcode || 'No barcode'}</span>
          </div>
          <div class="product-details">
            <div class="price-section">
              <span class="selling-price">$${product.sellingPrice.toFixed(2)}</span>
              <span class="cost-price">Cost: $${product.costPrice.toFixed(2)}</span>
            </div>
            <div class="stock-section">
              <span class="quantity ${product.quantity <= 10 ? 'text-danger' : 'text-success'}">
                <i class="fas fa-cubes"></i> ${product.quantity} units
              </span>
              <span class="profit-margin ${profitMargin >= 30 ? 'text-success' : 'text-warning'}">
                <i class="fas fa-chart-line"></i> ${profitMargin}% margin
              </span>
            </div>
          </div>
          <div class="supplier-info">
            <small>Supplier: ${this.escapeHtml(product.supplier || 'N/A')}</small>
            <small>Added: ${product.dateAdded.toLocaleDateString()}</small>
          </div>
          <div class="product-actions">
            <button onclick="inventoryManager.openEditModal('${product.id}')" 
                    class="btn btn-outline btn-sm" title="Edit product">
              <i class="fas fa-edit"></i>
            </button>
            <button onclick="inventoryManager.deleteProduct('${product.id}')" 
                    class="btn btn-outline btn-sm text-danger" title="Delete product">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render pagination
   */
  renderPagination() {
    const container = document.getElementById('pagination');
    if (!container) return;

    const totalPages = Math.ceil(this.filteredProducts.length / this.itemsPerPage);
    
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '<div class="pagination">';
    
    // Previous button
    html += `
      <button onclick="inventoryManager.goToPage(${this.currentPage - 1})" 
              class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''}>
        <i class="fas fa-chevron-left"></i>
      </button>
    `;

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= this.currentPage - 2 && i <= this.currentPage + 2)) {
        html += `
          <button onclick="inventoryManager.goToPage(${i})" 
                  class="pagination-btn ${i === this.currentPage ? 'active' : ''}">
            ${i}
          </button>
        `;
      } else if (i === this.currentPage - 3 || i === this.currentPage + 3) {
        html += '<span class="pagination-ellipsis">...</span>';
      }
    }

    // Next button
    html += `
      <button onclick="inventoryManager.goToPage(${this.currentPage + 1})" 
              class="pagination-btn" ${this.currentPage === totalPages ? 'disabled' : ''}>
        <i class="fas fa-chevron-right"></i>
      </button>
    `;

    html += '</div>';
    container.innerHTML = html;
  }

  /**
   * Go to specific page
   */
  goToPage(page) {
    const totalPages = Math.ceil(this.filteredProducts.length / this.itemsPerPage);
    if (page >= 1 && page <= totalPages) {
      this.currentPage = page;
      this.renderProducts();
      
      // Scroll to top of products
      document.getElementById('productsGrid')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  /**
   * Open edit modal with product data
   */
  openEditModal(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    // Populate form
    const form = document.getElementById('editProductForm');
    if (!form) return;

    form.querySelector('[name="productId"]').value = product.id;
    form.querySelector('[name="name"]').value = product.name;
    form.querySelector('[name="barcode"]').value = product.barcode || '';
    form.querySelector('[name="category"]').value = product.category;
    form.querySelector('[name="quantity"]').value = product.quantity;
    form.querySelector('[name="costPrice"]').value = product.costPrice;
    form.querySelector('[name="sellingPrice"]').value = product.sellingPrice;
    form.querySelector('[name="supplier"]').value = product.supplier || '';

    // Show current image
    const preview = document.getElementById('editImagePreview');
    if (preview && product.imageUrl) {
      preview.src = product.imageUrl;
      preview.style.display = 'block';
    }

    this.showModal('editProductModal');
  }

  /**
   * Update inventory statistics
   */
  updateInventoryStats() {
    const totalProducts = this.products.length;
    const totalQuantity = this.products.reduce((sum, p) => sum + p.quantity, 0);
    const totalValue = this.products.reduce((sum, p) => sum + (p.quantity * p.costPrice), 0);
    const lowStock = this.products.filter(p => p.quantity > 0 && p.quantity <= 10).length;
    const outOfStock = this.products.filter(p => p.quantity === 0).length;

    this.updateElement('totalInventoryProducts', totalProducts);
    this.updateElement('totalQuantity', totalQuantity);
    this.updateElement('totalInventoryValue', `$${totalValue.toFixed(2)}`);
    this.updateElement('lowStockCount', lowStock);
    this.updateElement('outOfStockCount', outOfStock);
  }

  /**
   * Update DOM element safely
   */
  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  /**
   * Log activity to Firestore
   */
  async logActivity(action, productId, productName) {
    try {
      const user = JSON.parse(localStorage.getItem('currentUser'));
      await db.collection('activity_logs').add({
        action: action,
        productId: productId,
        productName: productName,
        performedBy: user?.username || 'Unknown',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.warn('Failed to log activity:', error);
    }
  }

  /**
   * Setup real-time sync
   */
  setupRealTimeSync() {
    this.realTimeListener = db.collection('products')
      .onSnapshot(async (snapshot) => {
        const changes = snapshot.docChanges();
        
        changes.forEach(change => {
          const productData = {
            id: change.doc.id,
            ...change.doc.data(),
            dateAdded: change.doc.data().dateAdded?.toDate() || new Date(),
            lastUpdated: change.doc.data().lastUpdated?.toDate() || new Date()
          };

          if (change.type === 'added') {
            this.products.push(productData);
          } else if (change.type === 'modified') {
            const index = this.products.findIndex(p => p.id === change.doc.id);
            if (index !== -1) {
              this.products[index] = productData;
            }
          } else if (change.type === 'removed') {
            this.products = this.products.filter(p => p.id !== change.doc.id);
          }
        });

        this.applyFilters();
        this.renderProducts();
        this.updateInventoryStats();
      });
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchProducts');
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.searchProducts(e.target.value);
        }, 300);
      });
    }

    // Category filter
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', (e) => {
        this.filterByCategory(e.target.value);
      });
    }

    // Add product form
    const addProductForm = document.getElementById('addProductForm');
    if (addProductForm) {
      addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(addProductForm);
        await this.addProduct(formData);
        addProductForm.reset();
      });
    }

    // Edit product form
    const editProductForm = document.getElementById('editProductForm');
    if (editProductForm) {
      editProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(editProductForm);
        const productId = formData.get('productId');
        await this.editProduct(productId, formData);
      });
    }

    // Image preview
    const imageInputs = document.querySelectorAll('input[type="file"][name="image"]');
    imageInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const previewId = input.id === 'editImage' ? 'editImagePreview' : 'addImagePreview';
            const preview = document.getElementById(previewId);
            if (preview) {
              preview.src = e.target.result;
              preview.style.display = 'block';
            }
          };
          reader.readAsDataURL(file);
        }
      });
    });

    // Sort buttons
    document.querySelectorAll('[data-sort]').forEach(button => {
      button.addEventListener('click', () => {
        const sortField = button.dataset.sort;
        this.sortProducts(sortField);
        
        // Update sort icons
        document.querySelectorAll('[data-sort] i').forEach(icon => {
          icon.className = 'fas fa-sort';
        });
        
        const icon = button.querySelector('i');
        if (icon) {
          icon.className = this.sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
      });
    });
  }

  /**
   * Show modal
   */
  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
  }

  /**
   * Close modal
   */
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('show');
      document.body.style.overflow = '';
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show loader
   */
  showLoader() {
    const loader = document.getElementById('inventoryLoader');
    if (loader) loader.style.display = 'flex';
  }

  /**
   * Hide loader
   */
  hideLoader() {
    const loader = document.getElementById('inventoryLoader');
    if (loader) loader.style.display = 'none';
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.realTimeListener) {
      this.realTimeListener();
    }
  }
}

// Initialize inventory manager
let inventoryManager;
document.addEventListener('DOMContentLoaded', () => {
  inventoryManager = new InventoryManager();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (inventoryManager) {
    inventoryManager.destroy();
  }
});

// Export for global access
window.inventoryManager = inventoryManager;