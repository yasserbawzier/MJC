let invoiceItems = [];
let productsLookup = [];
let itemPhotosLookup = {};
let currentInvoiceId = null;
let currentCustomerName = '-';
let currentShippingRatePerCbm = 0;
let uploadingPhotosTracker = {};
let showOnlyActive = false;
let sortActiveFirst = false;

// دالة تنسيق الأرقام
function formatNumber(value) {
    if (value === null || value === undefined || value === '') return '-';
    return Number(value).toLocaleString('en-US');
}

// البحث عن منتج بالمعرف
function getProductById(productId) {
    return productsLookup.find(item => item.id === productId) || null;
}

function getNextItemName() {
    return `Item ${invoiceItems.length + 1}`;
}

async function uploadInvoiceItemImageFile(file) {
    if (!file) return null;
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
    const filePath = `invoice-item-photos/${fileName}`;
    const { error } = await _supabase.storage.from('product-images').upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
    });
    if (error) {
        throw new Error(`Upload error: ${error.message || error.details || JSON.stringify(error)}`);
    }
    const { data: publicData, error: publicError } = await _supabase.storage.from('product-images').getPublicUrl(filePath);
    if (publicError) {
        throw new Error(`Public URL error: ${publicError.message || publicError.details || JSON.stringify(publicError)}`);
    }
    return publicData?.publicUrl || null;
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

// نظام إشعارات ذكي لترتيب التنبيهات فوق بعضها في حالة الرفع المتعدد
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-item ${type} hidden-toast`;

    // إعداد الأيقونة بناءً على نوع التنبيه
    let icon = '';
    if (type === 'success') {
        icon = `<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
    } else if (type === 'error') {
        icon = `<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
    } else {
        icon = `<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    }

    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('hidden-toast');
    }, 10);

    return {
        update: (newMessage, newType) => {
            toast.className = `toast-item ${newType}`;
            let newIcon = '';
            if (newType === 'success') {
                newIcon = `<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
            } else if (newType === 'error') {
                newIcon = `<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
            } else {
                newIcon = `<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
            }
            toast.innerHTML = `${newIcon}<span>${newMessage}</span>`;
        },
        remove: () => {
            toast.classList.add('hidden-toast');
            setTimeout(() => toast.remove(), 300);
        }
    };
}

async function loadItemPhotosForInvoiceItems(itemIds) {
    itemPhotosLookup = {};
    if (!itemIds || itemIds.length === 0) return;

    const { data, error } = await _supabase.from('item_photos').select('*').in('item_id', itemIds);
    if (error) {
        console.error('خطأ في جلب صور العناصر:', error.message);
        return;
    }

    (data || []).forEach(photo => {
        itemPhotosLookup[photo.item_id] = photo;
    });
}

function updateItemNameField() {
    const itemNameInput = document.getElementById('itemName');
    if (!itemNameInput) return;
    const nextName = getNextItemName();
    itemNameInput.value = nextName;
    itemNameInput.placeholder = nextName;
}

function getItemNumber(name) {
    if (!name) return 999999;
    const match = name.toString().match(/\d+/);
    return match ? parseInt(match[0], 10) : 999999;
}

async function reorderInvoiceItems() {
    sortActiveFirst = true;

    const sortedData = [...invoiceItems].sort((a, b) => {
        const aActive = a.status === true;
        const bActive = b.status === true;
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;

        return new Date(a.created_at) - new Date(b.created_at);
    });
    invoiceItems = sortedData;

    renderInvoiceItemsTable();
    updateInvoiceItemsFooter();

    const t = showToast("تم إعادة ترتيب الجدول (النشط أولاً) بنجاح! ✨", "success");
    setTimeout(() => t.remove(), 3000);
}

// ===================================================
// استيراد Excel - محوّل إلى excel_import.js
// ===================================================
// تم نقل منطق استيراد Excel الكامل إلى ملف excel_import.js
// الوظائف المتاحة: handleExcelFileSelected, confirmExcelImport, closeExcelImportModal

// تعبئة قائمة المنتجات المنسدلة
function renderProductOptions() {
    const select = document.getElementById('invoiceItemProductId');
    if (!select) return;
    select.innerHTML = '<option value="">اختر المنتج</option>';
    productsLookup.forEach(product => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = `${product.product_custom_id || product.id} - ${product.product_name || 'بدون اسم'}`;
        select.appendChild(option);
    });
}

// تحديث معاينة المنتج عند الاختيار
function updateProductPreview() {
    const productId = document.getElementById('invoiceItemProductId').value;
    const product = getProductById(productId);
    const previewDiv = document.getElementById('productPreview');
    if (!previewDiv) return;

    if (!product) {
        previewDiv.classList.add('hidden');
        return;
    }

    const img = document.getElementById('productImagePreview');
    if (img) {
        img.src = product.product_image_url || '';
        img.style.display = product.product_image_url ? 'block' : 'none';
    }

    document.getElementById('productNamePreview').textContent = product.product_name || '-';
    document.getElementById('productIdPreview').textContent = product.product_custom_id || '-';
    document.getElementById('productSpecsPreview').textContent = product.specifications || '-';
    document.getElementById('productSamplePreview').textContent = product.sample_details || '-';
    document.getElementById('productMoqPreview').textContent = product.moq_of_product || '-';
    document.getElementById('productDaysPreview').textContent = product.days_of_manufacturing || '-';

    previewDiv.classList.remove('hidden');
}

// عرض عناصر الفاتورة في الجدول
function renderInvoiceItemsTable() {
    const tbody = document.getElementById('invoiceItemsTableBody');
    if (!tbody) return;
    const itemsToRender = showOnlyActive
        ? invoiceItems.filter(item => item.status === true)
        : invoiceItems;

    if (itemsToRender.length === 0) {
        tbody.innerHTML = `<tr><td colspan="28" class="p-4 text-center text-gray-500">${showOnlyActive ? 'لا توجد عناصر نشطة حالياً.' : 'لا توجد عناصر لهذه الفاتورة بعد.'}</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    itemsToRender.forEach(item => {
        const product = getProductById(item.product_id);
        const productCustomId = product ? product.product_custom_id || '-' : '-';
        const productImage = product && product.product_image_url ? `<button type="button" onclick='openProductDetailsModal("${product.id}")' class="inline-block rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition"><img src="${product.product_image_url}" alt="Factory Image" class="w-16 h-16 object-cover" loading="lazy"></button>` : '-';

        const totalFactory = (item.quantity || 0) * (item.factory_price_per_unit || 0);

        const cbmPerCtn = item.length_cm && item.width_cm && item.height_cm
            ? ((Number(item.length_cm) / 100) * (Number(item.width_cm) / 100) * (Number(item.height_cm) / 100)).toFixed(4)
            : null;

        const ctnValue = item.CTN !== null && item.CTN !== undefined
            ? item.CTN
            : ((item.quantity && item.qty_per_ctn) ? Math.ceil(item.quantity / item.qty_per_ctn) : null);

        const totalCbm = item.total_cbm !== null && item.total_cbm !== undefined
            ? item.total_cbm
            : ((cbmPerCtn !== null && ctnValue !== null) ? (Number(cbmPerCtn) * Number(ctnValue)).toFixed(4) : '-');

        const itemPhotos = itemPhotosLookup[item.id] || {};

        const statusCell = item.status === true
            ? `<button type="button" onclick="toggleInvoiceItemStatus('${item.id}', true)" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 hover:text-green-800 transition shadow-sm active:scale-95 select-none mx-auto"><span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>نشط</button>`
            : `<button type="button" onclick="toggleInvoiceItemStatus('${item.id}', false)" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700 transition shadow-sm active:scale-95 select-none mx-auto"><span class="w-2 h-2 rounded-full bg-gray-400"></span>غير نشط</button>`;

        const clientPhotoCellUrl = itemPhotos.client_photo_url || null;
        const isClientPhotoUploading = uploadingPhotosTracker[`${item.id}_client_photo_url`];
        const clientPhotoCell = clientPhotoCellUrl
            ? `<div class="relative w-16 h-16 mx-auto">
                <button type="button" ${item.status === true ? `onclick="openPhotoActionsModal('${item.id}', 'client_photo_url', '${clientPhotoCellUrl}')"` : `onclick="openImageModal('${clientPhotoCellUrl}')"`} class="inline-block rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition w-full h-full"><img src="${clientPhotoCellUrl}" alt="Client Photo" class="w-full h-full object-cover ${isClientPhotoUploading ? 'opacity-40 blur-[1px]' : ''}" loading="lazy"></button>
                ${isClientPhotoUploading ? '<div class="absolute inset-0 flex items-center justify-center pointer-events-none"><svg class="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>' : ''}
               </div>`
            : (item.status === true
                ? `<button type="button" onclick="openPhotoActionsModal('${item.id}', 'client_photo_url', null)" class="flex flex-col items-center justify-center w-16 h-16 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-500 transition-all duration-200 mx-auto"><span class="text-lg font-bold">+</span><span class="text-[9px]">إضافة</span></button>`
                : `<div class="flex flex-col items-center justify-center w-16 h-16 bg-gray-100 border border-gray-200 rounded-lg text-gray-300 mx-auto select-none"><span class="text-lg font-bold">-</span></div>`);

        const designPhotoCellUrl = itemPhotos.design_photo_url || null;
        const isDesignPhotoUploading = uploadingPhotosTracker[`${item.id}_design_photo_url`];
        const designPhotoCell = designPhotoCellUrl
            ? `<div class="relative w-16 h-16 mx-auto">
                <button type="button" ${item.status === true ? `onclick="openPhotoActionsModal('${item.id}', 'design_photo_url', '${designPhotoCellUrl}')"` : `onclick="openImageModal('${designPhotoCellUrl}')"`} class="inline-block rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition w-full h-full"><img src="${designPhotoCellUrl}" alt="Design Photo" class="w-full h-full object-cover ${isDesignPhotoUploading ? 'opacity-40 blur-[1px]' : ''}" loading="lazy"></button>
                ${isDesignPhotoUploading ? '<div class="absolute inset-0 flex items-center justify-center pointer-events-none"><svg class="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>' : ''}
               </div>`
            : (item.status === true
                ? `<button type="button" onclick="openPhotoActionsModal('${item.id}', 'design_photo_url', null)" class="flex flex-col items-center justify-center w-16 h-16 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-500 transition-all duration-200 mx-auto"><span class="text-lg font-bold">+</span><span class="text-[9px]">إضافة</span></button>`
                : `<div class="flex flex-col items-center justify-center w-16 h-16 bg-gray-100 border border-gray-200 rounded-lg text-gray-300 mx-auto select-none"><span class="text-lg font-bold">-</span></div>`);

        const dielinePhotoCellUrl = itemPhotos.dieline_photo_url || null;
        const isDielinePhotoUploading = uploadingPhotosTracker[`${item.id}_dieline_photo_url`];
        const dielinePhotoCell = dielinePhotoCellUrl
            ? `<div class="relative w-16 h-16 mx-auto">
                <button type="button" ${item.status === true ? `onclick="openPhotoActionsModal('${item.id}', 'dieline_photo_url', '${dielinePhotoCellUrl}')"` : `onclick="openImageModal('${dielinePhotoCellUrl}')"`} class="inline-block rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition w-full h-full"><img src="${dielinePhotoCellUrl}" alt="Dieline Photo" class="w-full h-full object-cover ${isDielinePhotoUploading ? 'opacity-40 blur-[1px]' : ''}" loading="lazy"></button>
                ${isDielinePhotoUploading ? '<div class="absolute inset-0 flex items-center justify-center pointer-events-none"><svg class="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>' : ''}
               </div>`
            : (item.status === true
                ? `<button type="button" onclick="openPhotoActionsModal('${item.id}', 'dieline_photo_url', null)" class="flex flex-col items-center justify-center w-16 h-16 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-500 transition-all duration-200 mx-auto"><span class="text-lg font-bold">+</span><span class="text-[9px]">إضافة</span></button>`
                : `<div class="flex flex-col items-center justify-center w-16 h-16 bg-gray-100 border border-gray-200 rounded-lg text-gray-300 mx-auto select-none"><span class="text-lg font-bold">-</span></div>`);

        const itemNameDisplay = item.item_name || '-';

        const rowClass = item.status === true
            ? 'border-b hover:bg-blue-50 transition'
            : 'border-b bg-gray-100 text-gray-400 transition opacity-80';

        const editableAttr = item.status === true ? 'contenteditable="true"' : 'contenteditable="false"';
        const editableClass = item.status === true
            ? 'p-3 text-sm text-gray-700 border border-gray-200 text-left hover:bg-yellow-50 focus:bg-yellow-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:shadow-inner transition-all duration-150 cursor-pointer whitespace-pre-wrap'
            : 'p-3 text-sm text-gray-400 border border-gray-200 text-left bg-gray-100 cursor-not-allowed whitespace-pre-wrap';

        const productCell = item.status === true
            ? `<td onclick="openProductSelectorModal('${item.id}')" class="p-3 text-sm text-blue-600 hover:text-blue-800 font-bold border border-gray-200 text-left cursor-pointer hover:bg-blue-50 transition-all duration-150 relative group select-none" dir="ltr">
                <span class="border-b border-dashed border-blue-400 group-hover:border-blue-700">${productCustomId}</span>
                <span class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-[9px] bg-blue-500 text-white rounded px-1 scale-90 transition-all">تغيير</span>
               </td>`
            : `<td class="p-3 text-sm text-gray-400 font-medium border border-gray-200 text-left select-none" dir="ltr">
                <span>${productCustomId}</span>
               </td>`;

        const row = document.createElement('tr');
        row.className = rowClass;
        row.id = `row-${item.id}`;
        row.innerHTML = `
            <td class="p-3 text-sm border border-gray-200 text-left select-none ${item.status === true ? 'text-gray-700' : 'text-gray-400 font-medium'}" dir="ltr">${itemNameDisplay}</td>
            <td class="p-3 text-sm text-gray-700 border border-gray-200 text-center">${clientPhotoCell}</td>
            <td class="p-3 text-sm text-gray-700 border border-gray-200 text-center">${designPhotoCell}</td>
            <td class="p-3 text-sm text-gray-700 border border-gray-200 text-center">${dielinePhotoCell}</td>
            <td class="p-3 text-sm border border-gray-200 text-center ${item.status === true ? 'text-gray-700' : 'text-gray-400'}">-</td>
            <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'size', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 140px;" dir="ltr">${item.size || ''}</td>
            <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'specifications', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 220px;" dir="ltr">${item.specifications || ''}</td>
            ${productCell}
            <td class="p-3 text-sm border border-gray-200 text-center select-none">${productImage}</td>
            <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'sample', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 160px;" dir="ltr">${item.sample || ''}</td>
            <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'production', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 160px;" dir="ltr">${item.production || ''}</td>
            <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'quantity', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass} font-semibold" style="min-width: 100px;" dir="ltr">${item.quantity || 0}</td>
            <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'unit_type', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 100px;" dir="ltr">${item.unit_type || ''}</td>
            <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'factory_price_per_unit', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 120px;" dir="ltr">${item.factory_price_per_unit || 0}</td>
            <td id="cell-total-factory-${item.id}" class="p-3 text-sm border border-gray-200 text-left bg-blue-50 ${item.status === true ? 'text-gray-700' : 'text-gray-400 font-medium'}" dir="ltr">${formatNumber(totalFactory)}</td>
            <td id="cell-shipping-unit-${item.id}" ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'shipping_price_per_unit', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass} font-semibold" style="min-width: 120px;" dir="ltr">${item.shipping_price_per_unit !== null && item.shipping_price_per_unit !== undefined ? item.shipping_price_per_unit : 0}</td>
            <td id="cell-total-shipping-${item.id}" class="p-3 text-sm border border-gray-200 text-left bg-red-50 ${item.status === true ? 'text-gray-700' : 'text-gray-400 font-medium'}" dir="ltr">${formatNumber(item.total_shipping_cost)}</td>
            <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'qty_per_ctn', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 120px;" dir="ltr">${item.qty_per_ctn || 0}</td>
            <td id="cell-ctn-${item.id}" ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'CTN', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass} bg-yellow-50" style="min-width: 100px;" dir="ltr">${item.CTN !== null && item.CTN !== undefined ? item.CTN : ''}</td>
            <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'gw_per_ctn_kg', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 120px;" dir="ltr">${item.gw_per_ctn_kg || 0}</td>
            <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'length_cm', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 90px;" dir="ltr">${item.length_cm || 0}</td>
            <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'width_cm', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 90px;" dir="ltr">${item.width_cm || 0}</td>
            <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'height_cm', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 90px;" dir="ltr">${item.height_cm || 0}</td>
            <td id="cell-cbm-per-ctn-${item.id}" class="p-3 text-sm border border-gray-200 text-left ${item.status === true ? 'text-gray-700' : 'text-gray-400 font-medium'}" dir="ltr">${cbmPerCtn !== null ? formatNumber(cbmPerCtn) : '-'}</td>
            <td id="cell-total-cbm-${item.id}" class="p-3 text-sm border border-gray-200 text-left bg-yellow-50 ${item.status === true ? 'text-gray-700' : 'text-gray-400 font-medium'}" dir="ltr">${totalCbm !== '-' ? formatNumber(totalCbm) : '-'}</td>
            <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'place', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 120px;" dir="ltr">${item.place || ''}</td>
            <td id="cell-status-${item.id}" class="p-3 text-sm border border-gray-200 text-center select-none" style="min-width: 110px;">${statusCell}</td>
            <td class="p-3 text-center border border-gray-200 whitespace-nowrap select-none">
                <button onclick="deleteInvoiceItem('${item.id}')" class="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm hover:shadow active:scale-95 transition-all text-xs">حذف</button>
            </td>
        `;
        fragment.appendChild(row);
    });

    const totalRow = document.createElement('tr');
    totalRow.id = 'invoiceItemsTotalRow';
    totalRow.className = 'bg-gray-100 font-bold border-t-2 border-double border-gray-400';
    fragment.appendChild(totalRow);

    tbody.innerHTML = '';
    tbody.appendChild(fragment);

    updateInvoiceItemsFooter();
}

function updateInvoiceItemsFooter() {
    let totalMOQ = 0, totalAmountVal = 0, totalShippingVal = 0, totalCtnVal = 0, totalCbmVal = 0;
    const itemsToRender = showOnlyActive ? invoiceItems.filter(item => item.status === true) : invoiceItems;

    itemsToRender.forEach(item => {
        const totalFactory = (item.quantity || 0) * (item.factory_price_per_unit || 0);

        const cbmPerCtn = item.length_cm && item.width_cm && item.height_cm
            ? ((Number(item.length_cm) / 100) * (Number(item.width_cm) / 100) * (Number(item.height_cm) / 100)).toFixed(4)
            : null;

        const ctnValue = item.CTN !== null && item.CTN !== undefined
            ? item.CTN
            : ((item.quantity && item.qty_per_ctn) ? Math.ceil(item.quantity / item.qty_per_ctn) : null);

        const totalCbm = item.total_cbm !== null && item.total_cbm !== undefined
            ? item.total_cbm
            : ((cbmPerCtn !== null && ctnValue !== null) ? (Number(cbmPerCtn) * Number(ctnValue)).toFixed(4) : '-');

        totalMOQ += Number(item.quantity || 0);
        totalAmountVal += totalFactory;
        totalShippingVal += Number(item.total_shipping_cost || 0);
        totalCtnVal += Number(ctnValue || 0);
        if (totalCbm !== '-' && totalCbm !== null) {
            totalCbmVal += Number(totalCbm);
        }
    });

    const totalRow = document.getElementById('invoiceItemsTotalRow');
    if (totalRow) {
        totalRow.innerHTML = `
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center" colspan="11">المجموع الإجمالي / Totals</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-blue-50">${formatNumber(totalMOQ)}</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center" colspan="2">-</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-blue-100">${formatNumber(totalAmountVal)}</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center">-</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-red-100">${formatNumber(totalShippingVal)}</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center">-</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-yellow-100">${formatNumber(totalCtnVal)}</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center" colspan="5">-</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-yellow-100">${totalCbmVal > 0 ? totalCbmVal.toFixed(4) : '-'}</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center" colspan="3">-</td>
        `;
    }

    const statQty = document.getElementById('statTotalQuantity');
    if (statQty) statQty.textContent = totalMOQ.toLocaleString('en-US');

    const statCtn = document.getElementById('statTotalCtn');
    if (statCtn) statCtn.textContent = totalCtnVal.toLocaleString('en-US');

    const statCbm = document.getElementById('statTotalCbm');
    if (statCbm) statCbm.textContent = totalCbmVal.toFixed(4);

    const statShipping = document.getElementById('statTotalShipping');
    if (statShipping) statShipping.textContent = '$' + totalShippingVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const statFactory = document.getElementById('statTotalFactory');
    if (statFactory) statFactory.textContent = '$' + totalAmountVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function updateInvoiceItemRowTargeted(itemId) {
    const item = invoiceItems.find(i => i.id === itemId);
    if (!item) return;

    const totalFactory = (item.quantity || 0) * (item.factory_price_per_unit || 0);

    const cbmPerCtn = item.length_cm && item.width_cm && item.height_cm
        ? ((Number(item.length_cm) / 100) * (Number(item.width_cm) / 100) * (Number(item.height_cm) / 100)).toFixed(4)
        : null;

    const ctnValue = item.CTN !== null && item.CTN !== undefined
        ? item.CTN
        : ((item.quantity && item.qty_per_ctn) ? Math.ceil(item.quantity / item.qty_per_ctn) : null);

    const totalCbm = item.total_cbm !== null && item.total_cbm !== undefined
        ? item.total_cbm
        : ((cbmPerCtn !== null && ctnValue !== null) ? (Number(cbmPerCtn) * Number(ctnValue)).toFixed(4) : '-');

    const cellTotalFactory = document.getElementById(`cell-total-factory-${itemId}`);
    if (cellTotalFactory) cellTotalFactory.textContent = formatNumber(totalFactory);

    const cellShippingUnit = document.getElementById(`cell-shipping-unit-${itemId}`);
    if (cellShippingUnit && document.activeElement !== cellShippingUnit) {
        cellShippingUnit.textContent = item.shipping_price_per_unit !== null && item.shipping_price_per_unit !== undefined ? item.shipping_price_per_unit : 0;
    }

    const cellTotalShipping = document.getElementById(`cell-total-shipping-${itemId}`);
    if (cellTotalShipping) cellTotalShipping.textContent = formatNumber(item.total_shipping_cost);

    const cellCtn = document.getElementById(`cell-ctn-${itemId}`);
    if (cellCtn && document.activeElement !== cellCtn) {
        cellCtn.textContent = item.CTN !== null && item.CTN !== undefined ? item.CTN : '';
    }

    const cellCbmPerCtn = document.getElementById(`cell-cbm-per-ctn-${itemId}`);
    if (cellCbmPerCtn) cellCbmPerCtn.textContent = cbmPerCtn !== null ? formatNumber(cbmPerCtn) : '-';

    const cellTotalCbm = document.getElementById(`cell-total-cbm-${itemId}`);
    if (cellTotalCbm) cellTotalCbm.textContent = totalCbm !== '-' ? formatNumber(totalCbm) : '-';

    const cellStatus = document.getElementById(`cell-status-${item.id}`);
    if (cellStatus) {
        cellStatus.innerHTML = item.status === true
            ? `<button type="button" onclick="toggleInvoiceItemStatus('${item.id}', true)" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 hover:text-green-800 transition shadow-sm active:scale-95 select-none mx-auto"><span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>نشط</button>`
            : `<button type="button" onclick="toggleInvoiceItemStatus('${item.id}', false)" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700 transition shadow-sm active:scale-95 select-none mx-auto"><span class="w-2 h-2 rounded-full bg-gray-400"></span>غير نشط</button>`;
    }
}

function rebuildInvoiceItemRow(itemId) {
    const item = invoiceItems.find(i => i.id === itemId);
    const row = document.getElementById(`row-${itemId}`);
    if (!item || !row) return;

    const product = getProductById(item.product_id);
    const productCustomId = product ? product.product_custom_id || '-' : '-';
    const productImage = product && product.product_image_url ? `<button type="button" onclick='openProductDetailsModal("${product.id}")' class="inline-block rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition"><img src="${product.product_image_url}" alt="Factory Image" class="w-16 h-16 object-cover" loading="lazy"></button>` : '-';

    const totalFactory = (item.quantity || 0) * (item.factory_price_per_unit || 0);

    const cbmPerCtn = item.length_cm && item.width_cm && item.height_cm
        ? ((Number(item.length_cm) / 100) * (Number(item.width_cm) / 100) * (Number(item.height_cm) / 100)).toFixed(4)
        : null;

    const ctnValue = item.CTN !== null && item.CTN !== undefined
        ? item.CTN
        : ((item.quantity && item.qty_per_ctn) ? Math.ceil(item.quantity / item.qty_per_ctn) : null);

    const totalCbm = item.total_cbm !== null && item.total_cbm !== undefined
        ? item.total_cbm
        : ((cbmPerCtn !== null && ctnValue !== null) ? (Number(cbmPerCtn) * Number(ctnValue)).toFixed(4) : '-');

    const itemPhotos = itemPhotosLookup[item.id] || {};

    const statusCell = item.status === true
        ? `<button type="button" onclick="toggleInvoiceItemStatus('${item.id}', true)" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 hover:text-green-800 transition shadow-sm active:scale-95 select-none mx-auto"><span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>نشط</button>`
        : `<button type="button" onclick="toggleInvoiceItemStatus('${item.id}', false)" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700 transition shadow-sm active:scale-95 select-none mx-auto"><span class="w-2 h-2 rounded-full bg-gray-400"></span>غير نشط</button>`;

    const clientPhotoCellUrl = itemPhotos.client_photo_url || null;
    const isClientPhotoUploading = uploadingPhotosTracker[`${item.id}_client_photo_url`];
    const clientPhotoCell = clientPhotoCellUrl
        ? `<div class="relative w-16 h-16 mx-auto">
            <button type="button" ${item.status === true ? `onclick="openPhotoActionsModal('${item.id}', 'client_photo_url', '${clientPhotoCellUrl}')"` : `onclick="openImageModal('${clientPhotoCellUrl}')"`} class="inline-block rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition w-full h-full"><img src="${clientPhotoCellUrl}" alt="Client Photo" class="w-full h-full object-cover ${isClientPhotoUploading ? 'opacity-40 blur-[1px]' : ''}" loading="lazy"></button>
            ${isClientPhotoUploading ? '<div class="absolute inset-0 flex items-center justify-center pointer-events-none"><svg class="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>' : ''}
           </div>`
        : (item.status === true
            ? `<button type="button" onclick="openPhotoActionsModal('${item.id}', 'client_photo_url', null)" class="flex flex-col items-center justify-center w-16 h-16 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-500 transition-all duration-200 mx-auto"><span class="text-lg font-bold">+</span><span class="text-[9px]">إضافة</span></button>`
            : `<div class="flex flex-col items-center justify-center w-16 h-16 bg-gray-100 border border-gray-200 rounded-lg text-gray-300 mx-auto select-none"><span class="text-lg font-bold">-</span></div>`);

    const designPhotoCellUrl = itemPhotos.design_photo_url || null;
    const isDesignPhotoUploading = uploadingPhotosTracker[`${item.id}_design_photo_url`];
    const designPhotoCell = designPhotoCellUrl
        ? `<div class="relative w-16 h-16 mx-auto">
            <button type="button" ${item.status === true ? `onclick="openPhotoActionsModal('${item.id}', 'design_photo_url', '${designPhotoCellUrl}')"` : `onclick="openImageModal('${designPhotoCellUrl}')"`} class="inline-block rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition w-full h-full"><img src="${designPhotoCellUrl}" alt="Design Photo" class="w-full h-full object-cover ${isDesignPhotoUploading ? 'opacity-40 blur-[1px]' : ''}" loading="lazy"></button>
            ${isDesignPhotoUploading ? '<div class="absolute inset-0 flex items-center justify-center pointer-events-none"><svg class="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>' : ''}
           </div>`
        : (item.status === true
            ? `<button type="button" onclick="openPhotoActionsModal('${item.id}', 'design_photo_url', null)" class="flex flex-col items-center justify-center w-16 h-16 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-500 transition-all duration-200 mx-auto"><span class="text-lg font-bold">+</span><span class="text-[9px]">إضافة</span></button>`
            : `<div class="flex flex-col items-center justify-center w-16 h-16 bg-gray-100 border border-gray-200 rounded-lg text-gray-300 mx-auto select-none"><span class="text-lg font-bold">-</span></div>`);

    const dielinePhotoCellUrl = itemPhotos.dieline_photo_url || null;
    const isDielinePhotoUploading = uploadingPhotosTracker[`${item.id}_dieline_photo_url`];
    const dielinePhotoCell = dielinePhotoCellUrl
        ? `<div class="relative w-16 h-16 mx-auto">
            <button type="button" ${item.status === true ? `onclick="openPhotoActionsModal('${item.id}', 'dieline_photo_url', '${dielinePhotoCellUrl}')"` : `onclick="openImageModal('${dielinePhotoCellUrl}')"`} class="inline-block rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition w-full h-full"><img src="${dielinePhotoCellUrl}" alt="Dieline Photo" class="w-full h-full object-cover ${isDielinePhotoUploading ? 'opacity-40 blur-[1px]' : ''}" loading="lazy"></button>
            ${isDielinePhotoUploading ? '<div class="absolute inset-0 flex items-center justify-center pointer-events-none"><svg class="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>' : ''}
           </div>`
        : (item.status === true
            ? `<button type="button" onclick="openPhotoActionsModal('${item.id}', 'dieline_photo_url', null)" class="flex flex-col items-center justify-center w-16 h-16 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-500 transition-all duration-200 mx-auto"><span class="text-lg font-bold">+</span><span class="text-[9px]">إضافة</span></button>`
            : `<div class="flex flex-col items-center justify-center w-16 h-16 bg-gray-100 border border-gray-200 rounded-lg text-gray-300 mx-auto select-none"><span class="text-lg font-bold">-</span></div>`);

    const itemNameDisplay = item.item_name || '-';

    const rowClass = item.status === true
        ? 'border-b hover:bg-blue-50 transition'
        : 'border-b bg-gray-100 text-gray-400 transition opacity-80';

    const editableAttr = item.status === true ? 'contenteditable="true"' : 'contenteditable="false"';
    const editableClass = item.status === true
        ? 'p-3 text-sm text-gray-700 border border-gray-200 text-left hover:bg-yellow-50 focus:bg-yellow-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:shadow-inner transition-all duration-150 cursor-pointer whitespace-pre-wrap'
        : 'p-3 text-sm text-gray-400 border border-gray-200 text-left bg-gray-100 cursor-not-allowed whitespace-pre-wrap';

    const productCell = item.status === true
        ? `<td onclick="openProductSelectorModal('${item.id}')" class="p-3 text-sm text-blue-600 hover:text-blue-800 font-bold border border-gray-200 text-left cursor-pointer hover:bg-blue-50 transition-all duration-150 relative group select-none" dir="ltr">
            <span class="border-b border-dashed border-blue-400 group-hover:border-blue-700">${productCustomId}</span>
            <span class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-[9px] bg-blue-500 text-white rounded px-1 scale-90 transition-all">تغيير</span>
           </td>`
        : `<td class="p-3 text-sm text-gray-400 font-medium border border-gray-200 text-left select-none" dir="ltr">
            <span>${productCustomId}</span>
           </td>`;

    row.className = rowClass;
    row.innerHTML = `
        <td class="p-3 text-sm border border-gray-200 text-left select-none ${item.status === true ? 'text-gray-700' : 'text-gray-400 font-medium'}" dir="ltr">${itemNameDisplay}</td>
        <td class="p-3 text-sm text-gray-700 border border-gray-200 text-center">${clientPhotoCell}</td>
        <td class="p-3 text-sm text-gray-700 border border-gray-200 text-center">${designPhotoCell}</td>
        <td class="p-3 text-sm text-gray-700 border border-gray-200 text-center">${dielinePhotoCell}</td>
        <td class="p-3 text-sm border border-gray-200 text-center ${item.status === true ? 'text-gray-700' : 'text-gray-400'}">-</td>
        <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'size', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 140px;" dir="ltr">${item.size || ''}</td>
        <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'specifications', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 220px;" dir="ltr">${item.specifications || ''}</td>
        ${productCell}
        <td class="p-3 text-sm border border-gray-200 text-center select-none">${productImage}</td>
        <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'sample', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 160px;" dir="ltr">${item.sample || ''}</td>
        <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'production', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 160px;" dir="ltr">${item.production || ''}</td>
        <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'quantity', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass} font-semibold" style="min-width: 100px;" dir="ltr">${item.quantity || 0}</td>
        <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'unit_type', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 100px;" dir="ltr">${item.unit_type || ''}</td>
        <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'factory_price_per_unit', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 120px;" dir="ltr">${item.factory_price_per_unit || 0}</td>
        <td id="cell-total-factory-${item.id}" class="p-3 text-sm border border-gray-200 text-left bg-blue-50 ${item.status === true ? 'text-gray-700' : 'text-gray-400 font-medium'}" dir="ltr">${formatNumber(totalFactory)}</td>
        <td id="cell-shipping-unit-${item.id}" ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'shipping_price_per_unit', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass} font-semibold" style="min-width: 120px;" dir="ltr">${item.shipping_price_per_unit !== null && item.shipping_price_per_unit !== undefined ? item.shipping_price_per_unit : 0}</td>
        <td id="cell-total-shipping-${item.id}" class="p-3 text-sm border border-gray-200 text-left bg-red-50 ${item.status === true ? 'text-gray-700' : 'text-gray-400 font-medium'}" dir="ltr">${formatNumber(item.total_shipping_cost)}</td>
        <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'qty_per_ctn', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 120px;" dir="ltr">${item.qty_per_ctn || 0}</td>
        <td id="cell-ctn-${item.id}" ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'CTN', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass} bg-yellow-50" style="min-width: 100px;" dir="ltr">${item.CTN !== null && item.CTN !== undefined ? item.CTN : ''}</td>
        <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'gw_per_ctn_kg', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 120px;" dir="ltr">${item.gw_per_ctn_kg || 0}</td>
        <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'length_cm', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 90px;" dir="ltr">${item.length_cm || 0}</td>
        <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'width_cm', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 90px;" dir="ltr">${item.width_cm || 0}</td>
        <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'height_cm', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 90px;" dir="ltr">${item.height_cm || 0}</td>
        <td id="cell-cbm-per-ctn-${item.id}" class="p-3 text-sm border border-gray-200 text-left ${item.status === true ? 'text-gray-700' : 'text-gray-400 font-medium'}" dir="ltr">${cbmPerCtn !== null ? formatNumber(cbmPerCtn) : '-'}</td>
        <td id="cell-total-cbm-${item.id}" class="p-3 text-sm border border-gray-200 text-left bg-yellow-50 ${item.status === true ? 'text-gray-700' : 'text-gray-400 font-medium'}" dir="ltr">${totalCbm !== '-' ? formatNumber(totalCbm) : '-'}</td>
        <td ${editableAttr} onfocus="handleEditableCellFocus(this)" onblur="updateInvoiceItemFieldInline('${item.id}', 'place', this)" onkeydown="handleEditableCellKeyDown(event, this)" class="${editableClass}" style="min-width: 120px;" dir="ltr">${item.place || ''}</td>
        <td id="cell-status-${item.id}" class="p-3 text-sm border border-gray-200 text-center select-none" style="min-width: 110px;">${statusCell}</td>
        <td class="p-3 text-center border border-gray-200 whitespace-nowrap select-none">
            <button onclick="deleteInvoiceItem('${item.id}')" class="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm hover:shadow active:scale-95 transition-all text-xs">حذف</button>
        </td>
    `;
}

// تحميل المنتجات
async function loadProductsLookup() {
    // محاولة جلب المنتجات من الذاكرة المؤقتة (sessionStorage) لتسريع التحميل في 0 مللي ثانية
    const cachedProducts = sessionStorage.getItem('products_lookup_cache');
    if (cachedProducts) {
        try {
            productsLookup = JSON.parse(cachedProducts);
            renderProductOptions();
            return;
        } catch (e) {
            console.error('خطأ في قراءة كاش المنتجات المرفق:', e);
        }
    }

    const { data, error } = await _supabase.from('products')
        .select('id, product_custom_id, product_name, product_image_url, specifications, moq_of_product, days_of_manufacturing')
        .order('product_custom_id', { ascending: true });
    if (error) { console.error(error.message); return; }
    productsLookup = data || [];

    try {
        sessionStorage.setItem('products_lookup_cache', JSON.stringify(productsLookup));
    } catch (e) {
        console.error('فشل حفظ كاش المنتجات:', e);
    }

    renderProductOptions();
}

// تحميل تفاصيل الفاتورة
// تحميل تفاصيل الفاتورة
async function loadInvoiceDetails() {
    const { data: invoiceData, error: invoiceError } = await _supabase.from('invoices')
        .select('invoice_number, Price_Per_CBM, customers(customer_custom_id, full_name), shipping_rates(country_code, price_per_cbm)')
        .eq('id', currentInvoiceId)
        .single();
    if (invoiceError) { showToast('حدث خطأ أثناء جلب تفاصيل الفاتورة!', 'error'); return; }

    currentCustomerName = invoiceData.customers?.full_name || '-';
    currentShippingRatePerCbm = invoiceData.Price_Per_CBM || 0;

    document.getElementById('invoiceNumberDisplay').textContent = invoiceData.invoice_number || '-';
    document.getElementById('invoiceCustomerDisplay').textContent = invoiceData.customers?.customer_custom_id || '-';
    document.getElementById('invoiceCustomerNameDisplay').textContent = invoiceData.customers?.full_name || '-';
    document.getElementById('invoiceShippingDestinationDisplay').textContent = invoiceData.shipping_rates?.country_code || '-';
    document.getElementById('invoiceCbmPriceDisplay').textContent = invoiceData.Price_Per_CBM ? Number(invoiceData.Price_Per_CBM).toFixed(2) : '-';
    // تحديث رابط تصاميم العناصر
    const designsLink = document.getElementById('itemDesignsLink');
    if (designsLink) {
        designsLink.href = `item_designs.html?invoice_id=${currentInvoiceId}`;
    }
    // تحديث رابط عمولات الفاتورة
    const commissionsLink = document.getElementById('itemCommissionsLink');
    if (commissionsLink) {
        commissionsLink.href = `commissions.html?invoice_id=${currentInvoiceId}`;
    }
    // تحديث رابط عرض الفاتورة للعميل جاهزة للطباعة
    const customerInvoiceLink = document.getElementById('customerInvoiceLink');
    if (customerInvoiceLink) {
        customerInvoiceLink.href = `customer_invoice.html?invoice_id=${currentInvoiceId}`;
    }
}

// تحميل عناصر الفاتورة
async function loadInvoiceItems() {
    // جلب البنود وصورها المترابطة في طلب شبكة واحد مدمج (Supabase Join Query)
    const { data, error } = await _supabase.from('invoice_items')
        .select('*, item_photos(*)')
        .eq('invoice_id', currentInvoiceId)
        .order('created_at', { ascending: true });
    if (error) { console.error(error.message); return; }

    const rawItems = data || [];

    // استخراج وتوزيع الصور محلياً في الذاكرة لتكون جاهزة للرسم الفوري دون أي استعلام منفصل
    itemPhotosLookup = {};
    rawItems.forEach(item => {
        if (item.item_photos) {
            const photos = Array.isArray(item.item_photos) ? item.item_photos[0] : item.item_photos;
            if (photos) {
                itemPhotosLookup[item.id] = photos;
            }
        }
    });

    if (sortActiveFirst) {
        const sortedData = [...rawItems].sort((a, b) => {
            const aActive = a.status === true;
            const bActive = b.status === true;
            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;

            return new Date(a.created_at) - new Date(b.created_at);
        });
        invoiceItems = sortedData;
    } else {
        invoiceItems = rawItems;
    }

    renderInvoiceItemsTable();
    updateItemNameField();
}

// --- الوظيفة المطلوبة: حفظ العنصر ---
async function addInvoiceItem(event) {
    event.preventDefault();
    if (!currentInvoiceId) return;
    const submitBtn = document.getElementById("saveInvoiceItemButton");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add("opacity-50", "cursor-not-allowed");
        submitBtn.innerText = "جاري الحفظ...";
    }
    const payload = {
        invoice_id: currentInvoiceId,
        product_id: document.getElementById("invoiceItemProductId").value || null,
        item_name: getNextItemName(),
        size: document.getElementById("itemSize").value,
        specifications: document.getElementById("itemSpecifications").value,
        quantity: parseFloat(document.getElementById("itemQuantity").value) || 0,
        unit_type: document.getElementById("itemUnitType").value || null,
        factory_price_per_unit: parseFloat(document.getElementById("itemFactoryPricePerUnit").value) || 0,
        qty_per_ctn: parseInt(document.getElementById("itemQtyPerCtn").value) || 0,
        gw_per_ctn_kg: parseFloat(document.getElementById("itemGwPerCtnKg").value) || 0,
        length_cm: parseFloat(document.getElementById("itemLengthCm").value) || 0,
        width_cm: parseFloat(document.getElementById("itemWidthCm").value) || 0,
        height_cm: parseFloat(document.getElementById("itemHeightCm").value) || 0,
        sample: document.getElementById("itemSample").value || "",
        production: document.getElementById("itemProduction").value || "",
        CTN: document.getElementById("itemCtn").value ? parseInt(document.getElementById("itemCtn").value) : null,
        place: document.getElementById("itemPlace").value || 1
    };
    try {
        const { data, error } = await _supabase.from("invoice_items").insert([payload]).select("*").single();
        if (error) throw error;
        const newItem = data;
        const itemId = newItem.id;
        const clientPhotoFile = document.getElementById("itemClientPhoto").files[0];
        const designPhotoFile = document.getElementById("itemDesignPhoto").files[0];
        const dielinePhotoFile = document.getElementById("itemDielinePhoto").files[0];
        let photosObj = { client_photo_url: null, design_photo_url: null, dieline_photo_url: null };
        if (clientPhotoFile || designPhotoFile || dielinePhotoFile) {
            const clientPhotoUrl = clientPhotoFile ? await uploadInvoiceItemImageFile(clientPhotoFile) : null;
            const designPhotoUrl = designPhotoFile ? await uploadInvoiceItemImageFile(designPhotoFile) : null;
            const dielinePhotoUrl = dielinePhotoFile ? await uploadInvoiceItemImageFile(dielinePhotoFile) : null;
            photosObj = { client_photo_url: clientPhotoUrl, design_photo_url: designPhotoUrl, dieline_photo_url: dielinePhotoUrl };
            const { data: pData, error: pErr } = await _supabase.from("item_photos").insert([{ item_id: itemId, ...photosObj }]).select("*").single();
            if (pErr) throw pErr;
            if (pData) photosObj = pData;
        }
        itemPhotosLookup[itemId] = photosObj;
        invoiceItems.push(newItem);
        recalculateLocalItemFields(newItem, false);
        renderInvoiceItemsTable();
        updateInvoiceItemsFooter();
        showToast("تم حفظ العنصر والصور بنجاح 🎉", "success");
        document.getElementById("invoiceItemForm").reset();
        document.getElementById("productPreview").classList.add("hidden");
    } catch (err) {
        showToast("حدث خطأ: " + err.message, "error");
    }
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
        submitBtn.innerText = "حفظ المنتج";
    }
}

// فتح مودال التعديل
function editInvoiceItem(itemId) {
    const item = invoiceItems.find(i => i.id === itemId);
    if (!item) return;

    document.getElementById('editInvoiceItemId').value = item.id;
    document.getElementById('editItemSize').value = item.size || '';
    document.getElementById('editItemSpecifications').value = item.specifications || '';
    document.getElementById('editItemQuantity').value = item.quantity || 0;
    document.getElementById('editItemUnitType').value = item.unit_type || '';
    document.getElementById('editItemFactoryPricePerUnit').value = item.factory_price_per_unit || 0;
    document.getElementById('editItemQtyPerCtn').value = item.qty_per_ctn || 0;
    document.getElementById('editItemGwPerCtnKg').value = item.gw_per_ctn_kg || 0;
    document.getElementById('editItemLengthCm').value = item.length_cm || 0;
    document.getElementById('editItemWidthCm').value = item.width_cm || 0;
    document.getElementById('editItemHeightCm').value = item.height_cm || 0;
    document.getElementById('editItemSample').value = item.sample || '';
    document.getElementById('editItemProduction').value = item.production || '';
    document.getElementById('editItemCtn').value = item.CTN !== null && item.CTN !== undefined ? item.CTN : '';
    document.getElementById('editItemPlace').value = item.place || '';

    // عرض الصور الحالية إن وجدت
    const currentPhotos = itemPhotosLookup[item.id] || {};
    const clientPreview = document.getElementById('editClientPhotoPreviewImg');
    const designPreview = document.getElementById('editDesignPhotoPreviewImg');
    const dielinePreview = document.getElementById('editDielinePhotoPreviewImg');

    if (clientPreview && currentPhotos.client_photo_url) {
        clientPreview.src = currentPhotos.client_photo_url;
        document.getElementById('editClientPhotoPreview').classList.remove('hidden');
    } else if (clientPreview) {
        document.getElementById('editClientPhotoPreview').classList.add('hidden');
    }

    if (designPreview && currentPhotos.design_photo_url) {
        designPreview.src = currentPhotos.design_photo_url;
        document.getElementById('editDesignPhotoPreview').classList.remove('hidden');
    } else if (designPreview) {
        document.getElementById('editDesignPhotoPreview').classList.add('hidden');
    }

    if (dielinePreview && currentPhotos.dieline_photo_url) {
        dielinePreview.src = currentPhotos.dieline_photo_url;
        document.getElementById('editDielinePhotoPreview').classList.remove('hidden');
    } else if (dielinePreview) {
        document.getElementById('editDielinePhotoPreview').classList.add('hidden');
    }

    document.getElementById('editInvoiceItemModal').classList.remove('hidden');
}

// حفظ التعديلات
async function updateInvoiceItem(event) {
    event.preventDefault();
    const submitBtn = document.getElementById("updateInvoiceItemButton");

    try {
        const itemId = document.getElementById("editInvoiceItemId").value;
        if (!itemId) { showToast("معرف العنصر غير موجود", "error"); return; }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add("opacity-75", "cursor-not-allowed");
            submitBtn.innerHTML = "<svg class='animate-spin h-5 w-5 text-white inline-block ml-2' fill='none' viewBox='0 0 24 24'><circle class='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' stroke-width='4'></circle><path class='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path></svg> جاري الحفظ...";
        }

        const payload = {
            size: (document.getElementById("editItemSize") || {}).value || "",
            specifications: (document.getElementById("editItemSpecifications") || {}).value || "",
            quantity: parseFloat((document.getElementById("editItemQuantity") || {}).value) || 0,
            unit_type: (document.getElementById("editItemUnitType") || {}).value || null,
            factory_price_per_unit: parseFloat((document.getElementById("editItemFactoryPricePerUnit") || {}).value) || 0,
            qty_per_ctn: parseInt((document.getElementById("editItemQtyPerCtn") || {}).value) || 0,
            gw_per_ctn_kg: parseFloat((document.getElementById("editItemGwPerCtnKg") || {}).value) || 0,
            length_cm: parseFloat((document.getElementById("editItemLengthCm") || {}).value) || 0,
            width_cm: parseFloat((document.getElementById("editItemWidthCm") || {}).value) || 0,
            height_cm: parseFloat((document.getElementById("editItemHeightCm") || {}).value) || 0,
            sample: (document.getElementById("editItemSample") || {}).value || "",
            production: (document.getElementById("editItemProduction") || {}).value || "",
            CTN: (document.getElementById("editItemCtn") || {}).value ? parseInt((document.getElementById("editItemCtn") || {}).value) : null,
            place: (document.getElementById("editItemPlace") || {}).value || ""
        };

        const { error } = await _supabase.from("invoice_items").update(payload).eq("id", itemId);
        if (error) throw error;

        const clientPhotoFile = (document.getElementById("editItemClientPhoto") || {}).files?.[0];
        const designPhotoFile = (document.getElementById("editItemDesignPhoto") || {}).files?.[0];
        const dielinePhotoFile = (document.getElementById("editItemDielinePhoto") || {}).files?.[0];

        if (clientPhotoFile || designPhotoFile || dielinePhotoFile) {
            const existingPhotos = itemPhotosLookup[itemId] || {};
            const photosPayload = { item_id: itemId };

            photosPayload.client_photo_url = clientPhotoFile
                ? await uploadInvoiceItemImageFile(clientPhotoFile)
                : (existingPhotos.client_photo_url || null);

            photosPayload.design_photo_url = designPhotoFile
                ? await uploadInvoiceItemImageFile(designPhotoFile)
                : (existingPhotos.design_photo_url || null);

            photosPayload.dieline_photo_url = dielinePhotoFile
                ? await uploadInvoiceItemImageFile(dielinePhotoFile)
                : (existingPhotos.dieline_photo_url || null);

            if (existingPhotos.id) {
                const { data: updatedPhoto, error: photosError } = await _supabase.from("item_photos").update(photosPayload).eq("id", existingPhotos.id).select("*").single();
                if (photosError) throw photosError;
                if (updatedPhoto) {
                    itemPhotosLookup[itemId] = updatedPhoto;
                }
            } else {
                const { data: insertedPhoto, error: photosError } = await _supabase.from("item_photos").insert([photosPayload]).select("*").single();
                if (photosError) throw photosError;
                if (insertedPhoto) {
                    itemPhotosLookup[itemId] = insertedPhoto;
                }
            }
        }

        // تحديث البيانات محلياً في مصفوفة الذاكرة
        const item = invoiceItems.find(i => i.id === itemId);
        if (item) {
            Object.assign(item, payload);
            recalculateLocalItemFields(item, false);
            rebuildInvoiceItemRow(itemId);
            updateInvoiceItemsFooter();
        }

        showToast("تم تحديث العنصر بنجاح 🎉", "success");
        closeEditModal();
        await loadInvoiceDetails();
    } catch (err) {
        showToast("حدث خطأ: " + err.message, "error");
        console.error(err);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove("opacity-75", "opacity-50", "cursor-not-allowed");
            submitBtn.innerHTML = "حفظ التعديلات";
        }
    }
}

// معاينة الصور في مودال التعديل
function handleEditClientPhotoChange(event) {
    const file = event.target.files?.[0];
    const preview = document.getElementById('editClientPhotoPreview');
    const previewImg = document.getElementById('editClientPhotoPreviewImg');
    if (!preview || !previewImg) return;
    if (!file) { preview.classList.add('hidden'); previewImg.src = ''; return; }
    previewImg.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
}

function handleEditDesignPhotoChange(event) {
    const file = event.target.files?.[0];
    const preview = document.getElementById('editDesignPhotoPreview');
    const previewImg = document.getElementById('editDesignPhotoPreviewImg');
    if (!preview || !previewImg) return;
    if (!file) { preview.classList.add('hidden'); previewImg.src = ''; return; }
    previewImg.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
}

function handleEditDielinePhotoChange(event) {
    const file = event.target.files?.[0];
    const preview = document.getElementById('editDielinePhotoPreview');
    const previewImg = document.getElementById('editDielinePhotoPreviewImg');
    if (!preview || !previewImg) return;
    if (!file) { preview.classList.add('hidden'); previewImg.src = ''; return; }
    previewImg.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
}

// إغلاق مودال التعديل
function closeEditModal() {
    document.getElementById('editInvoiceItemModal').classList.add('hidden');
    // إعادة تعيين حقول الصور
    ['editItemClientPhoto', 'editItemDesignPhoto', 'editItemDielinePhoto'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
    ['editClientPhotoPreview', 'editDesignPhotoPreview', 'editDielinePhotoPreview'].forEach(id => {
        const div = document.getElementById(id);
        if (div) div.classList.add('hidden');
    });
}

// حذف عنصر
async function deleteInvoiceItem(itemId) {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا البند نهائياً؟')) return;

    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 right-4 bg-[#C00000] text-white px-6 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-3 animate-bounce';
    notification.innerHTML = '<svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> جاري حذف البند وإعادة ترتيب العناصر...';
    document.body.appendChild(notification);

    const oldInvoiceItems = [...invoiceItems];
    const oldPhotos = { ...itemPhotosLookup };

    invoiceItems = invoiceItems.filter(item => item.id !== itemId);
    delete itemPhotosLookup[itemId];

    await reorderInvoiceItems();

    try {
        const { error } = await _supabase.from('invoice_items').delete().eq('id', itemId);
        if (error) throw error;

        notification.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-2';
        notification.innerHTML = '🎉 تم حذف البند وإعادة ترتيب بقية العناصر بنجاح!';
        setTimeout(() => notification.remove(), 2500);
    } catch (err) {
        console.error(err.message);
        invoiceItems = oldInvoiceItems;
        itemPhotosLookup = oldPhotos;
        renderInvoiceItemsTable();
        updateInvoiceItemsFooter();

        notification.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-2';
        notification.innerHTML = '❌ فشل الحذف: ' + err.message;
        setTimeout(() => notification.remove(), 4000);
    }
}

// تستقبل المتغير (imageUrl) وهو يمثل رابط الصورة التي ضغط عليها المستخدم.
function openImageModal(imageUrl) {
    // نبحث عن نافذة التكبير في HTML باستخدام الـ ID الخاص بها.
    const modal = document.getElementById('imagePreviewModal');
    // نبحث عن وسم <img id="modalPreviewImage"> بداخل النافذة لنضع فيه رابط الصورة.
    const modalImg = document.getElementById('modalPreviewImage');

    // حماية: إذا لم تكن العناصر موجودة في الصفحة، نوقف التنفيذ لمنع ظهور أخطاء.
    if (!modal || !modalImg) return;

    // نضع رابط الصورة الممرر للدالة داخل الوسم لكي تظهر الصورة.
    modalImg.src = imageUrl;
    // نزيل كلاس 'hidden' (الذي كان يخفي النافذة) لكي تظهر للمستخدم وتغطي الشاشة.
    modal.classList.remove('hidden');
}

// 2. دالة إغلاق الصورة: 
// يتم تشغيلها عند الضغط على زر (X).
function closeImageModal() {
    const modal = document.getElementById('imagePreviewModal');
    const modalImg = document.getElementById('modalPreviewImage');
    if (!modal || !modalImg) return;

    // نمسح الرابط من الصورة لتخفيف استهلاك الذاكرة للمتصفح.
    modalImg.src = '';
    // نضيف كلاس 'hidden' مرة أخرى لتعود النافذة لحالة الإخفاء.
    modal.classList.add('hidden');
}

// ==========================================
// وظائف النافذة المنبثقة لعرض بيانات المنتج:
// ==========================================

// دالة لجلب بيانات المنتج من المصفوفة المحملة وعرضها في النافذة المخصصة
function openProductDetailsModal(productId) {
    const product = getProductById(productId);
    if (!product) return;

    // تعبئة البيانات في واجهة النافذة
    const imgEl = document.getElementById('modalProductImage');
    if (imgEl) {
        imgEl.src = product.product_image_url || '';
        imgEl.style.display = product.product_image_url ? 'block' : 'none';
    }

    document.getElementById('modalProductName').textContent = product.product_name || '-';
    document.getElementById('modalProductId').textContent = product.product_custom_id || '-';
    document.getElementById('modalProductSpecs').textContent = product.specifications || '-';
    document.getElementById('modalProductSample').textContent = product.sample_details || '-';
    document.getElementById('modalProductMoq').textContent = product.moq_of_product || '-';
    document.getElementById('modalProductDays').textContent = product.days_of_manufacturing || '-';

    document.getElementById('productDetailsModal').classList.remove('hidden');
}

function closeProductDetailsModal() {
    document.getElementById('productDetailsModal').classList.add('hidden');
}

// تشغيل عند التحميل
function initInvoiceItemsPage() {
    const params = new URLSearchParams(window.location.search);
    currentInvoiceId = params.get('invoice_id');

    if (!currentInvoiceId) {
        showToast('خطأ: معرف الفاتورة غير محدد!', 'error');
        setTimeout(() => { window.location.href = 'invoices.html'; }, 1500);
        return;
    }

    // ربط الأحداث
    const invoiceItemProductId = document.getElementById('invoiceItemProductId');
    if (invoiceItemProductId) invoiceItemProductId.addEventListener('change', updateProductPreview);

    const invoiceItemForm = document.getElementById('invoiceItemForm');
    if (invoiceItemForm) invoiceItemForm.addEventListener('submit', addInvoiceItem);

    const editInvoiceItemForm = document.getElementById('editInvoiceItemForm');
    if (editInvoiceItemForm) editInvoiceItemForm.addEventListener('submit', updateInvoiceItem);

    const editClientPhoto = document.getElementById('editItemClientPhoto');
    if (editClientPhoto) editClientPhoto.addEventListener('change', handleEditClientPhotoChange);
    const editDesignPhoto = document.getElementById('editItemDesignPhoto');
    if (editDesignPhoto) editDesignPhoto.addEventListener('change', handleEditDesignPhotoChange);
    const editDielinePhoto = document.getElementById('editItemDielinePhoto');
    if (editDielinePhoto) editDielinePhoto.addEventListener('change', handleEditDielinePhotoChange);



    loadInvoiceDetails();
    loadProductsLookup();
    loadInvoiceItems();
}

window.addEventListener('DOMContentLoaded', initInvoiceItemsPage);

// دالة إعادة الحساب محلياً وتحديث المتغيرات فوراً (Optimistic UI updates)
function recalculateLocalItemFields(item, keepCtn = false, fieldName = '') {
    // 1. حساب عدد الكراتين (CTN)
    if (!keepCtn) {
        if (item.quantity && item.qty_per_ctn) {
            item.CTN = Math.ceil(item.quantity / item.qty_per_ctn);
        } else {
            item.CTN = null;
        }
    }

    // 2. حساب حجم الكرتون CBM
    let cbmPerCtn = null;
    if (item.length_cm && item.width_cm && item.height_cm) {
        cbmPerCtn = (Number(item.length_cm) / 100) * (Number(item.width_cm) / 100) * (Number(item.height_cm) / 100);
    }

    // 3. حساب إجمالي الحجم Total CBM
    const ctnVal = item.CTN !== null && item.CTN !== undefined ? item.CTN : 0;
    if (cbmPerCtn !== null && ctnVal > 0) {
        item.total_cbm = Number((cbmPerCtn * ctnVal).toFixed(4));
    } else {
        item.total_cbm = null;
    }

    // 4. حساب تكلفة الشحن الإجمالية و شحن القطعة
    if (fieldName === 'shipping_price_per_unit') {
        item.total_shipping_cost = Number(((item.shipping_price_per_unit || 0) * (item.quantity || 0)).toFixed(2));
    } else {
        if (item.total_cbm !== null && currentShippingRatePerCbm) {
            item.total_shipping_cost = Number((item.total_cbm * currentShippingRatePerCbm).toFixed(2));
        } else {
            item.total_shipping_cost = 0;
        }

        // 5. حساب تكلفة شحن القطعة الواحدة Shipping Price per Unit
        if (item.total_shipping_cost && item.quantity) {
            item.shipping_price_per_unit = Number((item.total_shipping_cost / item.quantity).toFixed(4));
        } else {
            item.shipping_price_per_unit = 0;
        }
    }
}

// تحديث حقل فردي لعنصر الفاتورة مباشرة من الجدول (Inline Editing)
async function updateInvoiceItemFieldInline(itemId, fieldName, element) {
    const item = invoiceItems.find(i => i.id === itemId);
    if (!item) return;

    let rawValue = element.textContent.trim();
    let parsedValue = rawValue;

    // الحقول الرقمية
    const numericFields = ['quantity', 'factory_price_per_unit', 'qty_per_ctn', 'gw_per_ctn_kg', 'length_cm', 'width_cm', 'height_cm', 'CTN', 'shipping_price_per_unit'];
    if (numericFields.includes(fieldName)) {
        // إزالة الفواصل والمسافات غير المرئية بما فيها المسافات غير القابلة للكسر (non-breaking spaces)
        rawValue = rawValue.replace(/[\s\u00a0,]/g, '');
        if (rawValue === '') {
            parsedValue = 0;
        } else {
            parsedValue = parseFloat(rawValue);
            if (isNaN(parsedValue)) {
                showToast('⚠️ يرجى إدخال قيمة رقمية صالحة!', 'error');
                element.textContent = item[fieldName] !== null ? item[fieldName] : '0';
                return;
            }
        }
    }

    // حقل الحالة المنطقية
    if (fieldName === 'status') {
        const norm = rawValue.trim();
        parsedValue = (norm === 'نشط' || norm === 'true' || norm === '1' || norm === 'active');
    }

    // إذا لم تتغير القيمة، لا داعي لتحديث قاعدة البيانات
    if (item[fieldName] === parsedValue) {
        return;
    }

    // حفظ القيم القديمة للتراجع عند الضرورة
    const oldItemState = { ...item };

    // ----------------------------------------------------
    // التحديث التفاؤلي الفوري (Optimistic Update)
    // ----------------------------------------------------
    // 1. تحديث الحقل محلياً فوراً
    item[fieldName] = parsedValue;

    // 2. إعادة حساب الحقول الحسابية التابعة محلياً فوراً
    const keepManualCtn = (fieldName === 'CTN');
    recalculateLocalItemFields(item, keepManualCtn, fieldName);

    // 3. تحديث الخلية المعدلة والحقول المرتبطة بها فقط (Targeted DOM Update)
    updateInvoiceItemRowTargeted(itemId);
    updateInvoiceItemsFooter();

    // 4. حفظ التعديل في الخلفية بطلب واحد إلى Supabase
    let updatePayload = { [fieldName]: parsedValue };
    if (fieldName === 'quantity' || fieldName === 'qty_per_ctn') {
        updatePayload["CTN"] = item.CTN;
    }
    if (fieldName === 'shipping_price_per_unit') {
        updatePayload["total_shipping_cost"] = item.total_shipping_cost;
    }

    // إضاءة الخلية المعدلة محلياً في الجدول لإعطاء تلميح بصري لطيف بالحفظ
    const updatedCell = element;
    if (updatedCell) {
        updatedCell.classList.add('bg-yellow-50');
    }

    try {
        const { error } = await _supabase
            .from('invoice_items')
            .update(updatePayload)
            .eq('id', itemId);

        if (error) throw error;

        // إضاءة باللون الأخضر الهادئ للدلالة على نجاح الحفظ في الخلفية
        if (updatedCell) {
            updatedCell.classList.remove('bg-yellow-50');
            updatedCell.classList.add('bg-green-50');
            setTimeout(() => {
                updatedCell.classList.remove('bg-green-50');
            }, 800);
        }

    } catch (err) {
        console.error('خطأ في التحديث التلقائي الخلفي:', err.message);
        showToast('❌ فشل حفظ التعديل في قاعدة البيانات: ' + err.message, 'error');

        // استعادة الحالة القديمة بالكامل وإعادة الرسم للتراجع عن الخطأ
        Object.assign(item, oldItemState);
        updateInvoiceItemRowTargeted(itemId);
        updateInvoiceItemsFooter();
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

// تفريغ الخلية تلقائياً إذا كانت تحتوي على "0" عند التركيز لتسهيل الكتابة الفورية دون مسح
function handleEditableCellFocus(element) {
    const text = element.textContent.trim().replace(/[\u00a0\s]/g, '');
    if (text === '0' || text === '0.00' || text === '0.0') {
        element.textContent = '';
    }
}

// ==========================================
// وظائف مودال خيارات الصور المتقدمة (View / Upload):
// ==========================================

let activePhotoItemId = null;
let activePhotoType = null;
let activePhotoUrl = null;

function openPhotoActionsModal(itemId, photoType, currentPhotoUrl) {
    activePhotoItemId = itemId;
    activePhotoType = photoType;
    activePhotoUrl = currentPhotoUrl;

    const modal = document.getElementById('photoActionsModal');
    const title = document.getElementById('photoActionsTitle');
    const viewBtn = document.getElementById('viewPhotoActionBtn');

    if (!modal || !title || !viewBtn) return;

    // تحديد عنوان المودال حسب نوع العمود
    let typeName = 'الصورة';
    if (photoType === 'client_photo_url') typeName = 'صورة العميل';
    else if (photoType === 'design_photo_url') typeName = 'صورة التصميم';
    else if (photoType === 'dieline_photo_url') typeName = 'صورة الديلاين';

    title.textContent = `خيارات ${typeName}`;

    // إعداد زر العرض
    if (currentPhotoUrl) {
        viewBtn.disabled = false;
        viewBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-100', 'border-gray-200');
        viewBtn.classList.add('bg-blue-50', 'border-blue-100', 'hover:bg-blue-100', 'text-blue-900');
    } else {
        viewBtn.disabled = true;
        viewBtn.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-100', 'border-gray-200');
        viewBtn.classList.remove('bg-blue-50', 'border-blue-100', 'hover:bg-blue-100', 'text-blue-900');
    }

    // عرض المودال
    modal.classList.remove('hidden');
}

function closePhotoActionsModal() {
    const modal = document.getElementById('photoActionsModal');
    if (modal) modal.classList.add('hidden');
}

// ربط أزرار المودال بالأحداث
document.addEventListener('DOMContentLoaded', () => {
    const viewBtn = document.getElementById('viewPhotoActionBtn');
    const uploadBtn = document.getElementById('uploadPhotoActionBtn');
    const fileInput = document.getElementById('hiddenPhotoSelectorInput');

    if (viewBtn) {
        viewBtn.addEventListener('click', () => {
            if (activePhotoUrl) {
                openImageModal(activePhotoUrl);
                closePhotoActionsModal();
            }
        });
    }

    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            if (fileInput) {
                fileInput.click();
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // إغلاق مودال الخيارات فوراً
            closePhotoActionsModal();

            // 0. تجميد واستنساخ المعرفات الحالية فوراً في ثوابت محلية لتفعيل ميزة الرفع المتوازي المتعدد
            // وبدون هذا، فإن رفع صورة ثانية سيقوم بمسح بيانات الصورة الأولى من الذاكرة بسبب استخدام متغيرات عامة (Global Variables)
            const targetItemId = activePhotoItemId;
            const targetPhotoType = activePhotoType;

            if (!targetItemId || !targetPhotoType) return;

            const trackerKey = `${targetItemId}_${targetPhotoType}`;
            const oldPhotoUrl = itemPhotosLookup[targetItemId]?.[targetPhotoType] || null;

            // 1. إنشاء رابط محلي مؤقت فوري لعرض الصورة فوراً دون أي انتظار
            const tempLocalUrl = URL.createObjectURL(file);

            // 2. تحديث الذاكرة المحلية فوراً (تحديث تفاؤلي)
            if (!itemPhotosLookup[targetItemId]) {
                itemPhotosLookup[targetItemId] = {};
            }
            itemPhotosLookup[targetItemId][targetPhotoType] = tempLocalUrl;

            // 3. وضع علامة جاري الرفع لتفعيل مؤشر التحميل الدوار فوق الصورة في الجدول
            uploadingPhotosTracker[trackerKey] = true;

            // 4. إعادة بناء صف العنصر فقط فوراً بدلاً من كامل الجدول
            rebuildInvoiceItemRow(targetItemId);

            // تحديد اسم البند ونوع الصورة لإظهاره في التنبيه المتعدد
            let typeName = 'الصورة';
            if (targetPhotoType === 'client_photo_url') typeName = 'صورة العميل';
            else if (targetPhotoType === 'design_photo_url') typeName = 'صورة التصميم';
            else if (targetPhotoType === 'dieline_photo_url') typeName = 'صورة الديلاين';

            // إطلاق إشعار ذكي مخصص للرفع المتعدد
            const toast = showToast(`
                <svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                جاري ضغط ورفع ${typeName}...
            `);

            try {
                // 5. ضغط الصورة تلقائياً لتسريع عملية الرفع بـ 10 أضعاف
                const compressedFile = await compressImageIfNeeded(file);

                // 6. رفع الصورة إلى Supabase Storage في الخلفية
                const uploadedUrl = await uploadInvoiceItemImageFile(compressedFile);
                if (!uploadedUrl) throw new Error('فشل الحصول على رابط الصورة المرفوعة');

                // 7. تحديث أو إدخال الصورة في قاعدة البيانات (جدول item_photos)
                const existingPhotos = itemPhotosLookup[targetItemId] || {};
                const photosPayload = {
                    item_id: targetItemId,
                    [targetPhotoType]: uploadedUrl
                };

                let dbError = null;
                // فحص إذا كان السجل موجود في جدول item_photos
                if (existingPhotos.id && existingPhotos.id !== tempLocalUrl) {
                    const { error } = await _supabase
                        .from('item_photos')
                        .update({ [targetPhotoType]: uploadedUrl })
                        .eq('id', existingPhotos.id);
                    dbError = error;
                } else {
                    const { error } = await _supabase
                        .from('item_photos')
                        .insert([photosPayload]);
                    dbError = error;
                }

                if (dbError) throw dbError;

                // 8. تحديث الذاكرة المحلية بالرابط السحابي الدائم وإزالة علامة الرفع
                itemPhotosLookup[targetItemId][targetPhotoType] = uploadedUrl;
                delete uploadingPhotosTracker[trackerKey];

                if (!existingPhotos.id) {
                    // لإشعار التطبيق بوجود سجل الآن، نقوم بإعادة الجلب من قاعدة البيانات لضمان دقة الـ IDs
                    const itemIds = invoiceItems.map(item => item.id).filter(Boolean);
                    await loadItemPhotosForInvoiceItems(itemIds);
                }

                // 9. إعادة بناء صف العنصر فقط لإخفاء علامة التحميل وتثبيت الصورة النهائية
                rebuildInvoiceItemRow(targetItemId);

                // تحديث التنبيه للنجاح
                toast.update(`🎉 تم رفع وحفظ ${typeName} بنجاح!`, 'success');
                setTimeout(() => toast.remove(), 2500);

            } catch (err) {
                console.error('خطأ أثناء رفع وحفظ الصورة:', err.message);

                // التراجع الآمن عن الصورة المؤقتة وإعادة القيمة الأصلية عند الفشل
                if (oldPhotoUrl) {
                    itemPhotosLookup[targetItemId][targetPhotoType] = oldPhotoUrl;
                } else {
                    delete itemPhotosLookup[targetItemId][targetPhotoType];
                }
                delete uploadingPhotosTracker[trackerKey];

                // إعادة بناء صف العنصر فقط لإزالة الصورة المؤقتة الفاشلة واللودر
                rebuildInvoiceItemRow(targetItemId);

                // تحديث التنبيه للفشل
                toast.update(`❌ فشل حفظ ${typeName}: ${err.message}`, 'error');
                setTimeout(() => toast.remove(), 4000);
            } finally {
                // إعادة تعيين قيمة مدخل الملف للسماح باختيار نفس الصورة مجدداً
                fileInput.value = '';
            }
        });
    }
});

// ==========================================
// وظائف مودال اختيار وتغيير المنتج الفاخر:
// ==========================================

let activeProductSelectorItemId = null;

function openProductSelectorModal(itemId) {
    activeProductSelectorItemId = itemId;
    const searchInput = document.getElementById('productSelectorSearchInput');
    if (searchInput) searchInput.value = '';

    renderSelectorProducts('');

    const modal = document.getElementById('productSelectorModal');
    if (modal) modal.classList.remove('hidden');
}

function closeProductSelectorModal() {
    const modal = document.getElementById('productSelectorModal');
    if (modal) modal.classList.add('hidden');
}

function renderSelectorProducts(filterText = '') {
    const grid = document.getElementById('productSelectorGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const normalizedFilter = (filterText || '').trim().toLowerCase();

    // تصفية المنتجات حسب نص البحث
    const filteredProducts = productsLookup.filter(product => {
        if (!normalizedFilter) return true;
        const customId = (product.product_custom_id || '').toLowerCase();
        const name = (product.product_name || '').toLowerCase();
        return customId.includes(normalizedFilter) || name.includes(normalizedFilter);
    });

    if (filteredProducts.length === 0) {
        grid.innerHTML = '<div class="text-center p-8 text-gray-500 font-medium">لا توجد منتجات مطابقة للبحث.</div>';
        return;
    }

    filteredProducts.forEach(product => {
        const card = document.createElement('div');
        card.className = 'flex flex-col sm:flex-row items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-white hover:border-blue-100 hover:shadow-md transition-all duration-200 gap-4';

        // الصورة أو بديل لها
        const imgHtml = product.product_image_url
            ? `<img src="${product.product_image_url}" alt="Product" class="w-16 h-16 object-cover rounded-lg border border-gray-200">`
            : `<div class="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 font-bold text-xs select-none">لا توجد صورة</div>`;

        card.innerHTML = `
            <div class="flex items-center gap-4 w-full sm:w-auto">
                ${imgHtml}
                <div class="text-right space-y-1">
                    <div class="flex items-center gap-2">
                        <span class="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">${product.product_custom_id || product.id}</span>
                        <h4 class="font-bold text-gray-800 text-sm sm:text-base">${product.product_name || 'بدون اسم'}</h4>
                    </div>
                    <p class="text-xs text-gray-500 line-clamp-2 max-w-md">${product.specifications || 'لا توجد مواصفات فنية'}</p>
                    <div class="flex items-center gap-3 text-[11px] text-gray-400">
                        <span>الحد الأدنى للطلب (MOQ): <strong class="text-gray-700">${product.moq_of_product || '-'}</strong></span>
                        <span>•</span>
                        <span>أيام التصنيع: <strong class="text-gray-700">${product.days_of_manufacturing || '-'}</strong></span>
                    </div>
                </div>
            </div>
            
            <button type="button" onclick="selectProductForInvoiceItem('${product.id}')" class="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded-xl transition duration-150 shadow-sm text-sm whitespace-nowrap">
                ربط بالبند
            </button>
        `;
        grid.appendChild(card);
    });
}

function filterSelectorProducts() {
    const input = document.getElementById('productSelectorSearchInput');
    renderSelectorProducts(input ? input.value : '');
}

async function selectProductForInvoiceItem(productId) {
    if (!activeProductSelectorItemId) return;

    // إغلاق مودال اختيار المنتجات
    closeProductSelectorModal();

    // إيجاد البند والمنتج لتحديث الذاكرة المحلية والواجهة فوراً (تحديث تفاؤلي)
    const itemIndex = invoiceItems.findIndex(i => i.id === activeProductSelectorItemId);
    if (itemIndex === -1) return;

    const oldProductId = invoiceItems[itemIndex].product_id;

    // 1. تحديث تفاؤلي محلي فوري
    invoiceItems[itemIndex].product_id = productId;

    // 2. إعادة بناء صف العنصر فقط بلحظتها (يتغير رمز المنتج وصورة المنتج فوراً في 1 مللي ثانية!)
    rebuildInvoiceItemRow(activeProductSelectorItemId);

    // إشعار بصري للمستخدم في الأسفل ببدء الحفظ
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-3 animate-bounce';
    notification.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        جاري تحديث وربط المنتج بالبند...
    `;
    document.body.appendChild(notification);

    try {
        // 3. تحديث السجل في قاعدة البيانات (Supabase)
        const { error } = await _supabase
            .from('invoice_items')
            .update({ product_id: productId })
            .eq('id', activeProductSelectorItemId);

        if (error) throw error;

        // 4. نجاح العملية
        notification.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-2';
        notification.innerHTML = '🎉 تم ربط وتحديث منتج البند بنجاح!';
        setTimeout(() => notification.remove(), 3000);

    } catch (err) {
        console.error('خطأ أثناء ربط المنتج:', err.message);

        // التراجع الآمن عند الفشل وإعادة بناء الصف لحالته السابقة
        invoiceItems[itemIndex].product_id = oldProductId;
        rebuildInvoiceItemRow(activeProductSelectorItemId);

        notification.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-2';
        notification.innerHTML = '❌ فشل ربط المنتج: ' + err.message;
        setTimeout(() => notification.remove(), 4000);
    }
}

async function toggleInvoiceItemStatus(itemId, currentStatus) {
    const newStatus = !currentStatus;

    const itemIndex = invoiceItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const oldStatus = invoiceItems[itemIndex].status;
    const oldItemName = invoiceItems[itemIndex].item_name;

    // 1. تغيير الحالة في الذاكرة اولا
    invoiceItems[itemIndex].status = newStatus;

    // 2. فرز المصفوفة حسب created_at لاعادة كل عنصر الى مكانه الاصلي
    //    وعند التنشيط: النشط يرجع لتاريخه الاصلي بين بقية النشطة
    //    وعند الغاء التنشيط: يبقى مكانه التاريخي دون نقله للاسفل
    if (newStatus === true) {
        // عند التنشيط: فرز النشط اولا حسب created_at ثم غير النشط حسب created_at
        invoiceItems = [...invoiceItems].sort((a, b) => {
            const aActive = a.status === true;
            const bActive = b.status === true;
            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;
            return new Date(a.created_at) - new Date(b.created_at);
        });
        sortActiveFirst = true;
    } else {
        // عند الغاء التنشيط: ارجاع الجميع الى ترتيبهم التاريخي (بدون نقل غير النشط للاسفل)
        invoiceItems = [...invoiceItems].sort((a, b) => {
            return new Date(a.created_at) - new Date(b.created_at);
        });
        sortActiveFirst = false;
    }

    // 3. بعد الفرز: اعادة تسمية البنود النشطة بترتيبها الصحيح في المصفوفة المرتبة
    const dbUpdates = [];
    dbUpdates.push({ id: itemId, payload: { status: newStatus } });

    invoiceItems.filter(item => item.status === true).forEach((item, index) => {
        const expectedName = "Item " + (index + 1);
        if (item.item_name !== expectedName) {
            item.item_name = expectedName;
            dbUpdates.push({ id: item.id, payload: { item_name: expectedName } });
        }
    });

    renderInvoiceItemsTable();
    updateInvoiceItemsFooter();

    const notification = document.createElement("div");
    notification.className = "fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-3 animate-bounce";
    notification.innerHTML = "جاري تحديث حالة البند وإعادة ترقيم العناصر النشطة...";
    document.body.appendChild(notification);

    try {
        await Promise.all(dbUpdates.map(upd =>
            _supabase.from("invoice_items")
                .update(upd.payload)
                .eq("id", upd.id)
        ));

        notification.className = "fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-2";
        notification.innerHTML = "🎉 تم تحديث حالة البند وإعادة ترتيب النشط بنجاح!";
        setTimeout(() => notification.remove(), 2500);

    } catch (err) {
        console.error(err.message);

        invoiceItems[itemIndex].status = oldStatus;
        invoiceItems[itemIndex].item_name = oldItemName;

        renderInvoiceItemsTable();
        updateInvoiceItemsFooter();

        notification.className = "fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-2";
        notification.innerHTML = "❌ فشل التحديث: " + err.message;
        setTimeout(() => notification.remove(), 4000);
    }
}

async function addNewBlankInvoiceItem() {
    if (!currentInvoiceId) {
        showToast('⚠️ حدث خطأ: لا يوجد معرف فاتورة نشط!', 'error');
        return;
    }

    // 1. حساب رقم ومسمى البند القادم تلقائياً
    const nextItemName = getNextItemName();

    // 2. إعداد الكائن (البند الفارغ الجديد)
    // تم وضع 1 كقيمة افتراضية في الكمية والكرتونة لتفادي أي أخطاء قسمة على صفر في قواعد البيانات القديمة
    const payload = {
        invoice_id: currentInvoiceId,
        item_name: nextItemName,
        quantity: 1,
        factory_price_per_unit: 0,
        qty_per_ctn: 1,
        CTN: 1,
        gw_per_ctn_kg: 0,
        length_cm: 0,
        width_cm: 0,
        height_cm: 0,
        status: true,
        place: '1'
    };

    // إشعار فوري للمستخدم ببدء الإضافة
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-3 animate-bounce';
    notification.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        جاري إضافة سطر بند فارغ جديد...
    `;
    document.body.appendChild(notification);

    try {
        // 3. الحفظ في قاعدة بيانات Supabase
        const { data, error } = await _supabase
            .from('invoice_items')
            .insert([payload])
            .select('*')
            .single();

        if (error) throw error;

        // 4. إضافة البند الجديد محلياً وتحديث الجدول فوراً
        if (data) {
            invoiceItems.push(data);

            // تهيئة لوك أب الصور للبند الجديد ليكون فارغاً مسبقاً
            itemPhotosLookup[data.id] = {
                client_photo_url: null,
                design_photo_url: null,
                dieline_photo_url: null
            };
        }

        renderInvoiceItemsTable();

        notification.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-2';
        notification.innerHTML = `🎉 تم إضافة سطر بند فارغ جديد (${nextItemName}) بنجاح!`;
        setTimeout(() => notification.remove(), 3000);

    } catch (err) {
        console.error('خطأ أثناء إضافة البند الفارغ:', err.message);
        notification.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-2';
        notification.innerHTML = '❌ فشل إضافة البند: ' + err.message;
        setTimeout(() => notification.remove(), 4000);
    }
}

function toggleActiveItemsFilter() {
    showOnlyActive = !showOnlyActive;
    const btn = document.getElementById('toggleActiveFilterBtn');
    const text = document.getElementById('filterBtnText');

    if (!btn || !text) return;

    if (showOnlyActive) {
        // تصميم نشط وأخضر جذاب
        btn.className = "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 hover:text-green-800 transition-all duration-200 shadow-sm active:scale-95 select-none";
        text.textContent = "عرض كافة العناصر";
    } else {
        // تصميم افتراضي أبيض أنيق
        btn.className = "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200 shadow-sm active:scale-95 select-none";
        text.textContent = "عرض العناصر النشطة فقط";
    }

    renderInvoiceItemsTable();
}

// ==========================================
// وظائف مودال إضافة منتج جديد فاخر
// ==========================================

async function openAddProductModal() {
    // 1. تصفير النموذج
    const form = document.getElementById('newProductForm');
    if (form) form.reset();

    // 2. تحميل الأنواع من قاعدة البيانات وتعبئة المنسدلة
    const typeSelect = document.getElementById('newProductTypeId');
    if (typeSelect) {
        typeSelect.innerHTML = '<option value="">اختر نوع المنتج...</option>';
        try {
            const { data, error } = await _supabase.from('product_types').select('*').order('created_at', { ascending: false });
            if (!error && data) {
                data.forEach(type => {
                    const opt = document.createElement('option');
                    opt.value = type.id;
                    opt.textContent = type.category_name;
                    typeSelect.appendChild(opt);
                });
            }
        } catch (e) {
            console.error('Error fetching product types in modal:', e);
        }
    }

    // 3. إظهار المودال
    const modal = document.getElementById('addProductModal');
    if (modal) modal.classList.remove('hidden');
}

function closeAddProductModal() {
    const modal = document.getElementById('addProductModal');
    if (modal) modal.classList.add('hidden');
}

// ضغط الصورة تلقائياً لتقليل الحجم وتسريع الرفع بمعدل 10 أضعاف للمنتج الجديد
async function compressProductImageIfNeeded(file) {
    if (!file || !file.type.startsWith('image/') || file.type.includes('svg')) {
        return file;
    }
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
                const MAX_SIZE = 1200;
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
                }, 'image/jpeg', 0.8);
            };
            img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
    });
}

// رفع ميديا المنتجات (صورة / فيديو)
async function uploadProductMediaFile(file) {
    if (!file) return null;
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
    const filePath = `products/${fileName}`;
    const { error } = await _supabase.storage.from('product-images').upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
    });
    if (error) {
        throw new Error(`Upload error: ${error.message || error.details || JSON.stringify(error)}`);
    }
    const { data: publicData, error: publicError } = _supabase.storage.from('product-images').getPublicUrl(filePath);
    if (publicError) {
        throw new Error(`Public URL error: ${publicError.message || publicError.details || JSON.stringify(publicError)}`);
    }
    return publicData?.publicUrl || null;
}

async function submitAddProduct(event) {
    event.preventDefault();

    const name = document.getElementById('newProductName').value.trim();
    const typeId = document.getElementById('newProductTypeId').value || null;
    const specs = document.getElementById('newProductSpecs').value.trim();
    const sample = document.getElementById('newProductSample').value.trim();
    const moqVal = document.getElementById('newProductMoq').value;
    const daysVal = document.getElementById('newProductDays').value;

    const imgFile = document.getElementById('newProductImage').files?.[0];
    const vidFile = document.getElementById('newProductVideo').files?.[0];

    const submitBtn = document.getElementById('submitNewProductBtn');
    const spinner = document.getElementById('submitNewProductSpinner');

    // 1. تفعيل اللودر وتعطيل الزر
    if (submitBtn) submitBtn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');

    // إشعار بصري للمستخدم
    const toast = showToast(`
        <svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        جاري معالجة ورفع بيانات المنتج الجديد...
    `);

    try {
        // 2. توليد معرف منتج مخصص تلقائياً وبشكل فريد تماماً
        const slug = name.replace(/[\s\W]+/g, '_');
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const customId = `P_${slug}_${randomNum}`;

        // 3. معالجة ورفع الصورة
        let imageUrl = '';
        if (imgFile) {
            const compressedImg = await compressProductImageIfNeeded(imgFile);
            imageUrl = await uploadProductMediaFile(compressedImg);
        }

        // 4. معالجة ورفع الفيديو
        let videoUrl = '';
        if (vidFile) {
            // التحقق من حجم الفيديو (باقة Supabase المجانية تدعم حتى 50 ميجابايت)
            const maxVideoSize = 50 * 1024 * 1024;
            if (vidFile.size > maxVideoSize) {
                throw new Error('حجم الفيديو كبير جداً! الحد الأقصى هو 50MB.');
            }
            videoUrl = await uploadProductMediaFile(vidFile);
        }

        // 5. إعداد كائن المنتج
        const productPayload = {
            product_custom_id: customId,
            product_name: name,
            product_image_url: imageUrl,
            specifications: specs,
            sample_details: sample,
            moq_of_product: moqVal ? parseInt(moqVal) : null,
            days_of_manufacturing: daysVal ? parseInt(daysVal) : null,
            product_video_url: videoUrl,
            type_id: typeId
        };

        // 6. إدخال السجل في جدول products
        const { data: newProd, error: insertError } = await _supabase
            .from('products')
            .insert([productPayload])
            .select('*')
            .single();

        if (insertError) throw insertError;

        // 7. إعادة تحميل الذاكرة المحلية للمنتجات
        await loadProductsLookup();

        // 8. إذا كان هناك بند نشط تم فتح مودال المنتجات من أجله، نقوم بربطه به تلقائياً!
        if (activeProductSelectorItemId && newProd) {
            // نقوم بتحديث البند في جدول invoice_items
            const { error: linkError } = await _supabase
                .from('invoice_items')
                .update({ product_id: newProd.id })
                .eq('id', activeProductSelectorItemId);

            if (!linkError) {
                // تحديث الذاكرة المحلية للبند
                const itemIndex = invoiceItems.findIndex(i => i.id === activeProductSelectorItemId);
                if (itemIndex !== -1) {
                    invoiceItems[itemIndex].product_id = newProd.id;
                }
            }
            // إغلاق مودال اختيار المنتجات
            closeProductSelectorModal();
            activeProductSelectorItemId = null;
        }

        // 9. إعادة رسم جدول عناصر الفاتورة
        renderInvoiceItemsTable();

        // 10. إغلاق مودال الإضافة وإرجاع حالة النموذج والزر
        closeAddProductModal();

        toast.update(`🎉 تم إضافة المنتج الجديد [${customId}] بنجاح!`, 'success');
        setTimeout(() => toast.remove(), 3000);

    } catch (err) {
        console.error('Error adding product:', err);
        toast.update(`❌ فشل إضافة المنتج: ${err.message}`, 'error');
        setTimeout(() => toast.remove(), 5000);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (spinner) spinner.classList.add('hidden');
    }
}