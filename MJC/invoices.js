/**
 * صفحة الفواتير المحسنة:
 * - تعرض بيانات invoices للمستخدم بشكل مفهوم وسريع بفضل تقنية القوالب (Templates).
 * - التحديث الفوري المباشر (Optimistic UI) عند الإضافة والتعديل والحذف دون إعادة تحميل كامل الصفحة.
 * - التفاعل اللحظي دون تأخير وحماية الأزرار من الضغط المزدوج.
 * - استخدام نظام إشعارات Toasts أنيق ومقروء.
 */

let customersLookup = [];
let shippingLookup = [];
let commissionsLookup = [];
let invoices = [];
let currentLimit = 50;
let currentEditingInvoiceId = null;

// خرائط البحث العالمية (Global Lookup Maps) لمنع إعادة بنائها وتجنب البطء والتعليق
let customersMap = {};
let customerNameMap = {};
let shippingMap = {};
let commissionsMap = {};

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

// نظام إشعارات ذكي لترتيب التنبيهات فوق بعضها
function showToast(message, type = 'info') {
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
}

async function loadFormLookups() {
    if (customersLookup.length > 0 && shippingLookup.length > 0 && commissionsLookup.length > 0) {
        return; // محملة مسبقاً
    }

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

    // بناء خرائط البحث مرة واحدة فقط عند تحميل البيانات لضمان سرعة خيالية في الفلترة والبحث
    customersMap = buildLookupMap(customersLookup, 'customer_custom_id');
    customerNameMap = buildLookupMap(customersLookup, 'full_name');
    shippingMap = buildLookupMap(shippingLookup, 'country_name');
    commissionsMap = buildLookupMap(commissionsLookup, 'commission_rate');

    fillSelectOptions('invoiceCustomerId', customersLookup, item => item.customer_custom_id || 'بدون ID');
    fillSelectOptions('editInvoiceCustomerId', customersLookup, item => item.customer_custom_id || 'بدون ID');

    fillSelectOptions('invoiceShippingDestinationId', shippingLookup, item => item.country_name || 'بدون اسم');
    fillSelectOptions('editInvoiceShippingDestinationId', shippingLookup, item => item.country_name || 'بدون اسم');

    fillSelectOptions('invoiceCommissionId', commissionsLookup, item => `${item.commission_rate ?? '-'} %`);
    fillSelectOptions('editInvoiceCommissionId', commissionsLookup, item => `${item.commission_rate ?? '-'} %`);
}

// دالة إنشاء صف الفاتورة من القالب (Template) لسرعة معالجة الـ DOM
function createInvoiceRow(item) {
    const template = document.getElementById('invoiceRowTemplate');
    const row = template.content.cloneNode(true).querySelector('tr');
    
    row.id = `invoice-row-${item.id}`;

    row.querySelector('.number-cell').textContent = item.invoice_number || '-';
    row.querySelector('.customer-id-cell').textContent = customersMap[item.customer_id] || '-';
    row.querySelector('.customer-name-cell').textContent = customerNameMap[item.customer_id] || '-';
    row.querySelector('.shipping-destination-cell').textContent = shippingMap[item.shipping_destination_id] || '-';
    row.querySelector('.shipping-address-cell').textContent = item.shipping_address_text || '-';
    row.querySelector('.commission-cell').textContent = commissionsMap[item.commission_id] !== undefined ? `${commissionsMap[item.commission_id]} %` : '-';
    row.querySelector('.price-cell').textContent = item.Price_Per_CBM ?? '-';

    // تعيين الأحداث على الأزرار
    row.querySelector('.edit-btn').setAttribute('onclick', `openEditInvoiceModal('${item.id}')`);
    row.querySelector('.add-items-btn').setAttribute('onclick', `openInvoiceItemsPage('${item.id}')`);
    row.querySelector('.commissions-btn').setAttribute('onclick', `openInvoiceCommissionsPage('${item.id}')`);
    row.querySelector('.delete-btn').setAttribute('onclick', `deleteInvoice('${item.id}')`);

    return row;
}

// جلب الفواتير الأساسية من السيرفر
async function checkAndLoadInvoices() {
    const tableBody = document.getElementById('invoicesTableBody');
    tableBody.innerHTML = '<tr><td colspan="8" class="p-4 text-center">جاري التحميل...</td></tr>';

    try {
        await loadFormLookups();

        const periodFilter = document.getElementById('invoicePeriodFilter')?.value || 'week';

        let query = _supabase
            .from('invoices')
            .select('id, invoice_number, customer_id, shipping_destination_id, shipping_address_text, commission_id, Price_Per_CBM, invoice_date, created_at')
            .order('created_at', { ascending: false });

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

        invoices = data || [];
        renderInvoicesTable();
    } catch (err) {
        console.error('فشل تحميل الفواتير:', err);
        tableBody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-red-500">حدث خطأ غير متوقع.</td></tr>';
    }
}

// رسم الجدول مع الفلترة ودعم الـ Pagination (عرض المزيد)
function renderInvoicesTable() {
    const tbody = document.getElementById('invoicesTableBody');
    tbody.innerHTML = '';

    if (invoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-500">لا توجد فواتير في هذه الفترة حالياً.</td></tr>';
        return;
    }

    const searchText = normalizeText(document.getElementById('invoiceSearchInput')?.value || '');

    // فلترة الفواتير في الذاكرة (سريعة جداً لأن خرائط البحث جاهزة مسبقاً)
    const filtered = invoices.filter(item => {
        if (!searchText) return true;

        const invoiceNumber = normalizeText(item.invoice_number);
        const customerCustomId = normalizeText(customersMap[item.customer_id]);
        const shippingDestination = normalizeText(shippingMap[item.shipping_destination_id]);
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
    const invoicesToShow = filtered.slice(0, currentLimit);

    invoicesToShow.forEach(item => {
        const row = createInvoiceRow(item);
        fragment.appendChild(row);
    });

    // إضافة زر عرض المزيد
    if (filtered.length > currentLimit) {
        const loadMoreRow = document.createElement('tr');
        loadMoreRow.innerHTML = `
            <td colspan="8" class="p-4 text-center">
                <button onclick="loadMoreInvoices()" class="bg-blue-50 border border-blue-200 text-blue-700 px-6 py-2 rounded-full font-bold hover:bg-blue-100 transition-all shadow-sm">
                    عرض المزيد من الفواتير (متبقي ${filtered.length - currentLimit})
                </button>
            </td>
        `;
        fragment.appendChild(loadMoreRow);
    }

    tbody.appendChild(fragment);
}

function loadMoreInvoices() {
    currentLimit += 50;
    renderInvoicesTable();
}

function openInvoiceItemsPage(invoiceId) {
    if (!invoiceId) return;
    window.location.href = `invoice_items.html?invoice_id=${encodeURIComponent(invoiceId)}`;
}

function openInvoiceCommissionsPage(invoiceId) {
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
    currentEditingInvoiceId = null;
}

// إعادة تعيين الحد الأقصى عند تغيير الفلاتر أو البحث
function handleFilterChange() {
    currentLimit = 50;
    renderInvoicesTable();
}

// دالة حفظ فاتورة جديدة (تحديث فوري)
document.getElementById('addInvoiceForm').addEventListener('submit', async (e) => {
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

        // التحديث المحلي
        invoices.unshift(data); // إضافة الفاتورة الجديدة لأول القائمة
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

// فتح مودال التعديل بشكل فوري من الذاكرة المحلية
function openEditInvoiceModal(uuid) {
    const data = invoices.find(inv => inv.id === uuid);
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

    currentEditingInvoiceId = uuid;
    document.getElementById('editInvoiceModal').classList.remove('hidden');
}

// تحديث الفاتورة (تحديث فوري مباشر)
async function updateEditedInvoiceData(e) {
    e.preventDefault();

    if (!currentEditingInvoiceId) return;

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
            .eq('id', currentEditingInvoiceId)
            .select()
            .single();

        if (error) throw error;

        // تحديث الذاكرة المحلية
        const index = invoices.findIndex(inv => inv.id === currentEditingInvoiceId);
        if (index !== -1) {
            invoices[index] = data;
        }

        // تحديث السطر محلياً (Optimistic UI)
        const existingRow = document.getElementById(`invoice-row-${currentEditingInvoiceId}`);
        if (existingRow) {
            const newRow = createInvoiceRow(data);
            existingRow.replaceWith(newRow);
            
            // ومضة خضراء سريعة لتأكيد التعديل بصرياً
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
}

// حذف فاتورة (تحديث فوري مباشر)
async function deleteInvoice(uuid) {
    if (!confirm('هل أنت متأكد من حذف هذه الفاتورة نهائياً؟')) return;

    const toast = showToast('جاري حذف الفاتورة حالياً...', 'info');

    try {
        const { error } = await _supabase
            .from('invoices')
            .delete()
            .eq('id', uuid);

        if (error) throw error;

        // تحديث الذاكرة المحلية
        invoices = invoices.filter(inv => inv.id !== uuid);

        // إخفاء السطر من الجدول بصرياً
        const row = document.getElementById(`invoice-row-${uuid}`);
        if (row) {
            row.classList.add('opacity-0', 'scale-95');
            setTimeout(() => {
                row.remove();
                if (invoices.length === 0) renderInvoicesTable();
            }, 300);
        }

        toast.update('🗑️ تم حذف الفاتورة بنجاح!', 'success');
        setTimeout(() => toast.remove(), 2500);
    } catch (err) {
        console.error('فشل الحذف:', err);
        toast.update(`❌ فشل الحذف: ${err.message || 'حدث خطأ ما'}`, 'error');
        setTimeout(() => toast.remove(), 4000);
    }
}

const editInvoiceForm = document.getElementById('editInvoiceForm');
if (editInvoiceForm) {
    editInvoiceForm.addEventListener('submit', updateEditedInvoiceData);
}

const invoicePeriodFilter = document.getElementById('invoicePeriodFilter');
if (invoicePeriodFilter) {
    invoicePeriodFilter.addEventListener('change', () => {
        handleFilterChange();
        checkAndLoadInvoices();
    });
}

const invoiceSearchInput = document.getElementById('invoiceSearchInput');
if (invoiceSearchInput) {
    invoiceSearchInput.addEventListener('input', handleFilterChange);
}

// تحميل الفواتير عند فتح الصفحة
checkAndLoadInvoices();
