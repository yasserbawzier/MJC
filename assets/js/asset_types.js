document.addEventListener('DOMContentLoaded', () => {
    if (typeof _supabase === 'undefined') {
        console.error('Supabase client is not initialized in App.js');
        return;
    }
    
    loadAssetTypes();
    document.getElementById('addAssetTypeForm').addEventListener('submit', addAssetType);
});

async function loadAssetTypes() {
    const tbody = document.getElementById('assetTypesTableBody');
    try {
        const { data, error } = await _supabase.from('asset_types').select('*').order('created_at', { ascending: false });
        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-gray-500">لا توجد أنواع حالياً.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        data.forEach(type => {
            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-gray-50 transition';
            row.innerHTML = `
                <td class="p-4 text-gray-800 font-bold">${type.name}</td>
                <td class="p-4 text-center">
                    <button onclick="deleteAssetType('${type.id}')" class="bg-red-100 text-red-600 hover:bg-red-200 px-4 py-1.5 rounded-lg transition text-sm font-bold shadow-sm">حذف</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (err) {
        console.error('Error loading asset types:', err);
        tbody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-red-500 font-bold">حدث خطأ أثناء تحميل البيانات من قاعدة البيانات.</td></tr>';
    }
}

async function addAssetType(e) {
    e.preventDefault();
    const nameInput = document.getElementById('assetTypeName');
    const name = nameInput.value.trim();
    if (!name) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'جاري الحفظ...';
    submitBtn.disabled = true;

    try {
        const { error } = await _supabase.from('asset_types').insert([{ name }]);
        if (error) throw error;
        
        nameInput.value = '';
        await loadAssetTypes();
    } catch (err) {
        console.error('Error adding asset type:', err);
        alert('حدث خطأ أثناء الإضافة: ' + err.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

window.deleteAssetType = async function(id) {
    if (!confirm('هل أنت متأكد من حذف هذا النوع؟ سيؤدي هذا إلى خطأ إذا كان مرتبطاً بعناصر سابقة في التصاميم.')) return;
    
    try {
        const { error } = await _supabase.from('asset_types').delete().eq('id', id);
        if (error) throw error;
        await loadAssetTypes();
    } catch (err) {
        console.error('Error deleting asset type:', err);
        alert('لا يمكن حذف هذا النوع، ربما لأنه مرتبط بعناصر مسجلة بالفعل في التصاميم.');
    }
}
