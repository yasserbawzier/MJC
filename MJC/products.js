const PRODUCT_IMAGE_BUCKET = 'product-images';
let products = [];
let productTypes = [];
let currentEditingProductId = null;
let currentEditingTypeId = null;
let currentAddImageFile = null;
let currentEditImageFile = null;
let currentAddImageObjectUrl = null;
let currentEditImageObjectUrl = null;

function normalizeText(value) {
    return String(value ?? '').toLowerCase().trim();
}

async function loadProductTypes() {
    const { data, error } = await _supabase.from('product_types').select('*').order('created_at', { ascending: false });
    if (error) {
        console.error('Error loading product types:', error);
        return;
    }
    productTypes = data || [];
    renderProductTypeFilter();
    renderProductTypeSelects();
}

function renderProductTypeFilter() {
    const filter = document.getElementById('productTypeFilter');
    filter.innerHTML = '<option value="all">كل الأنواع</option>';
    productTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type.id;
        option.textContent = type.category_name;
        filter.appendChild(option);
    });
}

function renderProductTypeSelects() {
    const addSelect = document.getElementById('productTypeId');
    const editSelect = document.getElementById('editProductTypeId');
    [addSelect, editSelect].forEach(select => {
        if (!select) return;
        select.innerHTML = '<option value="">اختر نوع المنتج</option>';
        productTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.category_name;
            select.appendChild(option);
        });
    });
}

async function loadProducts() {
    const { data, error } = await _supabase.from('products').select('*').order('product_custom_id', { ascending: true });
    if (error) {
        console.error('Error loading products:', error);
        document.getElementById('productsTableBody').innerHTML = '<tr><td colspan="10" class="p-4 text-center text-red-500">فشل تحميل المنتجات.</td></tr>';
        return;
    }
    products = data || [];
    renderProductsTable();
}

function getTypeName(typeId) {
    const type = productTypes.find(item => item.id === typeId);
    return type ? type.category_name : 'بدون نوع';
}

function setPreviewImage(elementId, placeholderId, imageUrl) {
    const img = document.getElementById(elementId);
    const placeholder = document.getElementById(placeholderId);
    if (!img || !placeholder) return;

    if (imageUrl) {
        img.src = imageUrl;
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
    } else {
        img.src = '';
        img.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }
}

function updateAddImagePreview() {
    if (currentAddImageFile) {
        setPreviewImage('productImagePreview', 'productImagePlaceholder', currentAddImageObjectUrl);
    } else {
        setPreviewImage('productImagePreview', 'productImagePlaceholder', document.getElementById('productImageUrl').value.trim());
    }
}

function updateEditImagePreview() {
    if (currentEditImageFile) {
        setPreviewImage('editProductImagePreview', 'editProductImagePlaceholder', currentEditImageObjectUrl);
    } else {
        setPreviewImage('editProductImagePreview', 'editProductImagePlaceholder', document.getElementById('editProductImageUrl').value.trim());
    }
}

function releaseAddImageObjectUrl() {
    if (currentAddImageObjectUrl) {
        URL.revokeObjectURL(currentAddImageObjectUrl);
        currentAddImageObjectUrl = null;
    }
}

function releaseEditImageObjectUrl() {
    if (currentEditImageObjectUrl) {
        URL.revokeObjectURL(currentEditImageObjectUrl);
        currentEditImageObjectUrl = null;
    }
}

function handleAddProductImageFileChange(event) {
    const file = event.target.files?.[0] || null;
    currentAddImageFile = file;
    releaseAddImageObjectUrl();
    if (file) {
        currentAddImageObjectUrl = URL.createObjectURL(file);
        setPreviewImage('productImagePreview', 'productImagePlaceholder', currentAddImageObjectUrl);
        document.getElementById('productImageUrl').value = '';
    } else {
        updateAddImagePreview();
    }
}

function handleEditProductImageFileChange(event) {
    const file = event.target.files?.[0] || null;
    currentEditImageFile = file;
    releaseEditImageObjectUrl();
    if (file) {
        currentEditImageObjectUrl = URL.createObjectURL(file);
        setPreviewImage('editProductImagePreview', 'editProductImagePlaceholder', currentEditImageObjectUrl);
        document.getElementById('editProductImageUrl').value = '';
    } else {
        updateEditImagePreview();
    }
}

function handlePreviewError(img, placeholderId) {
    img.classList.add('hidden');
    const placeholder = document.getElementById(placeholderId);
    if (placeholder) placeholder.classList.remove('hidden');
}

function renderProductsTable() {
    const tbody = document.getElementById('productsTableBody');
    try {
        const searchValue = normalizeText(document.getElementById('productSearchInput').value);
        const typeValue = document.getElementById('productTypeFilter').value;
        const statusValue = document.getElementById('productStatusFilter').value;
        const filtered = products.filter(product => {
            const matchesSearch = !searchValue || normalizeText(product.product_name).includes(searchValue) || normalizeText(product.product_custom_id).includes(searchValue);
            const matchesType = typeValue === 'all' || product.type_id === typeValue;
            const matchesStatus = statusValue === 'all' || (statusValue === 'hasType' && product.type_id) || (statusValue === 'noType' && !product.type_id);
            return matchesSearch && matchesType && matchesStatus;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="p-4 text-center text-gray-500">لا توجد نتائج متاحة.</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        filtered.forEach(product => {
            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-blue-50 transition';
            const imageCell = product.product_image_url
                ? `<button type="button" onclick='openImageModal(${JSON.stringify(product.product_image_url)})' class="inline-block rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition">
                        <img src="${product.product_image_url}" alt="صورة المنتج" class="w-16 h-16 object-cover">
                   </button>`
                : '-';
            const videoCell = product.product_video_url ? `<a href="${product.product_video_url}" target="_blank" class="text-blue-600 hover:underline">عرض الفيديو</a>` : '-';
            row.innerHTML = `
                <td class="p-4 text-sm text-gray-700">${product.product_custom_id || '-'}</td>
                <td class="p-4 font-medium text-gray-900">${product.product_name || '-'}</td>
                <td class="p-4">${imageCell}</td>
                <td class="p-4 text-sm text-gray-700">${product.specifications || '-'}</td>
                <td class="p-4 text-sm text-gray-700">${product.sample_details || '-'}</td>
                <td class="p-4 text-gray-700">${product.moq_of_product ?? '-'}</td>
                <td class="p-4 text-gray-700">${product.days_of_manufacturing ?? '-'}</td>
                <td class="p-4 text-blue-600">${videoCell}</td>
                <td class="p-4 text-gray-700">${getTypeName(product.type_id)}</td>
                <td class="p-4 text-left whitespace-nowrap">
                    <button onclick="openEditProductModal('${product.id}')" class="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600 text-sm ml-2">تعديل</button>
                    <button onclick="deleteProduct('${product.id}')" class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm">حذف</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error rendering products table:', error);
        tbody.innerHTML = '<tr><td colspan="10" class="p-4 text-center text-red-500">حدث خطأ أثناء عرض المنتجات.</td></tr>';
    }
}

function showAddProductModal() {
    currentEditingProductId = null;
    document.getElementById('addProductForm').reset();
    updateAddImagePreview();
    document.getElementById('addProductModal').classList.remove('hidden');
}

function closeAddProductModal() {
    document.getElementById('addProductModal').classList.add('hidden');
    currentAddImageFile = null;
    releaseAddImageObjectUrl();
    const fileInput = document.getElementById('productImageFile');
    if (fileInput) fileInput.value = '';
}

function showEditProductModal() {
    document.getElementById('editProductModal').classList.remove('hidden');
}

function closeEditProductModal() {
    document.getElementById('editProductModal').classList.add('hidden');
    currentEditingProductId = null;
    currentEditImageFile = null;
    releaseEditImageObjectUrl();
    const fileInput = document.getElementById('editProductImageFile');
    if (fileInput) fileInput.value = '';
}

function showAddProductTypeModal() {
    document.getElementById('addProductTypeForm').reset();
    document.getElementById('addProductTypeModal').classList.remove('hidden');
}

function closeAddProductTypeModal() {
    document.getElementById('addProductTypeModal').classList.add('hidden');
}

function openImageModal(imageUrl) {
    const modal = document.getElementById('imagePreviewModal');
    const modalImg = document.getElementById('modalPreviewImage');
    if (!modal || !modalImg) return;
    modalImg.src = imageUrl;
    modal.classList.remove('hidden');
}

function closeImageModal() {
    const modal = document.getElementById('imagePreviewModal');
    const modalImg = document.getElementById('modalPreviewImage');
    if (!modal || !modalImg) return;
    modalImg.src = '';
    modal.classList.add('hidden');
}

async function uploadProductImageFile(file) {
    if (!file) return null;
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
    const filePath = `products/${fileName}`;
    const { error } = await _supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
    });
    if (error) {
        throw new Error(`Upload error: ${error.message || error.details || JSON.stringify(error)}`);
    }
    const { data: publicData, error: publicError } = _supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(filePath);
    if (publicError) {
        throw new Error(`Public URL error: ${publicError.message || publicError.details || JSON.stringify(publicError)}`);
    }
    if (!publicData || !publicData.publicUrl) {
        throw new Error('لم يتم الحصول على رابط الصورة العام بعد الرفع. راجع إعدادات الباكت.');
    }
    return publicData.publicUrl;
}

async function addProductType(event) {
    event.preventDefault();
    const name = document.getElementById('newTypeName').value.trim();
    const description = document.getElementById('newTypeDescription').value.trim();
    if (!name) {
        alert('أدخل اسم النوع أولاً');
        return;
    }
    const { error } = await _supabase.from('product_types').insert([{ category_name: name, category_description: description }]);
    if (error) {
        console.error('Error adding product type:', error);
        alert('حدث خطأ أثناء إضافة النوع');
        return;
    }
    await loadProductTypes();
    closeAddProductTypeModal();
    alert('تم إضافة النوع بنجاح');
}

async function saveProduct(event) {
    event.preventDefault();
    const submitBtn = document.getElementById('saveProductButton');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        submitBtn.innerText = 'جاري الحفظ...';
    }
    const productData = {
        product_custom_id: document.getElementById('productCustomId').value.trim(),
        product_name: document.getElementById('productName').value.trim(),
        product_image_url: document.getElementById('productImageUrl').value.trim(),
        specifications: document.getElementById('productSpecifications').value.trim(),
        sample_details: document.getElementById('productSampleDetails').value.trim(),
        moq_of_product: parseInt(document.getElementById('productMoq').value) || null,
        days_of_manufacturing: parseInt(document.getElementById('productDaysManufacturing').value) || null,
        product_video_url: document.getElementById('productVideoUrl').value.trim(),
        type_id: document.getElementById('productTypeId').value || null
    };
    if (currentAddImageFile) {
        try {
            productData.product_image_url = await uploadProductImageFile(currentAddImageFile);
        } catch (uploadError) {
            console.error('Error uploading image file:', uploadError);
            alert(`فشل رفع الصورة. تأكد أن الباكت "${PRODUCT_IMAGE_BUCKET}" موجودة وتملك صلاحية الوصول.

الخطأ: ${uploadError.message || JSON.stringify(uploadError)}`);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                submitBtn.innerText = 'حفظ المنتج';
            }
            return;
        }
    }
    if (!productData.product_custom_id || !productData.product_name) {
        alert('الرجاء تعبئة Product Custom ID و Product Name');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            submitBtn.innerText = 'حفظ المنتج';
        }
        return;
    }
    const { error } = await _supabase.from('products').insert([productData]);
    if (error) {
        console.error('Error saving product:', error);
        alert('حدث خطأ أثناء حفظ المنتج');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            submitBtn.innerText = 'حفظ المنتج';
        }
        return;
    }
    closeAddProductModal();
    await loadProducts();
    alert('تم إضافة المنتج بنجاح');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        submitBtn.innerText = 'حفظ المنتج';
    }
}

async function openEditProductModal(id) {
    const { data, error } = await _supabase.from('products').select('*').eq('id', id).single();
    if (error) {
        console.error('Error loading product for edit:', error);
        alert('فشل جلب بيانات المنتج');
        return;
    }
    currentEditingProductId = id;
    document.getElementById('editProductCustomId').value = data.product_custom_id || '';
    document.getElementById('editProductName').value = data.product_name || '';
    document.getElementById('editProductImageUrl').value = data.product_image_url || '';
    document.getElementById('editProductSpecifications').value = data.specifications || '';
    document.getElementById('editProductSampleDetails').value = data.sample_details || '';
    document.getElementById('editProductMoq').value = data.moq_of_product ?? '';
    document.getElementById('editProductDaysManufacturing').value = data.days_of_manufacturing ?? '';
    document.getElementById('editProductVideoUrl').value = data.product_video_url || '';
    document.getElementById('editProductTypeId').value = data.type_id || '';
    currentEditImageFile = null;
    releaseEditImageObjectUrl();
    const editFileInput = document.getElementById('editProductImageFile');
    if (editFileInput) editFileInput.value = '';
    updateEditImagePreview();
    showEditProductModal();
}

async function updateProduct(event) {
    event.preventDefault();
    const submitBtn = document.getElementById('updateProductButton');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        submitBtn.innerText = 'جاري التحديث...';
    }
    if (!currentEditingProductId) {
        alert('لا يوجد منتج محدد للتعديل');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            submitBtn.innerText = 'حفظ التعديلات';
        }
        return;
    }
    const productData = {
        product_custom_id: document.getElementById('editProductCustomId').value.trim(),
        product_name: document.getElementById('editProductName').value.trim(),
        product_image_url: document.getElementById('editProductImageUrl').value.trim(),
        specifications: document.getElementById('editProductSpecifications').value.trim(),
        sample_details: document.getElementById('editProductSampleDetails').value.trim(),
        moq_of_product: parseInt(document.getElementById('editProductMoq').value) || null,
        days_of_manufacturing: parseInt(document.getElementById('editProductDaysManufacturing').value) || null,
        product_video_url: document.getElementById('editProductVideoUrl').value.trim(),
        type_id: document.getElementById('editProductTypeId').value || null
    };
    if (currentEditImageFile) {
        try {
            productData.product_image_url = await uploadProductImageFile(currentEditImageFile);
        } catch (uploadError) {
            console.error('Error uploading image file:', uploadError);
            alert(`فشل رفع الصورة. تأكد أن الباكت "${PRODUCT_IMAGE_BUCKET}" موجودة وتملك صلاحية الوصول.

الخطأ: ${uploadError.message || JSON.stringify(uploadError)}`);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                submitBtn.innerText = 'حفظ التعديلات';
            }
            return;
        }
    }
    const { error } = await _supabase.from('products').update(productData).eq('id', currentEditingProductId);
    if (error) {
        console.error('Error updating product:', error);
        alert('حدث خطأ أثناء تحديث المنتج');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            submitBtn.innerText = 'حفظ التعديلات';
        }
        return;
    }
    closeEditProductModal();
    await loadProducts();
    alert('تم تحديث المنتج بنجاح');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        submitBtn.innerText = 'حفظ التعديلات';
    }
}

async function deleteProduct(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    const { error } = await _supabase.from('products').delete().eq('id', id);
    if (error) {
        console.error('Error deleting product:', error);
        alert('فشل حذف المنتج');
        return;
    }
    await loadProducts();
    alert('تم حذف المنتج');
}

document.getElementById('productSearchInput').addEventListener('input', renderProductsTable);
document.getElementById('productTypeFilter').addEventListener('change', renderProductsTable);
document.getElementById('productStatusFilter').addEventListener('change', renderProductsTable);
document.getElementById('addProductForm').addEventListener('submit', saveProduct);
document.getElementById('editProductForm').addEventListener('submit', updateProduct);
document.getElementById('addProductTypeForm').addEventListener('submit', addProductType);

document.getElementById('productImageUrl').addEventListener('input', updateAddImagePreview);
document.getElementById('editProductImageUrl').addEventListener('input', updateEditImagePreview);
document.getElementById('productImageFile').addEventListener('change', handleAddProductImageFileChange);
document.getElementById('editProductImageFile').addEventListener('change', handleEditProductImageFileChange);

window.addEventListener('DOMContentLoaded', async () => {
    await loadProductTypes();
    await loadProducts();
    updateAddImagePreview();
    updateEditImagePreview();
});
