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
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">فشل تحميل أنواع المنتجات.</td></tr>';
        return;
    }
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">لا توجد أنواع منتجات بعد.</td></tr>';
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
                <button onclick="openEditTypeModal('${type.id}')" class="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600 text-sm ml-2">تعديل</button>
                <button onclick="deleteType('${type.id}')" class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm">حذف</button>
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
        alert('أدخل اسم النوع');
        return;
    }
    const { error } = await _supabase.from('product_types').insert([{ category_name: name, category_description: description }]);
    if (error) {
        console.error('Error adding type:', error);
        alert('حدث خطأ أثناء الإضافة');
        return;
    }
    closeAddTypeModal();
    await loadTypes();
    alert('تم إضافة النوع بنجاح');
}

async function openEditTypeModal(id) {
    const { data, error } = await _supabase.from('product_types').select('*').eq('id', id).single();
    if (error) {
        console.error('Error loading type:', error);
        alert('فشل جلب بيانات النوع');
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
        alert('لا يوجد نوع محدد للتعديل');
        return;
    }
    const name = document.getElementById('editTypeName').value.trim();
    const description = document.getElementById('editTypeDescription').value.trim();
    if (!name) {
        alert('أدخل اسم النوع');
        return;
    }
    const { error } = await _supabase.from('product_types').update({ category_name: name, category_description: description }).eq('id', currentEditingTypeId);
    if (error) {
        console.error('Error updating type:', error);
        alert('حدث خطأ أثناء التعديل');
        return;
    }
    closeEditTypeModal();
    await loadTypes();
    alert('تم تحديث النوع بنجاح');
}

async function deleteType(id) {
    if (!confirm('هل أنت متأكد من حذف هذا النوع؟')) return;
    const { error } = await _supabase.from('product_types').delete().eq('id', id);
    if (error) {
        console.error('Error deleting type:', error);
        alert('فشل الحذف');
        return;
    }
    await loadTypes();
    alert('تم حذف النوع');
}

document.getElementById('addTypeForm').addEventListener('submit', addType);
document.getElementById('editTypeForm').addEventListener('submit', updateType);

window.addEventListener('DOMContentLoaded', loadTypes);