// assets/js/invoices/invoices_main.js

window.loadMoreInvoices = function() {
    InvoicesState.currentLimit += 50;
    renderInvoicesTable();
};

window.handleFilterChange = function() {
    InvoicesState.currentLimit = 50;
    renderInvoicesTable();
};

window.handleSearchInput = function() {
    // تقنية Debouncing لتأخير الفلترة ومنع تعليق الصفحة
    if (InvoicesState.searchTimeout) {
        clearTimeout(InvoicesState.searchTimeout);
    }
    InvoicesState.searchTimeout = setTimeout(() => {
        handleFilterChange();
    }, 300); // تأخير 300 مللي ثانية
};

window.deleteInvoice = async function(uuid) {
    if (!confirm('هل أنت متأكد من حذف هذه الفاتورة نهائياً؟')) return;

    const toast = showToast('جاري حذف الفاتورة حالياً...', 'info');

    try {
        await deleteInvoiceApi(uuid);

        InvoicesState.invoices = InvoicesState.invoices.filter(inv => inv.id !== uuid);

        const row = document.getElementById(`invoice-row-${uuid}`);
        if (row) {
            row.classList.add('opacity-0', 'scale-95');
            setTimeout(() => {
                row.remove();
                if (InvoicesState.invoices.length === 0) renderInvoicesTable();
            }, 300);
        }

        toast.update('🗑️ تم حذف الفاتورة بنجاح!', 'success');
        setTimeout(() => toast.remove(), 2500);
    } catch (err) {
        console.error('فشل الحذف:', err);
        toast.update(`❌ فشل الحذف: ${err.message || 'حدث خطأ ما'}`, 'error');
        setTimeout(() => toast.remove(), 4000);
    }
};

document.getElementById('addInvoiceForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white inline-block ml-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            جاري الحفظ...
        `;
        submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
    }

    const payload = {
        customer_id: document.getElementById('invoiceCustomerId').value,
        shipping_destination_id: document.getElementById('invoiceShippingDestinationId').value,
        shipping_address_text: document.getElementById('invoiceShippingAddressText').value.trim(),
        commission_id: document.getElementById('invoiceCommissionId').value
    };

    const invoiceDate = document.getElementById('invoiceDate').value || getTodayDateISO();
    payload.invoice_date = invoiceDate;

    const toast = showToast('جاري حفظ الفاتورة...', 'info');

    try {
        const { data, error } = await _supabase
            .from('invoices')
            .insert([payload])
            .select()
            .single();

        if (error) throw error;

        InvoicesState.invoices.unshift(data);
        renderInvoicesTable();

        closeAddInvoiceModal();
        toast.update('🎉 تم إضافة الفاتورة بنجاح!', 'success');
        setTimeout(() => toast.remove(), 3000);
    } catch (err) {
        console.error('فشل الإضافة:', err);
        toast.update(`❌ فشل حفظ الفاتورة: ${err.message || 'خطأ غير معروف'}`, 'error');
        setTimeout(() => toast.remove(), 4000);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'حفظ';
            submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    }
});

document.getElementById('editInvoiceForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!InvoicesState.currentEditingInvoiceId) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white inline-block ml-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            جاري التحديث...
        `;
        submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
    }

    const payload = {
        customer_id: document.getElementById('editInvoiceCustomerId').value,
        shipping_destination_id: document.getElementById('editInvoiceShippingDestinationId').value,
        shipping_address_text: document.getElementById('editInvoiceShippingAddressText').value.trim(),
        commission_id: document.getElementById('editInvoiceCommissionId').value
    };

    const invoiceDate = document.getElementById('editInvoiceDate').value;
    payload.invoice_date = invoiceDate || null;

    const toast = showToast('جاري حفظ التعديلات...', 'info');

    try {
        const { data, error } = await _supabase
            .from('invoices')
            .update(payload)
            .eq('id', InvoicesState.currentEditingInvoiceId)
            .select()
            .single();

        if (error) throw error;

        const index = InvoicesState.invoices.findIndex(inv => inv.id === InvoicesState.currentEditingInvoiceId);
        if (index !== -1) {
            InvoicesState.invoices[index] = data;
        }

        const existingRow = document.getElementById(`invoice-row-${InvoicesState.currentEditingInvoiceId}`);
        if (existingRow) {
            const newRow = createInvoiceRow(data);
            existingRow.replaceWith(newRow);
            
            newRow.classList.add('bg-green-100');
            setTimeout(() => newRow.classList.remove('bg-green-100'), 1000);
        }

        closeEditInvoiceModal();
        toast.update('🎉 تم تحديث الفاتورة بنجاح!', 'success');
        setTimeout(() => toast.remove(), 3000);
    } catch (err) {
        console.error('فشل التحديث:', err);
        toast.update(`❌ فشل التحديث: ${err.message || 'خطأ غير معروف'}`, 'error');
        setTimeout(() => toast.remove(), 4000);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'حفظ التعديلات';
            submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    }
});

const invoicePeriodFilter = document.getElementById('invoicePeriodFilter');
if (invoicePeriodFilter) {
    invoicePeriodFilter.addEventListener('change', () => {
        handleFilterChange();
        checkAndLoadInvoices();
    });
}

const invoiceSearchInput = document.getElementById('invoiceSearchInput');
if (invoiceSearchInput) {
    invoiceSearchInput.addEventListener('input', handleSearchInput);
}

// تحميل الفواتير عند فتح الصفحة
checkAndLoadInvoices();
