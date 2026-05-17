const PRODUCT_IMAGE_BUCKET = 'product-images';
let products = [];
let productTypes = [];


// متغيرات تتبع الرفع التلقائي السريع للميديا
const uploadingProductsMediaTracker = {};
let activeMediaProductId = null;
let activeMediaType = null;
let activeMediaUrl = null;

// نظام إشعارات ذكي لترتيب التنبيهات فوق بعضها في حالة الرفع المتعدد
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-4 right-4 flex flex-col gap-2 z-[9999] max-w-sm select-none';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `px-5 py-3 rounded-xl shadow-2xl text-white font-bold flex items-center gap-3 transition-all duration-300 transform translate-y-2 opacity-0 text-right dir-rtl`;
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
            toast.className = `px-5 py-3 rounded-xl shadow-2xl text-white font-bold flex items-center gap-3 transition-all duration-300 text-right dir-rtl`;
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

// ضغط الصورة تلقائياً لتقليل الحجم وتسريع الرفع بمعدل 10 أضعاف
async function compressImageIfNeeded(file) {
    if (!file || !file.type.startsWith('image/') || file.type.includes('svg')) {
        return file; // عدم ضغط الملفات غير الصورية أو متجهات الـ SVG
    }
    // إذا كان حجم الصورة أقل من 300 كيلوبايت، لا داعي لضغطها
    if (file.size < 300 * 1024) {
        return file;
    }
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_SIZE = 1200; // الحجم الأقصى المثالي للوضوح والسرعة
                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    } else {
                        resolve(file);
                    }
                }, 'image/jpeg', 0.8); // الجودة المثالية 80%
            };
            img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
    });
}

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
            row.className = 'border-b hover:bg-blue-50 transition text-center';

            // تتبع حالة رفع ميديا المنتج تفاؤلياً
            const imageTrackerKey = `${product.id}_product_image_url`;
            const isImageUploading = uploadingProductsMediaTracker[imageTrackerKey];
            const videoTrackerKey = `${product.id}_product_video_url`;
            const isVideoUploading = uploadingProductsMediaTracker[videoTrackerKey];

            // خلية الصورة
            let imageCell = '';
            if (isImageUploading) {
                imageCell = `
                    <div class="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 shadow-sm mx-auto flex items-center justify-center bg-gray-50 select-none">
                        ${product.product_image_url ? `<img src="${product.product_image_url}" class="w-full h-full object-cover opacity-50">` : ''}
                        <div class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                            <svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        </div>
                    </div>
                `;
            } else if (product.product_image_url) {
                imageCell = `
                    <div class="relative inline-block group select-none">
                        <button type="button" onclick="openProductMediaActionsModal('${product.id}', 'product_image_url', '${product.product_image_url}')" class="inline-block rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition">
                            <img src="${product.product_image_url}" alt="صورة المنتج" class="w-16 h-16 object-cover">
                        </button>
                        <span class="absolute top-0 right-0 w-4 h-4 bg-blue-500 rounded-full border border-white text-white text-[9px] flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition duration-150 pointer-events-none">⚙️</span>
                    </div>
                `;
            } else {
                imageCell = `
                    <button type="button" onclick="openProductMediaActionsModal('${product.id}', 'product_image_url', '')" class="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition flex flex-col items-center justify-center gap-1 mx-auto text-gray-400 hover:text-blue-600 select-none">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                        <span class="text-[9px] font-bold">+ صورة</span>
                    </button>
                `;
            }

            // خلية الفيديو
            let videoCell = '';
            if (isVideoUploading) {
                videoCell = `
                    <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-sm select-none mx-auto">
                        <svg class="animate-spin h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        جاري الرفع...
                    </div>
                `;
            } else if (product.product_video_url) {
                videoCell = `
                    <button type="button" onclick="openProductMediaActionsModal('${product.id}', 'product_video_url', '${product.product_video_url}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 hover:text-green-800 transition shadow-sm active:scale-95 select-none mx-auto group">
                        <svg class="w-3.5 h-3.5 fill-current text-green-500 group-hover:scale-110 transition" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                        تشغيل الفيديو
                    </button>
                `;
            } else {
                videoCell = `
                    <button type="button" onclick="openProductMediaActionsModal('${product.id}', 'product_video_url', '')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-gray-50 text-gray-500 border border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition shadow-sm active:scale-95 select-none mx-auto">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                        + فيديو
                    </button>
                `;
            }

            // قائمة منسدلة لاختيار النوع
            let typeSelectHtml = `<select onchange="updateProductFieldInline('${product.id}', 'type_id', this)" class="border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium text-gray-700 select-none">`;
            typeSelectHtml += `<option value="">بدون نوع</option>`;
            productTypes.forEach(type => {
                const selected = product.type_id === type.id ? 'selected' : '';
                typeSelectHtml += `<option value="${type.id}" ${selected}>${type.category_name}</option>`;
            });
            typeSelectHtml += `</select>`;

            row.innerHTML = `
                <td class="p-4 text-sm text-gray-400 bg-gray-50 font-mono select-none">${product.product_custom_id || '-'}</td>
                <td contenteditable="true" onblur="updateProductFieldInline('${product.id}', 'product_name', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="p-4 font-medium text-gray-900 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 rounded px-1 transition duration-150">${product.product_name || ''}</td>
                <td class="p-4">${imageCell}</td>
                <td contenteditable="true" onblur="updateProductFieldInline('${product.id}', 'specifications', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="p-4 text-sm text-gray-700 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 rounded px-1 transition duration-150 whitespace-pre-wrap">${product.specifications || ''}</td>
                <td contenteditable="true" onblur="updateProductFieldInline('${product.id}', 'sample_details', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="p-4 text-sm text-gray-700 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 rounded px-1 transition duration-150 whitespace-pre-wrap">${product.sample_details || ''}</td>
                <td contenteditable="true" onblur="updateProductFieldInline('${product.id}', 'moq_of_product', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="p-4 text-gray-700 font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 rounded px-1 transition duration-150">${product.moq_of_product ?? ''}</td>
                <td contenteditable="true" onblur="updateProductFieldInline('${product.id}', 'days_of_manufacturing', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="p-4 text-gray-700 font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 rounded px-1 transition duration-150">${product.days_of_manufacturing ?? ''}</td>
                <td class="p-4">${videoCell}</td>
                <td class="p-4">${typeSelectHtml}</td>
                <td class="p-4 text-left whitespace-nowrap select-none">
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

async function addEmptyProduct() {
    const num = 100 + products.length;
    const defaultName = `منتج جديد ${num}`;
    const productData = {
        product_custom_id: `${defaultName}_${num}`,
        product_name: defaultName,
        product_image_url: '',
        specifications: '',
        sample_details: '',
        moq_of_product: null,
        days_of_manufacturing: null,
        product_video_url: '',
        type_id: null
    };

    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-xl shadow-2xl z-[100] flex items-center gap-3 animate-bounce select-none dir-rtl';
    notification.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        جاري إضافة سطر منتج جديد...
    `;
    document.body.appendChild(notification);

    try {
        const { data, error } = await _supabase
            .from('products')
            .insert([productData])
            .select('*')
            .single();

        if (error) throw error;

        if (data) {
            products.push(data);
        }

        renderProductsTable();

        notification.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl z-[100] flex items-center gap-2 select-none dir-rtl';
        notification.innerHTML = '🎉 تم إضافة منتج فارغ جديد بنجاح! عدل الخلايا مباشرة.';
        setTimeout(() => notification.remove(), 3000);

    } catch (err) {
        console.error('خطأ أثناء إضافة المنتج:', err.message);
        notification.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl z-[100] flex items-center gap-2 select-none dir-rtl';
        notification.innerHTML = '❌ فشل إضافة المنتج: ' + err.message;
        setTimeout(() => notification.remove(), 4000);
    }
}

async function deleteProduct(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;

    // 1. إنشاء وإظهار تنبيه الحذف المتحرك فوراً لإشعار المستخدم بالعملية الجارية
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-xl shadow-2xl z-[100] flex items-center gap-3 animate-bounce select-none';
    notification.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        جاري حذف المنتج حالياً...
    `;
    document.body.appendChild(notification);

    try {
        const { error } = await _supabase.from('products').delete().eq('id', id);
        if (error) throw error;

        // 2. تحديث قائمة المنتجات
        await loadProducts();

        // 3. عرض رسالة النجاح وتعديل مظهر التنبيه للون الأخضر الأنيق
        notification.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl z-[100] flex items-center gap-2 select-none';
        notification.innerHTML = '🎉 تم حذف المنتج بنجاح!';
        setTimeout(() => notification.remove(), 3000);

    } catch (error) {
        console.error('Error deleting product:', error);

        // 4. عرض رسالة الفشل باللون الأحمر
        notification.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl z-[100] flex items-center gap-2 select-none';
        notification.innerHTML = '❌ فشل الحذف: ' + (error.message || 'حدث خطأ ما');
        setTimeout(() => notification.remove(), 4000);
    }
}

document.getElementById('productSearchInput').addEventListener('input', renderProductsTable);
document.getElementById('productTypeFilter').addEventListener('change', renderProductsTable);
document.getElementById('productStatusFilter').addEventListener('change', renderProductsTable);
document.getElementById('addProductTypeForm').addEventListener('submit', addProductType);

// تحديث حقل منتج فردي مباشرة من الجدول (Inline Editing)
async function updateProductFieldInline(productId, fieldName, element) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    let rawValue = (element.tagName === 'SELECT') ? element.value : element.innerText.trim();
    let parsedValue = rawValue;

    // الحقول الرقمية
    const numericFields = ['moq_of_product', 'days_of_manufacturing'];
    if (numericFields.includes(fieldName)) {
        rawValue = rawValue.replace(/,/g, '');
        if (rawValue === '') {
            parsedValue = null;
        } else {
            parsedValue = parseInt(rawValue);
            if (isNaN(parsedValue)) {
                alert('يرجى إدخال قيمة رقمية صحيحة');
                element.innerText = product[fieldName] !== null ? product[fieldName] : '';
                return;
            }
        }
    }

    // إذا لم تتغير القيمة، لا داعي لتحديث قاعدة البيانات
    if (product[fieldName] === parsedValue) {
        return;
    }

    // حفظ القيمة القديمة للتراجع عند الخطأ
    const oldVal = product[fieldName];
    const oldCustomId = product.product_custom_id;

    // التحديث التفاؤلي الفوري
    product[fieldName] = parsedValue;

    // إذا تغير اسم المنتج، نقوم بتحديث الـ product_custom_id تلقائياً!
    let customIdUpdate = null;
    if (fieldName === 'product_name') {
        const parts = (product.product_custom_id || '').split('_');
        const lastPart = parts[parts.length - 1];
        let num = parseInt(lastPart);
        if (isNaN(num)) {
            const idx = products.findIndex(p => p.id === productId);
            num = idx !== -1 ? (100 + idx) : (100 + products.length);
        }
        product.product_custom_id = parsedValue ? `${parsedValue}_${num}` : '';
        customIdUpdate = product.product_custom_id;
    }

    // إعادة رسم الجدول فوراً بدون انتظار
    renderProductsTable();

    // إضاءة الخلية المعدلة
    const updatedCell = (element.tagName === 'SELECT') ? element.parentElement : element;
    if (updatedCell) {
        updatedCell.classList.add('bg-yellow-50');
    }

    try {
        const payload = { [fieldName]: parsedValue };
        if (customIdUpdate !== null) {
            payload.product_custom_id = customIdUpdate;
        }

        const { error } = await _supabase
            .from('products')
            .update(payload)
            .eq('id', productId);

        if (error) throw error;

        // إضاءة خضراء عند النجاح
        if (updatedCell) {
            updatedCell.classList.remove('bg-yellow-50');
            updatedCell.classList.add('bg-green-50');
            setTimeout(() => {
                updatedCell.classList.remove('bg-green-50');
            }, 800);
        }
    } catch (err) {
        console.error('Error auto-saving inline product field:', err);
        alert('فشل حفظ التعديل في قاعدة البيانات: ' + err.message);

        // التراجع عند الفشل
        product[fieldName] = oldVal;
        if (customIdUpdate !== null) {
            product.product_custom_id = oldCustomId;
        }
        renderProductsTable();
    }
}

// التحكم بلوحة المفاتيح أثناء التعديل المباشر (Enter ينقل لليسار، Ctrl + Enter لسطر جديد)
function handleEditableCellKeyDown(event, element) {
    if (event.key === 'Enter') {
        if (event.ctrlKey) {
            // إجبار المتصفح على إدخال سطر جديد يدويًا عند الضغط على Ctrl + Enter
            event.preventDefault();
            document.execCommand('insertLineBreak');
        } else {
            // منع إدخال سطر جديد وحفظ التعديل فوراً
            event.preventDefault();
            element.blur();

            // العثور على الخلية التالية القابلة للتعديل إلى اليسار (الاتجاه في RTL يعني العنصر التالي DOM sibling)
            let nextCell = element.nextElementSibling;
            while (nextCell) {
                if (nextCell.getAttribute('contenteditable') === 'true') {
                    nextCell.focus();

                    // وضع مؤشر الكتابة في نهاية النص داخل الخلية الجديدة
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(nextCell);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    break;
                }
                nextCell = nextCell.nextElementSibling;
            }
        }
    }
}

// فتح مودال خيارات الميديا (عرض / رفع)
function openProductMediaActionsModal(productId, mediaType, currentUrl) {
    activeMediaProductId = productId;
    activeMediaType = mediaType;
    activeMediaUrl = currentUrl;

    const modal = document.getElementById('photoActionsModal');
    const title = document.getElementById('photoActionsTitle');
    const viewBtn = document.getElementById('viewPhotoActionBtn');
    const viewBtnText = document.getElementById('viewPhotoActionText');
    const uploadBtnText = document.getElementById('uploadPhotoActionText');
    const fileInput = document.getElementById('hiddenPhotoSelectorInput');

    if (!modal || !title || !viewBtn || !fileInput) return;

    let typeName = 'الملف';
    if (mediaType === 'product_image_url') {
        typeName = 'صورة المنتج';
        fileInput.accept = 'image/*';
        viewBtnText.textContent = 'عرض صورة المنتج الكبيرة';
        uploadBtnText.textContent = 'رفع صورة منتج جديدة';
    } else if (mediaType === 'product_video_url') {
        typeName = 'فيديو المنتج';
        fileInput.accept = 'video/*';
        viewBtnText.textContent = 'تشغيل فيديو المنتج';
        uploadBtnText.textContent = 'رفع فيديو جديد للمنتج';
    }

    title.textContent = `خيارات ${typeName}`;

    // إعداد زر العرض
    if (currentUrl) {
        viewBtn.disabled = false;
        viewBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-100', 'border-gray-200');
        viewBtn.classList.add('bg-blue-50', 'border-blue-100', 'hover:bg-blue-100', 'text-blue-900');
    } else {
        viewBtn.disabled = true;
        viewBtn.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-100', 'border-gray-200');
        viewBtn.classList.remove('bg-blue-50', 'border-blue-100', 'hover:bg-blue-100', 'text-blue-900');
    }

    modal.classList.remove('hidden');
}

function closePhotoActionsModal() {
    const modal = document.getElementById('photoActionsModal');
    if (modal) modal.classList.add('hidden');
}

function openVideoPreviewModal(videoUrl) {
    const modal = document.getElementById('videoPreviewModal');
    const videoPlayer = document.getElementById('modalPreviewVideo');
    if (!modal || !videoPlayer) return;
    videoPlayer.src = videoUrl;
    modal.classList.remove('hidden');
    videoPlayer.play().catch(e => console.log('Auto-play blocked or failed:', e));
}

function closeVideoPreviewModal() {
    const modal = document.getElementById('videoPreviewModal');
    const videoPlayer = document.getElementById('modalPreviewVideo');
    if (!modal) return;
    if (videoPlayer) {
        videoPlayer.pause();
        videoPlayer.src = '';
    }
    modal.classList.add('hidden');
}

window.addEventListener('DOMContentLoaded', async () => {
    await loadProductTypes();
    await loadProducts();

    // ربط أزرار مودال الميديا بالأحداث
    const viewBtn = document.getElementById('viewPhotoActionBtn');
    if (viewBtn) {
        viewBtn.addEventListener('click', () => {
            if (!activeMediaUrl) return;
            closePhotoActionsModal();
            if (activeMediaType === 'product_video_url') {
                openVideoPreviewModal(activeMediaUrl);
            } else {
                openImageModal(activeMediaUrl);
            }
        });
    }

    const uploadBtn = document.getElementById('uploadPhotoActionBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            const fileInput = document.getElementById('hiddenPhotoSelectorInput');
            if (fileInput) fileInput.click();
        });
    }

    // ربط مدخل الملف المخفي للأحداث
    const fileInput = document.getElementById('hiddenPhotoSelectorInput');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // إغلاق مودال الخيارات فوراً
            closePhotoActionsModal();

            const targetProductId = activeMediaProductId;
            const targetMediaType = activeMediaType;
            if (!targetProductId || !targetMediaType) return;

            // التحقق من حجم الفيديو لتجنب فشل الرفع في باقة Supabase المجانية (الحد الأقصى 50 ميجابايت)
            if (file.type.startsWith('video/') || targetMediaType === 'product_video_url') {
                const maxVideoSize = 50 * 1024 * 1024; // 50MB
                if (file.size > maxVideoSize) {
                    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
                    const sizeToast = showToast(`
                        ⚠️ حجم الفيديو (${fileSizeMB}MB) كبير جداً!
                        الحد الأقصى المسموح به هو 50MB. يرجى تقصير الفيديو أو تقليل دقة الكاميرا.
                    `, 'error');
                    setTimeout(() => sizeToast.remove(), 7000);
                    e.target.value = '';
                    return;
                }
            }

            const trackerKey = `${targetProductId}_${targetMediaType}`;
            const oldMediaUrl = products.find(p => p.id === targetProductId)?.[targetMediaType] || null;

            // 1. إنشاء رابط محلي مؤقت فوري
            const tempLocalUrl = URL.createObjectURL(file);

            // 2. تحديث الذاكرة المحلية فوراً (تحديث تفاؤلي)
            const prod = products.find(p => p.id === targetProductId);
            if (prod) {
                prod[targetMediaType] = tempLocalUrl;
            }

            // 3. وضع علامة جاري الرفع لتفعيل مؤشر التحميل الدوار فوق الصورة في الجدول
            uploadingProductsMediaTracker[trackerKey] = true;

            // 4. إعادة رسم الجدول فوراً
            renderProductsTable();

            // تحديد اسم البند ونوع الصورة لإظهاره في التنبيه
            let typeName = 'الملف';
            if (targetMediaType === 'product_image_url') typeName = 'صورة المنتج';
            else if (targetMediaType === 'product_video_url') typeName = 'فيديو المنتج';

            const isVideo = targetMediaType === 'product_video_url';
            const toast = showToast(`
                <svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                ${isVideo ? `جاري رفع ${typeName}...` : `جاري ضغط ورفع ${typeName}...`}
            `);

            try {
                // 5. ضغط الصورة تلقائياً لتسريع عملية الرفع بـ 10 أضعاف
                const compressedFile = await compressImageIfNeeded(file);

                // 6. رفع الصورة/الفيديو إلى Supabase Storage
                const uploadedUrl = await uploadProductImageFile(compressedFile);
                if (!uploadedUrl) throw new Error('فشل الحصول على رابط الملف المرفوع');

                // 7. تحديث قاعدة البيانات (جدول products)
                const { error: dbError } = await _supabase
                    .from('products')
                    .update({ [targetMediaType]: uploadedUrl })
                    .eq('id', targetProductId);

                if (dbError) throw dbError;

                // 8. تحديث الذاكرة المحلية بالرابط الحقيقي النهائي
                if (prod) {
                    prod[targetMediaType] = uploadedUrl;
                }

                // حذف المؤشر وإعادة رسم الجدول فوراً بالرابط النهائي الجديد
                delete uploadingProductsMediaTracker[trackerKey];
                renderProductsTable();

                toast.update(`🎉 تم حفظ ${typeName} بنجاح!`, 'success');
                setTimeout(() => toast.remove(), 2500);

            } catch (err) {
                console.error('خطأ أثناء رفع وحفظ الملف:', err.message);

                // التراجع الآمن عن الملف المؤقت وإعادة القيمة الأصلية عند الفشل
                if (prod) {
                    prod[targetMediaType] = oldMediaUrl;
                }
                delete uploadingProductsMediaTracker[trackerKey];
                renderProductsTable();

                toast.update(`❌ فشل حفظ ${typeName}: ${err.message}`, 'error');
                setTimeout(() => toast.remove(), 4000);
            } finally {
                fileInput.value = '';
                URL.revokeObjectURL(tempLocalUrl);
            }
        });
    }
});
