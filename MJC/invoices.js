/**
 * صفحة الفواتير:
 * - تعرض بيانات invoices للمستخدم بشكل مفهوم (بدون IDs الخام).
 * - تستخدم customer_custom_id واسم الدولة وcommission_rate بدل المفاتيح الخارجية.
 * - لا ترسل Price_Per_CBM عند الإضافة/التعديل لأن القاعدة تعبيه تلقائيا.
 */

let customersLookup = [];
let shippingLookup = [];
let commissionsLookup = [];

function getTodayDateISO() {
    return new Date().toISOString().split('T')[0];
}

function getDateDaysAgoISO(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

function normalizeText(value) {
    return String(value ?? '').toLowerCase().trim();
}

function buildLookupMap(list, valueKey) {
    const map = {};
    list.forEach(item => {
        map[item.id] = item[valueKey];
    });
    return map;
}

function fillSelectOptions(selectId, list, labelBuilder) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = '<option value="">اختر...</option>';
    list.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = labelBuilder(item);
        select.appendChild(option);
    });
}

async function loadFormLookups() {
    const [customersRes, shippingRes, commissionsRes] = await Promise.all([
        _supabase.from('customers').select('id, customer_custom_id, full_name'),
        _supabase.from('shipping_rates').select('id, country_name'),
        _supabase.from('commissions_settings').select('id, commission_rate')
    ]);

    if (customersRes.error) throw customersRes.error;
    if (shippingRes.error) throw shippingRes.error;
    if (commissionsRes.error) throw commissionsRes.error;

    customersLookup = customersRes.data || [];
    shippingLookup = shippingRes.data || [];
    commissionsLookup = commissionsRes.data || [];

    fillSelectOptions('invoiceCustomerId', customersLookup, item => item.customer_custom_id || 'بدون ID');
    fillSelectOptions('editInvoiceCustomerId', customersLookup, item => item.customer_custom_id || 'بدون ID');

    fillSelectOptions('invoiceShippingDestinationId', shippingLookup, item => item.country_name || 'بدون اسم');
    fillSelectOptions('editInvoiceShippingDestinationId', shippingLookup, item => item.country_name || 'بدون اسم');

    fillSelectOptions('invoiceCommissionId', commissionsLookup, item => `${item.commission_rate ?? '-'} %`);
    fillSelectOptions('editInvoiceCommissionId', commissionsLookup, item => `${item.commission_rate ?? '-'} %`);
}

async function checkAndLoadInvoices() {
    const tableBody = document.getElementById('invoicesTableBody');
    tableBody.innerHTML = '<tr><td colspan="8" class="p-4 text-center">جاري التحميل...</td></tr>';

    try {
        await loadFormLookups();

        const periodFilter = document.getElementById('invoicePeriodFilter')?.value || 'week';
        const searchText = normalizeText(document.getElementById('invoiceSearchInput')?.value || '');

        let query = _supabase
            .from('invoices')
            .select('id, invoice_number, customer_id, shipping_destination_id, shipping_address_text, commission_id, Price_Per_CBM, invoice_date, created_at')
            .order('created_at', { ascending: false });

        // الافتراضي آخر أسبوع لتخفيف التحميل.
        if (periodFilter === 'week') {
            query = query.gte('invoice_date', getDateDaysAgoISO(7));
        } else if (periodFilter === 'month') {
            query = query.gte('invoice_date', getDateDaysAgoISO(30));
        }

        const { data, error } = await query;

        if (error) {
            tableBody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-red-500">خطأ: ${error.message}</td></tr>`;
            return;
        }

        if (!data || data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-500">لا توجد فواتير حالياً.</td></tr>';
            return;
        }

        const customerMap = buildLookupMap(customersLookup, 'customer_custom_id');
        const customerNameMap = buildLookupMap(customersLookup, 'full_name');
        const shippingMap = buildLookupMap(shippingLookup, 'country_name');
        const commissionsMap = buildLookupMap(commissionsLookup, 'commission_rate');

        const filteredData = data.filter(item => {
            if (!searchText) return true;

            const invoiceNumber = normalizeText(item.invoice_number);
            const customerCustomId = normalizeText(customerMap[item.customer_id]);
            const shippingDestination = normalizeText(shippingMap[item.shipping_destination_id]);
            const shippingAddressText = normalizeText(item.shipping_address_text);

            return (
                invoiceNumber.includes(searchText) ||
                customerCustomId.includes(searchText) ||
                shippingDestination.includes(searchText) ||
                shippingAddressText.includes(searchText)
            );
        });

        if (filteredData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-500">لا توجد نتائج مطابقة للبحث.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        filteredData.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-blue-50 transition relative group';

            row.innerHTML = `
                <td class="p-4">${item.invoice_number || '-'}</td>
                <td class="p-4">${customerMap[item.customer_id] || '-'}</td>
                <td class="p-4">${customerNameMap[item.customer_id] || '-'}</td>
                <td class="p-4">${shippingMap[item.shipping_destination_id] || '-'}</td>
                <td class="p-4">${item.shipping_address_text || '-'}</td>
                <td class="p-4">${commissionsMap[item.commission_id] ?? '-'}</td>
                <td class="p-4">${item.Price_Per_CBM ?? '-'}</td>
                <td class="p-4 text-left whitespace-nowrap">
                    <button onclick="openEditInvoiceModal('${item.id}')" class="opacity-0 group-hover:opacity-100 bg-blue-600 text-white px-3 py-1 rounded shadow-sm hover:bg-blue-700 transition-all text-sm ml-2">تعديل</button>
                    <button onclick="openInvoiceItemsPage('${item.id}')" class="opacity-0 group-hover:opacity-100 bg-green-600 text-white px-3 py-1 rounded shadow-sm hover:bg-green-700 transition-all text-sm ml-2">إضافة عناصر</button>
                    <button onclick="openCommissionsPage('${item.id}')" class="opacity-0 group-hover:opacity-100 bg-yellow-500 text-white px-3 py-1 rounded shadow-sm hover:bg-yellow-600 transition-all text-sm ml-2">العمولات</button>
                    <button onclick="deleteInvoice('${item.id}')" class="opacity-0 group-hover:opacity-100 bg-red-600 text-white px-3 py-1 rounded shadow-sm hover:bg-red-700 transition-all text-sm">حذف</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (err) {
        console.error('فشل تحميل الفواتير:', err);
        tableBody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-red-500">حدث خطأ غير متوقع.</td></tr>';
    }
}

function openInvoiceItemsPage(invoiceId) {
    if (!invoiceId) return;
    window.location.href = `invoice_items.html?invoice_id=${encodeURIComponent(invoiceId)}`;
}

function openCommissionsPage(invoiceId) {
    if (!invoiceId) return;
    window.location.href = `commissions.html?invoice_id=${encodeURIComponent(invoiceId)}`;
}

function showAddInvoiceModal() {
    document.getElementById('invoiceDate').value = getTodayDateISO();
    document.getElementById('addInvoiceModal').classList.remove('hidden');
}

function closeAddInvoiceModal() {
    document.getElementById('addInvoiceModal').classList.add('hidden');
    document.getElementById('addInvoiceForm').reset();
}

function closeEditInvoiceModal() {
    document.getElementById('editInvoiceModal').classList.add('hidden');
    window.currentEditingInvoiceId = null;
}

document.getElementById('addInvoiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerText = 'جاري الحفظ...';
    submitBtn.classList.add('opacity-50', 'cursor-not-allowed');

    const payload = {
        customer_id: document.getElementById('invoiceCustomerId').value,
        shipping_destination_id: document.getElementById('invoiceShippingDestinationId').value,
        shipping_address_text: document.getElementById('invoiceShippingAddressText').value.trim(),
        commission_id: document.getElementById('invoiceCommissionId').value
    };

    const invoiceDate = document.getElementById('invoiceDate').value || getTodayDateISO();
    payload.invoice_date = invoiceDate;

    try {
        // لا نرسل Price_Per_CBM: القاعدة هي التي تعبيه تلقائيا.
        const { error } = await _supabase.from('invoices').insert([payload]);
        if (error) throw error;

        alert('تمت إضافة الفاتورة بنجاح ✅');
        closeAddInvoiceModal();
        checkAndLoadInvoices();
    } catch (err) {
        console.error('فشل الإضافة:', err.message);
        alert('حدث خطأ أثناء الإضافة: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'حفظ';
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
});

async function openEditInvoiceModal(uuid) {
    try {
        const { data, error } = await _supabase
            .from('invoices')
            .select('id, invoice_number, customer_id, shipping_destination_id, shipping_address_text, commission_id, Price_Per_CBM, invoice_date')
            .eq('id', uuid)
            .single();

        if (error) throw error;

        document.getElementById('editInvoiceNumber').value = data.invoice_number || '';
        document.getElementById('editInvoiceCustomerId').value = data.customer_id || '';
        document.getElementById('editInvoiceShippingDestinationId').value = data.shipping_destination_id || '';
        document.getElementById('editInvoiceShippingAddressText').value = data.shipping_address_text || '';
        document.getElementById('editInvoiceCommissionId').value = data.commission_id || '';
        document.getElementById('editInvoiceDate').value = data.invoice_date || '';
        document.getElementById('editPricePerCbmPreview').value = data.Price_Per_CBM ?? '';

        window.currentEditingInvoiceId = uuid;
        document.getElementById('editInvoiceModal').classList.remove('hidden');
    } catch (err) {
        alert('فشل جلب بيانات الفاتورة: ' + err.message);
    }
}

async function updateEditedInvoiceData(e) {
    e.preventDefault();

    const targetId = window.currentEditingInvoiceId;
    if (!targetId) {
        alert('لا يوجد فاتورة محددة للتعديل.');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerText = 'جاري التحديث...';
    submitBtn.classList.add('opacity-50', 'cursor-not-allowed');

    const payload = {
        
        customer_id: document.getElementById('editInvoiceCustomerId').value,
        shipping_destination_id: document.getElementById('editInvoiceShippingDestinationId').value,
        shipping_address_text: document.getElementById('editInvoiceShippingAddressText').value.trim(),
        commission_id: document.getElementById('editInvoiceCommissionId').value
    };

    const invoiceDate = document.getElementById('editInvoiceDate').value;
    payload.invoice_date = invoiceDate || null;

    try {
        // لا نرسل Price_Per_CBM أيضا في التعديل.
        const { error } = await _supabase
            .from('invoices')
            .update(payload)
            .eq('id', targetId);

        if (error) throw error;

        alert('تم تحديث الفاتورة بنجاح ✅');
        closeEditInvoiceModal();
        checkAndLoadInvoices();
    } catch (err) {
        console.error('فشل التحديث:', err.message);
        alert('حدث خطأ أثناء التحديث: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'حفظ التعديلات';
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// نظام إشعارات ذكي لترتيب التنبيهات فوق بعضها في حالة الحذف المتعدد
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-4 right-4 flex flex-col gap-2 z-[9999] max-w-sm select-none';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `px-5 py-3 rounded-xl shadow-2xl text-white font-bold flex items-center gap-3 transition-all duration-300 transform translate-y-2 opacity-0`;
    if (type === 'success') toast.classList.add('bg-green-600');
    else if (type === 'error') toast.classList.add('bg-red-600');
    else toast.classList.add('bg-blue-600', 'animate-bounce');
    toast.innerHTML = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);
    return {
        update: (newMessage, newType) => {
            toast.className = `px-5 py-3 rounded-xl shadow-2xl text-white font-bold flex items-center gap-3 transition-all duration-300`;
            if (newType === 'success') toast.classList.add('bg-green-600');
            else if (newType === 'error') toast.classList.add('bg-red-600');
            else toast.classList.add('bg-blue-600');
            toast.innerHTML = newMessage;
        },
        remove: () => {
            toast.classList.add('translate-y-2', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }
    };
}

async function deleteInvoice(uuid) {
    if (!confirm('هل أنت متأكد من حذف هذه الفاتورة؟')) return;

    // 1. إنشاء وإظهار تنبيه الحذف المتحرك فوراً لإشعار المستخدم بالعملية الجارية
    const toast = showToast(`
        <svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        جاري حذف الفاتورة حالياً...
    `);

    try {
        const { error } = await _supabase
            .from('invoices')
            .delete()
            .eq('id', uuid);

        if (error) throw error;

        // 2. تحديث قائمة الفواتير
        await checkAndLoadInvoices();

        // 3. عرض رسالة النجاح وتعديل مظهر التنبيه للون الأخضر الأنيق
        toast.update('🎉 تم حذف الفاتورة بنجاح!', 'success');
        setTimeout(() => toast.remove(), 2500);

    } catch (err) {
        console.error('فشل الحذف:', err.message);
        
        // 4. عرض رسالة الفشل باللون الأحمر
        toast.update('❌ فشل الحذف: ' + (err.message || 'حدث خطأ ما'), 'error');
        setTimeout(() => toast.remove(), 4000);
    }
}

const editInvoiceForm = document.getElementById('editInvoiceForm');
if (editInvoiceForm) {
    editInvoiceForm.addEventListener('submit', updateEditedInvoiceData);
}

const invoicePeriodFilter = document.getElementById('invoicePeriodFilter');
if (invoicePeriodFilter) {
    invoicePeriodFilter.addEventListener('change', checkAndLoadInvoices);
}

const invoiceSearchInput = document.getElementById('invoiceSearchInput');
if (invoiceSearchInput) {
    invoiceSearchInput.addEventListener('input', checkAndLoadInvoices);
}

checkAndLoadInvoices();
