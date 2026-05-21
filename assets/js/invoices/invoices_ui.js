// assets/js/invoices/invoices_ui.js

window.fillSelectOptions = function(selectId, list, labelBuilder) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = '<option value="">اختر...</option>';
    list.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = labelBuilder(item);
        select.appendChild(option);
    });
};

window.showToast = function(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-item ${type} hidden-toast`;
    toast.innerHTML = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('hidden-toast');
    }, 10);
    
    return {
        update: (newMessage, newType) => {
            toast.className = `toast-item ${newType}`;
            toast.innerHTML = newMessage;
        },
        remove: () => {
            toast.classList.add('hidden-toast');
            setTimeout(() => toast.remove(), 300);
        }
    };
};

window.createInvoiceRow = function(item) {
    const template = document.getElementById('invoiceRowTemplate');
    const row = template.content.cloneNode(true).querySelector('tr');
    
    row.id = `invoice-row-${item.id}`;

    row.querySelector('.number-cell').textContent = item.invoice_number || '-';
    row.querySelector('.customer-id-cell').textContent = InvoicesState.customersMap[item.customer_id] || '-';
    row.querySelector('.customer-name-cell').textContent = InvoicesState.customerNameMap[item.customer_id] || '-';
    row.querySelector('.shipping-destination-cell').textContent = InvoicesState.shippingMap[item.shipping_destination_id] || '-';
    row.querySelector('.shipping-address-cell').textContent = item.shipping_address_text || '-';
    row.querySelector('.commission-cell').textContent = InvoicesState.commissionsMap[item.commission_id] !== undefined ? `${InvoicesState.commissionsMap[item.commission_id]} %` : '-';
    row.querySelector('.price-cell').textContent = item.Price_Per_CBM ?? '-';

    row.querySelector('.edit-btn').setAttribute('onclick', `openEditInvoiceModal('${item.id}')`);
    row.querySelector('.add-items-btn').setAttribute('onclick', `openInvoiceItemsPage('${item.id}')`);
    row.querySelector('.commissions-btn').setAttribute('onclick', `openInvoiceCommissionsPage('${item.id}')`);
    row.querySelector('.delete-btn').setAttribute('onclick', `deleteInvoice('${item.id}')`);

    return row;
};

window.renderInvoicesTable = function() {
    const tbody = document.getElementById('invoicesTableBody');
    tbody.innerHTML = '';

    if (InvoicesState.invoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-500">لا توجد فواتير في هذه الفترة حالياً.</td></tr>';
        return;
    }

    const searchText = normalizeText(document.getElementById('invoiceSearchInput')?.value || '');

    const filtered = InvoicesState.invoices.filter(item => {
        if (!searchText) return true;

        const invoiceNumber = normalizeText(item.invoice_number);
        const customerCustomId = normalizeText(InvoicesState.customersMap[item.customer_id]);
        const shippingDestination = normalizeText(InvoicesState.shippingMap[item.shipping_destination_id]);
        const shippingAddressText = normalizeText(item.shipping_address_text);

        return (
            invoiceNumber.includes(searchText) ||
            customerCustomId.includes(searchText) ||
            shippingDestination.includes(searchText) ||
            shippingAddressText.includes(searchText)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-500">لا توجد نتائج مطابقة للبحث.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    const invoicesToShow = filtered.slice(0, InvoicesState.currentLimit);

    invoicesToShow.forEach(item => {
        const row = createInvoiceRow(item);
        fragment.appendChild(row);
    });

    if (filtered.length > InvoicesState.currentLimit) {
        const loadMoreRow = document.createElement('tr');
        loadMoreRow.innerHTML = `
            <td colspan="8" class="p-4 text-center">
                <button onclick="loadMoreInvoices()" class="bg-blue-50 border border-blue-200 text-blue-700 px-6 py-2 rounded-full font-bold hover:bg-blue-100 transition-all shadow-sm">
                    عرض المزيد من الفواتير (متبقي ${filtered.length - InvoicesState.currentLimit})
                </button>
            </td>
        `;
        fragment.appendChild(loadMoreRow);
    }

    tbody.appendChild(fragment);
};

window.showAddInvoiceModal = function() {
    document.getElementById('invoiceDate').value = getTodayDateISO();
    document.getElementById('addInvoiceModal').classList.remove('hidden');
};

window.closeAddInvoiceModal = function() {
    document.getElementById('addInvoiceModal').classList.add('hidden');
    document.getElementById('addInvoiceForm').reset();
};

window.openEditInvoiceModal = function(uuid) {
    const data = InvoicesState.invoices.find(inv => inv.id === uuid);
    if (!data) {
        showToast('لم يتم العثور على الفاتورة في الذاكرة المحلية!', 'error');
        return;
    }

    document.getElementById('editInvoiceNumber').value = data.invoice_number || '';
    document.getElementById('editInvoiceCustomerId').value = data.customer_id || '';
    document.getElementById('editInvoiceShippingDestinationId').value = data.shipping_destination_id || '';
    document.getElementById('editInvoiceShippingAddressText').value = data.shipping_address_text || '';
    document.getElementById('editInvoiceCommissionId').value = data.commission_id || '';
    document.getElementById('editInvoiceDate').value = data.invoice_date || '';
    document.getElementById('editPricePerCbmPreview').value = data.Price_Per_CBM ?? '';

    InvoicesState.currentEditingInvoiceId = uuid;
    document.getElementById('editInvoiceModal').classList.remove('hidden');
};

window.closeEditInvoiceModal = function() {
    document.getElementById('editInvoiceModal').classList.add('hidden');
    InvoicesState.currentEditingInvoiceId = null;
};

window.openInvoiceItemsPage = function(invoiceId) {
    if (!invoiceId) return;
    window.location.href = `invoice_items.html?invoice_id=${encodeURIComponent(invoiceId)}`;
};

window.openInvoiceCommissionsPage = function(invoiceId) {
    if (!invoiceId) return;
    window.location.href = `commissions.html?invoice_id=${encodeURIComponent(invoiceId)}`;
};
