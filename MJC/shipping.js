// متغيرات عامة للشحن
let shippingRates = [];
let currentEditingShippingId = null;

// دالة تحميل أسعار الشحن من قاعدة البيانات
async function loadShippingRates() {
    const tableBody = document.getElementById('shippingTableBody');
    tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center">جاري تحميل البيانات...</td></tr>';

    try {
        const { data, error } = await _supabase
            .from('shipping_rates')
            .select('*')
            .order('country_name', { ascending: true });

        if (error) {
            console.error('Error loading shipping rates:', error);
            tableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">خطأ في تحميل البيانات: ${error.message}</td></tr>`;
            return;
        }

        shippingRates = data || [];

        if (shippingRates.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">لا توجد أسعار شحن حالياً.</td></tr>';
            return;
        }

        renderShippingTable();
    } catch (error) {
        console.error('Unexpected error:', error);
        tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">حدث خطأ غير متوقع.</td></tr>';
    }
}

// دالة عرض الجدول
function renderShippingTable() {
    const tbody = document.getElementById('shippingTableBody');
    tbody.innerHTML = '';

    shippingRates.forEach(rate => {
        const row = document.createElement('tr');
        row.className = 'border-b hover:bg-blue-50 transition';

        row.innerHTML = `
            <td class="p-4 text-gray-900">${rate.country_name || '-'}</td>
            <td class="p-4 text-sm text-gray-700">${rate.country_code || '-'}</td>
            <td class="p-4 text-gray-700">${rate.price_per_cbm ? rate.price_per_cbm.toFixed(2) : '-'}</td>
            <td class="p-4 text-left whitespace-nowrap">
                <button onclick="openEditShippingModal('${rate.id}')" class="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600 text-sm ml-2">تعديل</button>
                <button onclick="deleteShippingRate('${rate.id}')" class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm">حذف</button>
            </td>
        `;

        tbody.appendChild(row);
    });
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

// دالة فتح مودال التعديل مع البيانات
async function openEditShippingModal(id) {
    const rate = shippingRates.find(r => r.id === id);
    if (!rate) {
        alert('لم يتم العثور على سعر الشحن');
        return;
    }

    currentEditingShippingId = id;
    document.getElementById('editShipCountryName').value = rate.country_name || '';
    document.getElementById('editShipCountryCode').value = rate.country_code || '';
    document.getElementById('editShipPricePerCbm').value = rate.price_per_cbm || '';

    showEditShippingModal();
}

// دالة حفظ سعر شحن جديد
async function saveShippingRate(event) {
    event.preventDefault();

    const rateData = {
        country_name: document.getElementById('shipCountryName').value.trim(),
        country_code: document.getElementById('shipCountryCode').value.trim(),
        price_per_cbm: parseFloat(document.getElementById('shipPricePerCbm').value)
    };

    if (!rateData.country_name || !rateData.country_code || isNaN(rateData.price_per_cbm)) {
        alert('يرجى ملء جميع الحقول بشكل صحيح');
        return;
    }

    try {
        const { error } = await _supabase
            .from('shipping_rates')
            .insert([rateData]);

        if (error) {
            console.error('Error saving shipping rate:', error);
            alert('فشل في حفظ سعر الشحن: ' + error.message);
            return;
        }

        closeAddShippingModal();
        await loadShippingRates();
        alert('تم إضافة سعر الشحن بنجاح');
    } catch (error) {
        console.error('Unexpected error:', error);
        alert('حدث خطأ غير متوقع');
    }
}

// دالة تحديث سعر شحن
async function updateShippingRate(event) {
    event.preventDefault();

    if (!currentEditingShippingId) {
        alert('لم يتم تحديد سعر الشحن للتعديل');
        return;
    }

    const rateData = {
        country_name: document.getElementById('editShipCountryName').value.trim(),
        country_code: document.getElementById('editShipCountryCode').value.trim(),
        price_per_cbm: parseFloat(document.getElementById('editShipPricePerCbm').value)
    };

    if (!rateData.country_name || !rateData.country_code || isNaN(rateData.price_per_cbm)) {
        alert('يرجى ملء جميع الحقول بشكل صحيح');
        return;
    }

    try {
        const { error } = await _supabase
            .from('shipping_rates')
            .update(rateData)
            .eq('id', currentEditingShippingId);

        if (error) {
            console.error('Error updating shipping rate:', error);
            alert('فشل في تحديث سعر الشحن: ' + error.message);
            return;
        }

        closeEditShippingModal();
        await loadShippingRates();
        alert('تم تحديث سعر الشحن بنجاح');
    } catch (error) {
        console.error('Unexpected error:', error);
        alert('حدث خطأ غير متوقع');
    }
}

// دالة حذف سعر شحن
async function deleteShippingRate(id) {
    if (!confirm('هل أنت متأكد من حذف هذا السعر؟')) {
        return;
    }

    try {
        const { error } = await _supabase
            .from('shipping_rates')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting shipping rate:', error);
            alert('فشل في حذف سعر الشحن: ' + error.message);
            return;
        }

        await loadShippingRates();
        alert('تم حذف سعر الشحن بنجاح');
    } catch (error) {
        console.error('Unexpected error:', error);
        alert('حدث خطأ غير متوقع');
    }
}

// تسجيل الأحداث عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', async () => {
    await loadShippingRates();
});

document.getElementById('addShippingForm').addEventListener('submit', saveShippingRate);
document.getElementById('editShippingForm').addEventListener('submit', updateShippingRate);