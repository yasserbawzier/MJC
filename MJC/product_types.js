let currentEditingTypeId = null;

function formatDateTime(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function loadTypes() {
    const { data, error } = await _supabase.from('product_types').select('*').order('created_at', { ascending: false });
    const tbody = document.getElementById('productTypesTableBody');
    if (error) {
        console.error('Error loading product types:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">Failed to load product types / فشل تحميل أنواع المنتجات.</td></tr>';
        return;
    }
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">No product types found / لا توجد أنواع منتجات بعد.</td></tr>';
        return;
    }
    tbody.innerHTML = '';
    data.forEach(type => {
        const row = document.createElement('tr');
        row.className = 'border-b hover:bg-blue-50 transition';
        row.innerHTML = `
            <td class="p-4 text-gray-700 font-medium">${type.category_name || '-'}</td>
            <td class="p-4 text-sm text-gray-700">${type.category_description || '-'}</td>
            <td class="p-4 text-gray-500">${formatDateTime(type.created_at)}</td>
            <td class="p-4 text-left whitespace-nowrap">
                <button onclick="openEditTypeModal('${type.id}')" class="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600 text-sm mr-2">Edit / تعديل</button>
                <button onclick="deleteType('${type.id}')" class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm">Delete / حذف</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function showAddTypeModal() {
    currentEditingTypeId = null;
    document.getElementById('addTypeForm').reset();
    document.getElementById('addTypeModal').classList.remove('hidden');
}

function closeAddTypeModal() {
    document.getElementById('addTypeModal').classList.add('hidden');
}

function showEditTypeModal() {
    document.getElementById('editTypeModal').classList.remove('hidden');
}

function closeEditTypeModal() {
    document.getElementById('editTypeModal').classList.add('hidden');
    currentEditingTypeId = null;
}

async function addType(event) {
    event.preventDefault();
    const name = document.getElementById('typeName').value.trim();
    const description = document.getElementById('typeDescription').value.trim();
    if (!name) {
        alert('Please enter a category name / أدخل اسم النوع');
        return;
    }
    const { error } = await _supabase.from('product_types').insert([{ category_name: name, category_description: description }]);
    if (error) {
        console.error('Error adding type:', error);
        alert('Error adding type / حدث خطأ أثناء الإضافة');
        return;
    }
    closeAddTypeModal();
    await loadTypes();
    alert('Type added successfully / تم إضافة النوع بنجاح');
}

async function openEditTypeModal(id) {
    const { data, error } = await _supabase.from('product_types').select('*').eq('id', id).single();
    if (error) {
        console.error('Error loading type:', error);
        alert('Failed to fetch type details / فشل جلب بيانات النوع');
        return;
    }
    currentEditingTypeId = id;
    document.getElementById('editTypeName').value = data.category_name || '';
    document.getElementById('editTypeDescription').value = data.category_description || '';
    showEditTypeModal();
}

async function updateType(event) {
    event.preventDefault();
    if (!currentEditingTypeId) {
        alert('No type selected for editing / لا يوجد نوع محدد للتعديل');
        return;
    }
    const name = document.getElementById('editTypeName').value.trim();
    const description = document.getElementById('editTypeDescription').value.trim();
    if (!name) {
        alert('Please enter a category name / أدخل اسم النوع');
        return;
    }
    const { error } = await _supabase.from('product_types').update({ category_name: name, category_description: description }).eq('id', currentEditingTypeId);
    if (error) {
        console.error('Error updating type:', error);
        alert('Error updating type / حدث خطأ أثناء التعديل');
        return;
    }
    closeEditTypeModal();
    await loadTypes();
    alert('Type updated successfully / تم تحديث النوع بنجاح');
}

async function deleteType(id) {
    if (!confirm('Are you sure you want to delete this type? / هل أنت متأكد من حذف هذا النوع؟')) return;

    // 1. إنشاء وإظهار تنبيه الحذف المتحرك فوراً لإشعار المستخدم بالعملية الجارية
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-xl shadow-2xl z-[100] flex items-center gap-3 animate-bounce select-none';
    notification.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Deleting product type... / جاري حذف نوع المنتج حالياً...
    `;
    document.body.appendChild(notification);

    try {
        const { error } = await _supabase.from('product_types').delete().eq('id', id);
        if (error) throw error;

        // 2. تحديث قائمة أنواع المنتجات
        await loadTypes();

        // 3. عرض رسالة النجاح وتعديل مظهر التنبيه للون الأخضر الأنيق
        notification.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl z-[100] flex items-center gap-2 select-none';
        notification.innerHTML = '🎉 Product type deleted successfully! / تم حذف نوع المنتج بنجاح!';
        setTimeout(() => notification.remove(), 3000);

    } catch (error) {
        console.error('Error deleting type:', error);
        
        // 4. عرض رسالة الفشل باللون الأحمر
        notification.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl z-[100] flex items-center gap-2 select-none';
        notification.innerHTML = '❌ Delete failed / فشل الحذف: ' + (error.message || 'حدث خطأ ما');
        setTimeout(() => notification.remove(), 4000);
    }
}

document.getElementById('addTypeForm').addEventListener('submit', addType);
document.getElementById('editTypeForm').addEventListener('submit', updateType);

window.addEventListener('DOMContentLoaded', loadTypes);