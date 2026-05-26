// متغيرات عامة للشحن
let shippingRates = [];
let currentEditingShippingId = null;
let shipCurrentLimit = 50; // لعرض 50 عنصر كحد أقصى مبدئياً لزيادة سرعة العرض

// نظام إشعارات ذكي لترتيب التنبيهات فوق بعضها
function showToast(message, type = 'info') {
    return window.showNotification(message, type);
}

// إنشاء صف الشحن من القالب (Template) لزيادة السرعة
function createShippingRow(rate) {
    const template = document.getElementById('shippingRowTemplate');
    const row = template.content.cloneNode(true).querySelector('tr');
    
    row.id = `shipping-row-${rate.id}`;
    
    row.querySelector('.name-cell').textContent = rate.country_name || '-';
    row.querySelector('.code-cell').textContent = rate.country_code || '-';
    row.querySelector('.price-cell').textContent = rate.price_per_cbm ? rate.price_per_cbm.toFixed(2) : '-';
    
    row.querySelector('.edit-btn').setAttribute('onclick', `openEditShippingModal('${rate.id}')`);
    row.querySelector('.delete-btn').setAttribute('onclick', `deleteShippingRate('${rate.id}')`);
    
    return row;
}

// دالة تحميل أسعار الشحن من قاعدة البيانات
async function loadShippingRates() {
    const tableBody = document.getElementById('shippingTableBody');
    tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center">جاري تحميل البيانات...</td></tr>';

    try {
        const { data, error } = await _supabase
            .from('shipping_rates')
            .select('id, country_name, country_code, price_per_cbm')
            .order('country_name', { ascending: true });

        if (error) {
            console.error('Error loading shipping rates:', error);
            tableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">خطأ في تحميل البيانات: ${error.message}</td></tr>`;
            return;
        }

        shippingRates = data || [];
        renderShippingTable();
    } catch (error) {
        console.error('Unexpected error:', error);
        tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">حدث خطأ غير متوقع.</td></tr>';
    }
}

// دالة عرض الجدول بالكامل (مع نظام عرض الدفعات)
function renderShippingTable() {
    const tbody = document.getElementById('shippingTableBody');
    tbody.innerHTML = '';
    
    if (shippingRates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">لا توجد أسعار شحن حالياً.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    
    // جلب العناصر المسموح بعرضها فقط (50 عنصر مبدئياً)
    const ratesToShow = shippingRates.slice(0, shipCurrentLimit);

    ratesToShow.forEach(rate => {
        const row = createShippingRow(rate);
        fragment.appendChild(row);
    });
    
    // إذا كان هناك عناصر أخرى لم تُعرض بعد، نضيف زر "عرض المزيد"
    if (shippingRates.length > shipCurrentLimit) {
        const loadMoreRow = document.createElement('tr');
        loadMoreRow.innerHTML = `
            <td colspan="4" class="p-4 text-center">
                <button onclick="loadMoreShippingRates()" class="bg-blue-50 border border-blue-200 text-blue-700 px-6 py-2 rounded-full font-bold hover:bg-blue-100 transition-all shadow-sm">
                    عرض المزيد من الدول (متبقي ${shippingRates.length - shipCurrentLimit})
                </button>
            </td>
        `;
        fragment.appendChild(loadMoreRow);
    }
    
    tbody.appendChild(fragment);
}

// دالة لزيادة عدد العناصر المعروضة عند الضغط على زر عرض المزيد
function loadMoreShippingRates() {
    shipCurrentLimit += 50;
    renderShippingTable();
}

// دوال إدارة المودال
function showAddShippingModal() {
    document.getElementById('addShippingForm').reset();
    document.getElementById('addShippingModal').classList.remove('hidden');
}

function closeAddShippingModal() {
    document.getElementById('addShippingModal').classList.add('hidden');
}

function showEditShippingModal() {
    document.getElementById('editShippingModal').classList.remove('hidden');
}

function closeEditShippingModal() {
    document.getElementById('editShippingModal').classList.add('hidden');
    currentEditingShippingId = null;
}

// دالة فتح مودال التعديل بشكل فوري من الذاكرة
function openEditShippingModal(id) {
    const rate = shippingRates.find(r => r.id === id);
    if (!rate) {
        showToast('لم يتم العثور على السعر المرجو تعديله في الذاكرة!', 'error');
        return;
    }

    currentEditingShippingId = id;
    document.getElementById('editShipCountryName').value = rate.country_name || '';
    document.getElementById('editShipCountryCode').value = rate.country_code || '';
    document.getElementById('editShipPricePerCbm').value = rate.price_per_cbm || '';

    showEditShippingModal();
}

// دالة حفظ سعر شحن جديد (مع تحديث محلي)
async function saveShippingRate(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white inline-block ml-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            جاري الحفظ...
        `;
        submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
    }

    const rateData = {
        country_name: document.getElementById('shipCountryName').value.trim(),
        country_code: document.getElementById('shipCountryCode').value.trim(),
        price_per_cbm: parseFloat(document.getElementById('shipPricePerCbm').value)
    };

    if (!rateData.country_name || !rateData.country_code || isNaN(rateData.price_per_cbm)) {
        showToast('يرجى ملء جميع الحقول بشكل صحيح', 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'حفظ';
            submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
        return;
    }

    const toast = showToast('جاري حفظ سعر الشحن...', 'info');

    try {
        const { data, error } = await _supabase
            .from('shipping_rates')
            .insert([rateData])
            .select()
            .single();

        if (error) throw error;

        // تحديث الذاكرة المحلية والواجهة فوراً بدون إعادة تحميل من السيرفر
        shippingRates.push(data);
        
        // إعادة ترتيب المصفوفة أبجدياً كما في السيرفر
        shippingRates.sort((a, b) => (a.country_name || '').localeCompare(b.country_name || ''));
        
        // إعادة رسم الجدول ليعكس الترتيب الجديد
        renderShippingTable();

        closeAddShippingModal();
        toast.update('🎉 تم إضافة سعر الشحن بنجاح!', 'success');
        setTimeout(() => toast.remove(), 3000);
    } catch (error) {
        console.error('Error saving shipping rate:', error);
        toast.update(`❌ فشل الإضافة: ${error.message || 'خطأ غير معروف'}`, 'error');
        setTimeout(() => toast.remove(), 4000);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'حفظ';
            submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    }
}

// دالة تحديث سعر شحن (مع تحديث محلي)
async function updateShippingRate(event) {
    event.preventDefault();

    if (!currentEditingShippingId) return;

    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white inline-block ml-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            جاري التحديث...
        `;
        submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
    }

    const rateData = {
        country_name: document.getElementById('editShipCountryName').value.trim(),
        country_code: document.getElementById('editShipCountryCode').value.trim(),
        price_per_cbm: parseFloat(document.getElementById('editShipPricePerCbm').value)
    };

    if (!rateData.country_name || !rateData.country_code || isNaN(rateData.price_per_cbm)) {
        showToast('يرجى ملء جميع الحقول بشكل صحيح', 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'حفظ التعديلات';
            submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
        return;
    }

    const toast = showToast('جاري تحديث السعر...', 'info');

    try {
        const { data, error } = await _supabase
            .from('shipping_rates')
            .update(rateData)
            .eq('id', currentEditingShippingId)
            .select()
            .single();

        if (error) throw error;

        // التحديث المحلي في الذاكرة
        const index = shippingRates.findIndex(r => r.id === currentEditingShippingId);
        if (index !== -1) {
            shippingRates[index] = data;
        }

        // التحديث المحلي في الشاشة فقط (Optimistic UI) بدون إعادة رسم كامل
        const existingRow = document.getElementById(`shipping-row-${currentEditingShippingId}`);
        if (existingRow) {
            const newRow = createShippingRow(data);
            existingRow.replaceWith(newRow);
            
            // إضاءة خضراء لتأكيد التعديل بصرياً
            newRow.classList.add('bg-green-100');
            setTimeout(() => newRow.classList.remove('bg-green-100'), 1000);
        }

        closeEditShippingModal();
        toast.update('🎉 تم تحديث سعر الشحن بنجاح!', 'success');
        setTimeout(() => toast.remove(), 3000);
    } catch (error) {
        console.error('Error updating shipping rate:', error);
        toast.update(`❌ فشل التحديث: ${error.message || 'خطأ غير معروف'}`, 'error');
        setTimeout(() => toast.remove(), 4000);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'حفظ التعديلات';
            submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    }
}

// دالة حذف سعر شحن (مع تحديث محلي)
async function deleteShippingRate(id) {
    if (!confirm('هل أنت متأكد من حذف هذا السعر نهائياً؟ لا يمكن التراجع عن هذا الإجراء.')) {
        return;
    }

    const toast = showToast('جاري حذف السعر...', 'info');

    try {
        const { error } = await _supabase
            .from('shipping_rates')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // التحديث المحلي
        shippingRates = shippingRates.filter(r => r.id !== id);
        
        const row = document.getElementById(`shipping-row-${id}`);
        if (row) {
            row.classList.add('opacity-0', 'scale-95'); // تأثير اختفاء أنيق
            setTimeout(() => {
                row.remove();
                if (shippingRates.length === 0) renderShippingTable();
            }, 300);
        }

        toast.update('🗑️ تم الحذف بنجاح!', 'success');
        setTimeout(() => toast.remove(), 3000);
    } catch (error) {
        console.error('Error deleting shipping rate:', error);
        toast.update(`❌ فشل الحذف: ${error.message || 'خطأ غير معروف'}`, 'error');
        setTimeout(() => toast.remove(), 4000);
    }
}

// تسجيل الأحداث عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', async () => {
    await loadShippingRates();
});

document.getElementById('addShippingForm').addEventListener('submit', saveShippingRate);
document.getElementById('editShippingForm').addEventListener('submit', updateShippingRate);