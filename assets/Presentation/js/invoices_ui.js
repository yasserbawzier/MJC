// assets/Presentation/js/invoices_ui.js
// Presentation Layer - مسؤولة عن جميع تفاعلات واجهة المستخدم وتعديلات DOM

const InvoicesUI = {
    showToast(message, type = 'info') {
        const notifier = (window.parent && window.parent !== window && window.parent.showNotification) 
            ? window.parent.showNotification 
            : window.showNotification;
        if (notifier) {
            return notifier(message, type);
        }
        alert(message);
        return { update: () => {}, remove: () => {} };
    },

    fillSelectOptions(selectId, list, labelBuilder) {
        const select = document.getElementById(selectId);
        if (!select) return;

        select.innerHTML = '<option value="">اختر...</option>';
        list.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = labelBuilder(item);
            select.appendChild(option);
        });
    },

    createInvoiceRow(item, lookupMaps) {
        const template = document.getElementById('invoiceRowTemplate');
        if (!template) return document.createElement('tr'); // Fallback if template missing

        const row = template.content.cloneNode(true).querySelector('tr');
        row.id = `invoice-row-${item.id}`;

        row.querySelector('.number-cell').textContent = item.invoice_number || '-';
        row.querySelector('.customer-id-cell').textContent = lookupMaps.customers[item.customer_id] || '-';
        row.querySelector('.customer-name-cell').textContent = lookupMaps.customerNames[item.customer_id] || '-';
        row.querySelector('.shipping-destination-cell').textContent = lookupMaps.shipping[item.shipping_destination_id] || '-';
        row.querySelector('.shipping-address-cell').textContent = item.shipping_address_text || '-';
        row.querySelector('.commission-cell').textContent = lookupMaps.commissions[item.commission_id] !== undefined ? `${lookupMaps.commissions[item.commission_id]} %` : '-';
        row.querySelector('.price-cell').textContent = item.Price_Per_CBM ?? '-';

        row.querySelector('.edit-btn').setAttribute('onclick', `InvoicesController.openEditInvoiceModal('${item.id}')`);
        row.querySelector('.add-items-btn').setAttribute('onclick', `InvoicesUI.openInvoiceItemsPage('${item.id}')`);
        row.querySelector('.commissions-btn').setAttribute('onclick', `InvoicesUI.openInvoiceCommissionsPage('${item.id}')`);
        row.querySelector('.delete-btn').setAttribute('onclick', `InvoicesController.deleteInvoice('${item.id}')`);

        return row;
    },

    renderInvoicesTable(invoicesToRender, totalFilteredCount, limit, lookupMaps) {
        const tbody = document.getElementById('invoicesTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        if (totalFilteredCount === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-500">لا توجد نتائج مطابقة لعرضها.</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();

        invoicesToRender.forEach(item => {
            const row = this.createInvoiceRow(item, lookupMaps);
            fragment.appendChild(row);
        });

        if (totalFilteredCount > limit) {
            const loadMoreRow = document.createElement('tr');
            loadMoreRow.innerHTML = `
                <td colspan="8" class="p-4 text-center">
                    <button onclick="InvoicesController.loadMoreInvoices()" class="bg-blue-50 border border-blue-200 text-blue-700 px-6 py-2 rounded-full font-bold hover:bg-blue-100 transition-all shadow-sm">
                        عرض المزيد من الفواتير (متبقي ${totalFilteredCount - limit})
                    </button>
                </td>
            `;
            fragment.appendChild(loadMoreRow);
        }

        tbody.appendChild(fragment);
    },

    showLoadingState() {
        const tbody = document.getElementById('invoicesTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center font-bold text-gray-600">جاري تحميل الفواتير... ⏳</td></tr>';
        }
    },

    showErrorState(message) {
        const tbody = document.getElementById('invoicesTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-red-500 font-bold">خطأ: ${message}</td></tr>`;
        }
    },

    setButtonLoading(btn, isLoading, originalText) {
        if (!btn) return;
        if (isLoading) {
            btn.disabled = true;
            btn.innerHTML = `
                <svg class="animate-spin h-5 w-5 text-white inline-block ml-2" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                جاري التحميل...
            `;
            btn.classList.add('opacity-75', 'cursor-not-allowed');
        } else {
            btn.disabled = false;
            btn.innerHTML = originalText;
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    },

    removeInvoiceRow(uuid) {
        const row = document.getElementById(`invoice-row-${uuid}`);
        if (row) {
            row.classList.add('opacity-0', 'scale-95');
            setTimeout(() => {
                row.remove();
            }, 300);
        }
    },

    updateInvoiceRow(uuid, newRow) {
        const existingRow = document.getElementById(`invoice-row-${uuid}`);
        if (existingRow) {
            existingRow.replaceWith(newRow);
            newRow.classList.add('bg-green-100');
            setTimeout(() => newRow.classList.remove('bg-green-100'), 1000);
        }
    },

    // -----------------------------------------
    // Modals & Navigation
    // -----------------------------------------
    showAddInvoiceModal() {
        document.getElementById('invoiceDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('addInvoiceModal').classList.remove('hidden');
    },

    closeAddInvoiceModal() {
        document.getElementById('addInvoiceModal').classList.add('hidden');
        document.getElementById('addInvoiceForm')?.reset();
    },

    showEditInvoiceModal(data) {
        document.getElementById('editInvoiceNumber').value = data.invoice_number || '';
        document.getElementById('editInvoiceCustomerId').value = data.customer_id || '';
        document.getElementById('editInvoiceShippingDestinationId').value = data.shipping_destination_id || '';
        document.getElementById('editInvoiceShippingAddressText').value = data.shipping_address_text || '';
        document.getElementById('editInvoiceCommissionId').value = data.commission_id || '';
        document.getElementById('editInvoiceDate').value = data.invoice_date || '';
        document.getElementById('editPricePerCbmPreview').value = data.Price_Per_CBM ?? '';

        document.getElementById('editInvoiceModal').classList.remove('hidden');
    },

    closeEditInvoiceModal() {
        document.getElementById('editInvoiceModal').classList.add('hidden');
    },

    openInvoiceItemsPage(invoiceId) {
        if (!invoiceId) return;
        
        const iframeSection = document.getElementById('section-iframe-spa');
        const loader = document.getElementById('iframeViewLoader');
        const spinner = document.getElementById('iframeViewSpinner');
        
        if (iframeSection && loader) {
            // Hide all other active page sections
            document.querySelectorAll('.page-section').forEach(sec => sec.classList.add('hidden'));
            
            if (spinner) spinner.classList.remove('hidden');
            loader.src = `assets/Presentation/html/invoice_items.html?invoice_id=${encodeURIComponent(invoiceId)}`;
            iframeSection.classList.remove('hidden');
        } else {
            window.location.href = `assets/Presentation/html/invoice_items.html?invoice_id=${encodeURIComponent(invoiceId)}`;
        }
    },

    openInvoiceCommissionsPage(invoiceId) {
        if (!invoiceId) return;
        
        const iframeSection = document.getElementById('section-iframe-spa');
        const loader = document.getElementById('iframeViewLoader');
        const spinner = document.getElementById('iframeViewSpinner');
        
        if (iframeSection && loader) {
            // Hide all other active page sections
            document.querySelectorAll('.page-section').forEach(sec => sec.classList.add('hidden'));
            
            if (spinner) spinner.classList.remove('hidden');
            loader.src = `assets/Presentation/html/commissions.html?invoice_id=${encodeURIComponent(invoiceId)}`;
            iframeSection.classList.remove('hidden');
        } else {
            window.location.href = `assets/Presentation/html/commissions.html?invoice_id=${encodeURIComponent(invoiceId)}`;
        }
    },

    closeIframeView() {
        // Change parent location hash to #invoices to trigger sidebar navigation natively
        window.location.hash = '#invoices';

        const iframeSection = document.getElementById('section-iframe-spa');
        const loader = document.getElementById('iframeViewLoader');
        if (iframeSection) {
            iframeSection.classList.add('hidden');
            if (loader) loader.src = '';
        }

        // Direct fallback: make sure the invoices section is visible and highlighted in the sidebar
        const invoicesSection = document.getElementById('section-invoices');
        if (invoicesSection) {
            invoicesSection.classList.remove('hidden');
        }

        const links = document.querySelectorAll('.nav-link');
        links.forEach(l => {
            if (l.getAttribute('href') === '#invoices') {
                links.forEach(link => link.classList.remove('active'));
                l.classList.add('active');
            }
        });
        
        // Refresh invoices list to reflect updated totals or items count in real time
        if (typeof InvoicesController !== 'undefined' && InvoicesController.loadInvoices) {
            InvoicesController.loadInvoices();
        }
    }
};

window.InvoicesUI = InvoicesUI;
