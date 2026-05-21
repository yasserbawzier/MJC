// متغيرات عامة لإدارة أنواع المنتجات
let productTypes = [];
let currentEditingTypeId = null;
let currentLimit = 50; // عرض 50 نوع منتج كحد أقصى مبدئياً

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

// دالة لتنسيق الوقت والتاريخ بشكل مقروء
function formatDateTime(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

// دالة إنشاء صف نوع المنتج من القالب (Template) لتحسين الأداء
function createProductTypeRow(type) {
    const template = document.getElementById('productTypeRowTemplate');
    const row = template.content.cloneNode(true).querySelector('tr');
    
    row.id = `type-row-${type.id}`;
    
    row.querySelector('.name-cell').textContent = type.category_name || '-';
    row.querySelector('.description-cell').textContent = type.category_description || '-';
    row.querySelector('.date-cell').textContent = formatDateTime(type.created_at);
    
    // ربط الأحداث بالأزرار
    row.querySelector('.edit-btn').setAttribute('onclick', `openEditTypeModal('${type.id}')`);
    row.querySelector('.delete-btn').setAttribute('onclick', `deleteType('${type.id}')`);
    
    return row;
}

// دالة تحميل أنواع المنتجات من السيرفر
async function loadTypes() {
    const tbody = document.getElementById('productTypesTableBody');
    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center">جاري تحميل البيانات...</td></tr>';
    
    try {
        const { data, error } = await _supabase
            .from('product_types')
            .select('id, category_name, category_description, created_at')
            .order('created_at', { ascending: false });
            
        if (error) {
            console.error('Error loading product types:', error);
            tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">فشل تحميل البيانات من السيرفر.</td></tr>';
            return;
        }
        
        productTypes = data || [];
        renderTypesTable();
    } catch (error) {
        console.error('Unexpected error:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">حدث خطأ غير متوقع أثناء تحميل البيانات.</td></tr>';
    }
}

// دالة رسم الجدول مع دعم نظام عرض الدفعات
function renderTypesTable() {
    const tbody = document.getElementById('productTypesTableBody');
    tbody.innerHTML = '';
    
    if (productTypes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">لا توجد أنواع منتجات حالياً.</td></tr>';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    // جلب العناصر حسب حد العرض المسموح به
    const typesToShow = productTypes.slice(0, currentLimit);
    
    typesToShow.forEach(type => {
        const row = createProductTypeRow(type);
        fragment.appendChild(row);
    });
    
    // إضافة زر "عرض المزيد" إذا كان هناك عناصر متبقية
    if (productTypes.length > currentLimit) {
        const loadMoreRow = document.createElement('tr');
        loadMoreRow.innerHTML = `
            <td colspan="4" class="p-4 text-center">
                <button onclick="loadMoreTypes()" class="bg-blue-50 border border-blue-200 text-blue-700 px-6 py-2 rounded-full font-bold hover:bg-blue-100 transition-all shadow-sm">
                    عرض المزيد من الأنواع (متبقي ${productTypes.length - currentLimit})
                </button>
            </td>
        `;
        fragment.appendChild(loadMoreRow);
    }
    
    tbody.appendChild(fragment);
}

// دالة لزيادة حجم العناصر المعروضة
function loadMoreTypes() {
    currentLimit += 50;
    renderTypesTable();
}

// إدارة المودالات
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

// دالة إضافة نوع منتج جديد (مع تحديث فوري)
async function addType(event) {
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
    
    const name = document.getElementById('typeName').value.trim();
    const description = document.getElementById('typeDescription').value.trim();
    
    if (!name) {
        showToast('يرجى إدخال اسم النوع', 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Save Type / حفظ النوع';
            submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
        return;
    }
    
    const toast = showToast('جاري حفظ نوع المنتج...', 'info');
    
    try {
        const { data, error } = await _supabase
            .from('product_types')
            .insert([{ category_name: name, category_description: description }])
            .select()
            .single();
            
        if (error) throw error;
        
        // التحديث المحلي
        productTypes.unshift(data); // إضافة في أول المصفوفة لأن الترتيب تنازلي (الأحدث أولاً)
        renderTypesTable();
        
        closeAddTypeModal();
        toast.update('🎉 تم إضافة نوع المنتج بنجاح!', 'success');
        setTimeout(() => toast.remove(), 3000);
    } catch (error) {
        console.error('Error adding product type:', error);
        toast.update(`❌ فشل حفظ النوع: ${error.message || 'خطأ غير معروف'}`, 'error');
        setTimeout(() => toast.remove(), 4000);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Save Type / حفظ النوع';
            submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    }
}

// فتح مودال التعديل بشكل فوري من الذاكرة دون الاتصال بالسيرفر
function openEditTypeModal(id) {
    const type = productTypes.find(t => t.id === id);
    if (!type) {
        showToast('لم يتم العثور على نوع المنتج في الذاكرة المحلية!', 'error');
        return;
    }
    
    currentEditingTypeId = id;
    document.getElementById('editTypeName').value = type.category_name || '';
    document.getElementById('editTypeDescription').value = type.category_description || '';
    showEditTypeModal();
}

// دالة حفظ تعديلات نوع المنتج (مع تحديث فوري مباشر)
async function updateType(event) {
    event.preventDefault();
    
    if (!currentEditingTypeId) return;
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white inline-block ml-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            جاري التحديث...
        `;
        submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
    }
    
    const name = document.getElementById('editTypeName').value.trim();
    const description = document.getElementById('editTypeDescription').value.trim();
    
    if (!name) {
        showToast('يرجى إدخال اسم النوع', 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Save Changes / حفظ التعديلات';
            submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
        return;
    }
    
    const toast = showToast('جاري حفظ التعديلات...', 'info');
    
    try {
        const { data, error } = await _supabase
            .from('product_types')
            .update({ category_name: name, category_description: description })
            .eq('id', currentEditingTypeId)
            .select()
            .single();
            
        if (error) throw error;
        
        // تحديث الذاكرة المحلية
        const index = productTypes.findIndex(t => t.id === currentEditingTypeId);
        if (index !== -1) {
            productTypes[index] = data;
        }
        
        // تحديث العنصر محلياً في الواجهة (Optimistic UI) بدون رندر كامل للجدول
        const existingRow = document.getElementById(`type-row-${currentEditingTypeId}`);
        if (existingRow) {
            const newRow = createProductTypeRow(data);
            existingRow.replaceWith(newRow);
            
            // إضافة ومضة خضراء سريعة لتأكيد التعديل بصرياً
            newRow.classList.add('bg-green-100');
            setTimeout(() => newRow.classList.remove('bg-green-100'), 1000);
        }
        
        closeEditTypeModal();
        toast.update('🎉 تم تحديث نوع المنتج بنجاح!', 'success');
        setTimeout(() => toast.remove(), 3000);
    } catch (error) {
        console.error('Error updating product type:', error);
        toast.update(`❌ فشل تعديل نوع المنتج: ${error.message || 'خطأ غير معروف'}`, 'error');
        setTimeout(() => toast.remove(), 4000);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Save Changes / حفظ التعديلات';
            submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    }
}

// دالة حذف نوع المنتج (تحديث فوري مباشر)
async function deleteType(id) {
    if (!confirm('هل أنت متأكد من حذف هذا النوع؟ قد يؤثر ذلك على المنتجات المرتبطة به.')) {
        return;
    }
    
    const toast = showToast('جاري حذف نوع المنتج...', 'info');
    
    try {
        const { error } = await _supabase
            .from('product_types')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
        
        // تحديث الذاكرة المحلية
        productTypes = productTypes.filter(t => t.id !== id);
        
        // إخفاء السطر من الجدول بتأثير حركي
        const row = document.getElementById(`type-row-${id}`);
        if (row) {
            row.classList.add('opacity-0', 'scale-95');
            setTimeout(() => {
                row.remove();
                if (productTypes.length === 0) renderTypesTable();
            }, 300);
        }
        
        toast.update('🗑️ تم حذف نوع المنتج بنجاح!', 'success');
        setTimeout(() => toast.remove(), 3000);
    } catch (error) {
        console.error('Error deleting product type:', error);
        toast.update(`❌ فشل الحذف: ${error.message || 'خطأ غير معروف'}`, 'error');
        setTimeout(() => toast.remove(), 4000);
    }
}

// تسجيل مستمعي الأحداث
document.getElementById('addTypeForm').addEventListener('submit', addType);
document.getElementById('editTypeForm').addEventListener('submit', updateType);
window.addEventListener('DOMContentLoaded', loadTypes);