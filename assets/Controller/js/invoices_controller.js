// assets/Controller/js/invoices_controller.js
// Controller Layer - يربط بين البيانات والعرض ويدير حالة النظام

const State = {
    invoices: [],
    currentLimit: 50,
    currentEditingInvoiceId: null,
    searchTimeout: null,
    lookupMaps: {
        customers: {},
        customerNames: {},
        shipping: {},
        commissions: {}
    }
};

const InvoicesController = {
    async init() {
        this.bindEvents();
        await this.loadLookups();
        await this.checkAndLoadInvoices();
    },

    bindEvents() {
        // Filter dropdown
        const periodFilter = document.getElementById('invoicePeriodFilter');
        if (periodFilter) {
            periodFilter.addEventListener('change', () => {
                State.currentLimit = 50;
                this.checkAndLoadInvoices();
            });
        }

        // Search input
        const searchInput = document.getElementById('invoiceSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                if (State.searchTimeout) clearTimeout(State.searchTimeout);
                State.searchTimeout = setTimeout(() => {
                    State.currentLimit = 50;
                    this.renderFilteredInvoices();
                }, 300);
            });
        }

        // Add form
        const addForm = document.getElementById('addInvoiceForm');
        if (addForm) {
            addForm.addEventListener('submit', (e) => this.handleAddInvoice(e));
        }

        // Edit form
        const editForm = document.getElementById('editInvoiceForm');
        if (editForm) {
            editForm.addEventListener('submit', (e) => this.handleEditInvoice(e));
        }
    },

    async loadLookups() {
        try {
            const cachedCustomers = sessionStorage.getItem('cached_customers');
            const cachedShipping = sessionStorage.getItem('cached_shipping');
            const cachedCommissions = sessionStorage.getItem('cached_commissions');

            let customersData, shippingData, commissionsData;

            if (cachedCustomers && cachedShipping && cachedCommissions) {
                customersData = JSON.parse(cachedCustomers);
                shippingData = JSON.parse(cachedShipping);
                commissionsData = JSON.parse(cachedCommissions);
            } else {
                [customersData, shippingData, commissionsData] = await Promise.all([
                    InvoicesAPI.fetchCustomers(),
                    InvoicesAPI.fetchShippingRates(),
                    InvoicesAPI.fetchCommissions()
                ]);

                sessionStorage.setItem('cached_customers', JSON.stringify(customersData));
                sessionStorage.setItem('cached_shipping', JSON.stringify(shippingData));
                sessionStorage.setItem('cached_commissions', JSON.stringify(commissionsData));
            }

            // Build Lookup Maps
            State.lookupMaps.customers = this.buildLookupMap(customersData, 'customer_custom_id');
            State.lookupMaps.customerNames = this.buildLookupMap(customersData, 'full_name');
            State.lookupMaps.shipping = this.buildLookupMap(shippingData, 'country_name');
            State.lookupMaps.commissions = this.buildLookupMap(commissionsData, 'commission_rate');

            // Populate DOM Selects
            InvoicesUI.fillSelectOptions('invoiceCustomerId', customersData, item => item.customer_custom_id || 'بدون ID');
            InvoicesUI.fillSelectOptions('editInvoiceCustomerId', customersData, item => item.customer_custom_id || 'بدون ID');
            InvoicesUI.fillSelectOptions('invoiceShippingDestinationId', shippingData, item => item.country_name || 'بدون اسم');
            InvoicesUI.fillSelectOptions('editInvoiceShippingDestinationId', shippingData, item => item.country_name || 'بدون اسم');
            InvoicesUI.fillSelectOptions('invoiceCommissionId', commissionsData, item => `${item.commission_rate ?? '-'} %`);
            InvoicesUI.fillSelectOptions('editInvoiceCommissionId', commissionsData, item => `${item.commission_rate ?? '-'} %`);

        } catch (err) {
            console.error('Failed to load lookups:', err);
            InvoicesUI.showToast('حدث خطأ أثناء تحميل القوائم.', 'error');
        }
    },

    async checkAndLoadInvoices() {
        InvoicesUI.showLoadingState();
        try {
            const periodFilter = document.getElementById('invoicePeriodFilter')?.value || 'week';
            State.invoices = await InvoicesAPI.fetchInvoices(periodFilter);
            this.renderFilteredInvoices();
        } catch (err) {
            console.error('فشل تحميل الفواتير:', err);
            InvoicesUI.showErrorState(err.message || 'حدث خطأ غير متوقع');
        }
    },

    renderFilteredInvoices() {
        const searchText = this.normalizeText(document.getElementById('invoiceSearchInput')?.value || '');

        const filtered = State.invoices.filter(item => {
            if (!searchText) return true;

            const invoiceNumber = this.normalizeText(item.invoice_number);
            const customerCustomId = this.normalizeText(State.lookupMaps.customers[item.customer_id]);
            const shippingDestination = this.normalizeText(State.lookupMaps.shipping[item.shipping_destination_id]);
            const shippingAddressText = this.normalizeText(item.shipping_address_text);

            return (
                invoiceNumber.includes(searchText) ||
                customerCustomId.includes(searchText) ||
                shippingDestination.includes(searchText) ||
                shippingAddressText.includes(searchText)
            );
        });

        const invoicesToShow = filtered.slice(0, State.currentLimit);
        InvoicesUI.renderInvoicesTable(invoicesToShow, filtered.length, State.currentLimit, State.lookupMaps);
    },

    loadMoreInvoices() {
        State.currentLimit += 50;
        this.renderFilteredInvoices();
    },

    async deleteInvoice(uuid) {
        if (!confirm('هل أنت متأكد من حذف هذه الفاتورة نهائياً؟')) return;

        const toast = InvoicesUI.showToast('جاري حذف الفاتورة حالياً...', 'info');

        try {
            await InvoicesAPI.deleteInvoice(uuid);
            State.invoices = State.invoices.filter(inv => inv.id !== uuid);
            InvoicesUI.removeInvoiceRow(uuid);

            if (State.invoices.length === 0) {
                this.renderFilteredInvoices();
            }

            toast.update('🗑️ تم حذف الفاتورة بنجاح!', 'success');
        } catch (err) {
            console.error('فشل الحذف:', err);
            toast.update(`❌ فشل الحذف: ${err.message || 'حدث خطأ ما'}`, 'error');
        }
    },

    async handleAddInvoice(e) {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        InvoicesUI.setButtonLoading(submitBtn, true, 'حفظ');

        const payload = {
            customer_id: document.getElementById('invoiceCustomerId').value,
            shipping_destination_id: document.getElementById('invoiceShippingDestinationId').value,
            shipping_address_text: document.getElementById('invoiceShippingAddressText').value.trim(),
            commission_id: document.getElementById('invoiceCommissionId').value,
            invoice_date: document.getElementById('invoiceDate').value || new Date().toISOString().split('T')[0]
        };

        const toast = InvoicesUI.showToast('جاري حفظ الفاتورة...', 'info');

        try {
            const data = await InvoicesAPI.insertInvoice(payload);
            State.invoices.unshift(data);
            this.renderFilteredInvoices();

            InvoicesUI.closeAddInvoiceModal();
            toast.update('🎉 تم إضافة الفاتورة بنجاح!', 'success');
        } catch (err) {
            console.error('فشل الإضافة:', err);
            toast.update(`❌ فشل حفظ الفاتورة: ${err.message || 'خطأ غير معروف'}`, 'error');
        } finally {
            InvoicesUI.setButtonLoading(submitBtn, false, 'حفظ');
        }
    },

    openEditInvoiceModal(uuid) {
        const data = State.invoices.find(inv => inv.id === uuid);
        if (!data) {
            InvoicesUI.showToast('لم يتم العثور على الفاتورة!', 'error');
            return;
        }
        State.currentEditingInvoiceId = uuid;
        InvoicesUI.showEditInvoiceModal(data);
    },

    async handleEditInvoice(e) {
        e.preventDefault();
        if (!State.currentEditingInvoiceId) return;

        const submitBtn = e.target.querySelector('button[type="submit"]');
        InvoicesUI.setButtonLoading(submitBtn, true, 'حفظ التعديلات');

        const payload = {
            customer_id: document.getElementById('editInvoiceCustomerId').value,
            shipping_destination_id: document.getElementById('editInvoiceShippingDestinationId').value,
            shipping_address_text: document.getElementById('editInvoiceShippingAddressText').value.trim(),
            commission_id: document.getElementById('editInvoiceCommissionId').value,
            invoice_date: document.getElementById('editInvoiceDate').value || null
        };

        const toast = InvoicesUI.showToast('جاري حفظ التعديلات...', 'info');

        try {
            const data = await InvoicesAPI.updateInvoice(State.currentEditingInvoiceId, payload);
            
            const index = State.invoices.findIndex(inv => inv.id === State.currentEditingInvoiceId);
            if (index !== -1) {
                State.invoices[index] = data;
            }

            const newRow = InvoicesUI.createInvoiceRow(data, State.lookupMaps);
            InvoicesUI.updateInvoiceRow(State.currentEditingInvoiceId, newRow);

            InvoicesUI.closeEditInvoiceModal();
            toast.update('🎉 تم تحديث الفاتورة بنجاح!', 'success');
        } catch (err) {
            console.error('فشل التحديث:', err);
            toast.update(`❌ فشل التحديث: ${err.message || 'خطأ غير معروف'}`, 'error');
        } finally {
            InvoicesUI.setButtonLoading(submitBtn, false, 'حفظ التعديلات');
        }
    },

    buildLookupMap(list, valueKey) {
        const map = {};
        list.forEach(item => {
            map[item.id] = item[valueKey];
        });
        return map;
    },

    normalizeText(value) {
        return String(value ?? '').toLowerCase().trim();
    }
};

window.InvoicesController = InvoicesController;
window.addEventListener('DOMContentLoaded', () => {
    InvoicesController.init();
});
