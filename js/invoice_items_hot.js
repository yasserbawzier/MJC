let invoiceItems = [];
let productsLookup = [];
let itemPhotosLookup = {};
let currentInvoiceId = null;
let currentCustomerName = '-';
let currentShippingRatePerCbm = 0;
let uploadingPhotosTracker = {};
let showOnlyActive = false;

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

    const removeFn = () => {
        toast.classList.add('hidden-toast');
        setTimeout(() => toast.remove(), 300);
    };

    // إخفاء التنبيه تلقائياً بعد 4 ثوانٍ
    setTimeout(removeFn, 4000);

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
        remove: removeFn
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



// ===================================================
// استيراد Excel - محوّل إلى excel_import.js
// ===================================================

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

// Renderers for Handsontable
function photoRenderer(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.BaseRenderer.apply(this, arguments);
    const itemsToRender = showOnlyActive ? invoiceItems.filter(item => item.status === true) : invoiceItems;
    const item = itemsToRender[row];
    if (!item) return;

    // الصور مخزنة في itemPhotosLookup تحت معرف البند، والـ prop هو اسم الحقل (client_photo_url, ...)
    const itemPhotos = itemPhotosLookup[item.id] || {};
    const photoUrl = itemPhotos[prop] || null;
    const isUploading = uploadingPhotosTracker[`${item.id}_${prop}`];

    td.innerHTML = '';
    td.style.padding = '4px';
    td.className = 'htCenter htMiddle';

    if (photoUrl) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;width:48px;height:48px;margin:auto;display:flex;align-items:center;justify-content:center;';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'width:48px;height:48px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.1);display:block;';
        btn.onclick = () => {
            if (item.status !== false) {
                openPhotoActionsModal(item.id, prop, photoUrl);
            } else {
                openImageModal(photoUrl);
            }
        };

        const img = document.createElement('img');
        img.src = photoUrl;
        img.alt = 'Photo';
        img.style.cssText = `width:100%;height:100%;object-fit:cover;${isUploading ? 'opacity:0.4;filter:blur(1px);' : ''}`;
        img.loading = 'lazy';
        btn.appendChild(img);
        wrapper.appendChild(btn);

        if (isUploading) {
            const spinner = document.createElement('div');
            spinner.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;';
            spinner.innerHTML = '<svg class="animate-spin" style="width:20px;height:20px;color:#2563eb" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
            wrapper.appendChild(spinner);
        }
        td.appendChild(wrapper);
    } else {
        if (item.status !== false) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.onclick = () => openPhotoActionsModal(item.id, prop, null);
            btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;width:48px;height:48px;background:#f9fafb;border:2px dashed #d1d5db;border-radius:8px;color:#9ca3af;margin:auto;cursor:pointer;';
            btn.innerHTML = '<span style="font-size:14px;font-weight:bold;line-height:1;">+</span><span style="font-size:9px;margin-top:2px;">إضافة</span>';
            td.appendChild(btn);
        } else {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;align-items:center;justify-content:center;width:48px;height:48px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;color:#d1d5db;margin:auto;';
            div.innerHTML = '<span style="font-weight:bold;">-</span>';
            td.appendChild(div);
        }
    }
}

function productImageRenderer(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.BaseRenderer.apply(this, arguments);
    td.innerHTML = '';
    td.style.padding = '4px';
    td.className = 'htCenter htMiddle';

    // قراءة صورة المنتج من productsLookup (ليست على invoice_item مباشرة)
    const itemsToRender = showOnlyActive ? invoiceItems.filter(item => item.status === true) : invoiceItems;
    const item = itemsToRender[row];
    const product = item ? getProductById(item.product_id) : null;
    const imgUrl = (product && product.product_image_url) ? product.product_image_url : null;

    if (imgUrl) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.onclick = () => openImageModal(imgUrl);
        btn.style.cssText = 'width:48px;height:48px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.1);display:block;margin:auto;';
        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = 'Product';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        img.loading = 'lazy';
        btn.appendChild(img);
        td.appendChild(btn);
    } else {
        const span = document.createElement('span');
        span.style.color = '#9ca3af';
        span.textContent = '-';
        td.appendChild(span);
    }
}

function productIdRenderer(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.BaseRenderer.apply(this, arguments);
    
    const itemsToRender = showOnlyActive ? invoiceItems.filter(item => item.status === true) : invoiceItems;
    const item = itemsToRender[row];
    if (!item) return;

    td.innerHTML = '';
    td.className = 'htCenter htMiddle font-bold';

    const product = getProductById(item.product_id);
    const productCustomId = product ? product.product_custom_id : (value || '-');

    if (item.status !== false) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.onclick = () => openProductSelectorModal(item.id);
        btn.className = 'text-blue-600 hover:text-blue-800 font-bold hover:underline transition';
        btn.textContent = productCustomId;
        td.appendChild(btn);
    } else {
        const span = document.createElement('span');
        span.className = 'text-gray-400';
        span.textContent = productCustomId;
        td.appendChild(span);
    }
}

function actionsRenderer(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.BaseRenderer.apply(this, arguments);
    
    const itemsToRender = showOnlyActive ? invoiceItems.filter(item => item.status === true) : invoiceItems;
    const item = itemsToRender[row];
    if (!item) return;

    td.innerHTML = '';
    td.className = 'htCenter htMiddle';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.onclick = () => deleteInvoiceItem(item.id);
    btn.className = 'bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm hover:shadow active:scale-95 transition-all text-xs';
    btn.textContent = 'حذف';
    td.appendChild(btn);
}

// متغير عام لتخزين نسخة Handsontable
let hotInstance = null;

async function saveMergeState(cellRange, isMerge) {
    const itemsToRender = showOnlyActive ? invoiceItems.filter(item => item.status === true) : invoiceItems;
    
    const fromRow = cellRange.from.row;
    const toRow = cellRange.to.row;
    const fromCol = cellRange.from.col;
    const toCol = cellRange.to.col;

    const columnsConfig = [
        { data: 'item_name' },
        { data: 'client_photo_url' },
        { data: 'design_photo_url' },
        { data: 'dieline_photo_url' },
        { data: 'design_details' },
        { data: 'size' },
        { data: 'specifications' },
        { data: 'product_id' },
        { data: 'product_image_url' },
        { data: 'sample' },
        { data: 'production' },
        { data: 'quantity' },
        { data: 'unit_type' },
        { data: 'factory_price_per_unit' },
        { data: 'total_factory_price' },
        { data: 'shipping_price_per_unit' },
        { data: 'total_shipping_cost' },
        { data: 'qty_per_ctn' },
        { data: 'CTN' },
        { data: 'gw_per_ctn_kg' },
        { data: 'length_cm' },
        { data: 'width_cm' },
        { data: 'height_cm' },
        { data: 'cbm_per_ctn' },
        { data: 'total_cbm' },
        { data: 'place' },
        { data: 'status' }
    ];

    if (fromCol < 0 || fromCol >= columnsConfig.length) return;
    const colName = columnsConfig[fromCol].data;

    const dbUpdates = [];

    if (isMerge) {
        const rowspan = toRow - fromRow + 1;
        const colspan = toCol - fromCol + 1;

        const parentItem = itemsToRender[fromRow];
        if (parentItem) {
            let meta = parentItem.merge_metadata;
            if (typeof meta === 'string') {
                try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
            }
            if (!meta || typeof meta !== 'object') meta = {};
            
            meta[colName] = { rowspan, colspan };
            parentItem.merge_metadata = meta;
            dbUpdates.push({ id: parentItem.id, payload: { merge_metadata: meta } });
        }

        for (let r = fromRow + 1; r <= toRow; r++) {
            const childItem = itemsToRender[r];
            if (childItem) {
                let meta = childItem.merge_metadata;
                if (typeof meta === 'string') {
                    try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
                }
                if (meta && typeof meta === 'object') {
                    delete meta[colName];
                    childItem.merge_metadata = meta;
                    dbUpdates.push({ id: childItem.id, payload: { merge_metadata: meta } });
                }
            }
        }
    } else {
        for (let r = fromRow; r <= toRow; r++) {
            const item = itemsToRender[r];
            if (item) {
                let meta = item.merge_metadata;
                if (typeof meta === 'string') {
                    try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
                }
                if (meta && typeof meta === 'object') {
                    delete meta[colName];
                    item.merge_metadata = meta;
                    dbUpdates.push({ id: item.id, payload: { merge_metadata: meta } });
                }
            }
        }
    }

    try {
        await Promise.all(dbUpdates.map(upd => 
            _supabase.from('invoice_items').update(upd.payload).eq('id', upd.id)
        ));
        console.log('Saved merge state successfully!');
    } catch (err) {
        console.error('Error saving merge state:', err.message);
        showToast('❌ فشل حفظ دمج الخلايا في قاعدة البيانات: ' + err.message, 'error');
    }
}

function renderHandsontable() {
    const container = document.getElementById('excelGrid');
    if (!container) return;

    let itemsToRender = showOnlyActive
        ? invoiceItems.filter(item => item.status === true)
        : [...invoiceItems];

    // حساب المجاميع لصف النهاية
    let sumQuantity = 0;
    let sumTotalFactory = 0;
    let sumTotalShipping = 0;
    let sumTotalCTN = 0;
    let sumTotalCBM = 0;

    itemsToRender.forEach(item => {
        sumQuantity += Number(item.quantity || 0);
        
        // حساب إجمالي السعر محلياً إن لم يكن محفوظاً
        const totalFactory = item.total_factory_price !== null && item.total_factory_price !== undefined 
            ? Number(item.total_factory_price) 
            : (Number(item.quantity || 0) * Number(item.factory_price_per_unit || 0));
        sumTotalFactory += totalFactory;

        sumTotalShipping += Number(item.total_shipping_cost || 0);
        
        const ctnValue = item.CTN !== null && item.CTN !== undefined 
            ? item.CTN 
            : ((item.quantity && item.qty_per_ctn) ? Math.ceil(item.quantity / item.qty_per_ctn) : 0);
        sumTotalCTN += Number(ctnValue || 0);

        const cbmPerCtn = item.length_cm && item.width_cm && item.height_cm
            ? ((Number(item.length_cm) / 100) * (Number(item.width_cm) / 100) * (Number(item.height_cm) / 100))
            : null;
        
        const totalCbm = item.total_cbm !== null && item.total_cbm !== undefined
            ? item.total_cbm
            : ((cbmPerCtn !== null && ctnValue !== null) ? (Number(cbmPerCtn) * Number(ctnValue)) : 0);
            
        sumTotalCBM += Number(totalCbm || 0);
    });

    // إضافة سطر المجموع الوهمي
    itemsToRender.push({
        id: 'summary_row',
        item_name: 'المجموع الإجمالي / Totals',
        quantity: sumQuantity,
        total_factory_price: sumTotalFactory,
        total_shipping_cost: sumTotalShipping,
        CTN: sumTotalCTN,
        total_cbm: sumTotalCBM.toFixed(4),
        is_summary: true
    });

    const merges = [];
    const columnsConfig = [
        { data: 'item_name' },
        { data: 'client_photo_url' },
        { data: 'design_photo_url' },
        { data: 'dieline_photo_url' },
        { data: 'design_details' },
        { data: 'size' },
        { data: 'specifications' },
        { data: 'product_id' },
        { data: 'product_image_url' },
        { data: 'sample' },
        { data: 'production' },
        { data: 'quantity' },
        { data: 'unit_type' },
        { data: 'factory_price_per_unit' },
        { data: 'total_factory_price' },
        { data: 'shipping_price_per_unit' },
        { data: 'total_shipping_cost' },
        { data: 'qty_per_ctn' },
        { data: 'CTN' },
        { data: 'gw_per_ctn_kg' },
        { data: 'length_cm' },
        { data: 'width_cm' },
        { data: 'height_cm' },
        { data: 'cbm_per_ctn' },
        { data: 'total_cbm' },
        { data: 'place' },
        { data: 'status' }
    ];

    itemsToRender.forEach((item, rowIndex) => {
        if (item.merge_metadata) {
            let meta = item.merge_metadata;
            if (typeof meta === 'string') {
                try { meta = JSON.parse(meta); } catch (e) { meta = null; }
            }
            if (meta && typeof meta === 'object') {
                Object.keys(meta).forEach(colName => {
                    const colIndex = columnsConfig.findIndex(c => c.data === colName);
                    if (colIndex !== -1 && meta[colName]) {
                        merges.push({
                            row: rowIndex,
                            col: colIndex,
                            rowspan: meta[colName].rowspan || 1,
                            colspan: meta[colName].colspan || 1
                        });
                    }
                });
            }
        }
    });

    if (hotInstance) {
        hotInstance.loadData(itemsToRender);
        hotInstance.updateSettings({
            mergeCells: merges
        });
        updateInvoiceItemsFooter();
        return;
    }

    // إزالة مؤشر التحميل قبل رسم الجدول لأول مرة
    container.innerHTML = '';

    hotInstance = new Handsontable(container, {
        data: itemsToRender,
        rowHeaders: true,
        colHeaders: [
            'Item', 'Client Photo', 'Design', 'Dieline', 'Design details', 'Size', 'Specifications',
            'ProductID', 'Product Image', 'Sample', 'Production', 'MOQ', 'Unit', 'Factory price', 
            'Total Amount', 'Shipping Price/Unit', 'Total Shipping', 'Quantity/CTN', 'CTN', 
            'GW/CTN KG', 'L', 'W', 'H', 'CBM/CTN', 'Total CBM', 'place', 'status', 'Actions'
        ],
        columns: [
            { data: 'item_name', type: 'text' },
            { data: 'client_photo_url', renderer: photoRenderer, readOnly: true },
            { data: 'design_photo_url', renderer: photoRenderer, readOnly: true },
            { data: 'dieline_photo_url', renderer: photoRenderer, readOnly: true },
            { data: 'design_details', type: 'text' },
            { data: 'size', type: 'text' },
            { data: 'specifications', type: 'text' },
            { data: 'product_id', renderer: productIdRenderer, readOnly: true },
            { data: 'product_image_url', renderer: productImageRenderer, readOnly: true },
            { data: 'sample', type: 'text' },
            { data: 'production', type: 'text' },
            { data: 'quantity', type: 'numeric' },
            { data: 'unit_type', type: 'text' },
            { data: 'factory_price_per_unit', type: 'numeric' },
            { data: 'total_factory_price', type: 'numeric', readOnly: true },
            { data: 'shipping_price_per_unit', type: 'numeric' },
            { data: 'total_shipping_cost', type: 'numeric', readOnly: true },
            { data: 'qty_per_ctn', type: 'numeric' },
            { data: 'CTN', type: 'numeric' },
            { data: 'gw_per_ctn_kg', type: 'numeric' },
            { data: 'length_cm', type: 'numeric' },
            { data: 'width_cm', type: 'numeric' },
            { data: 'height_cm', type: 'numeric' },
            { data: 'cbm_per_ctn', type: 'numeric', readOnly: true },
            { data: 'total_cbm', type: 'numeric', readOnly: true },
            { data: 'place', type: 'text' },
            { data: 'status', type: 'checkbox' },
            { data: 'actions', renderer: actionsRenderer, readOnly: true }
        ],
        layoutDirection: 'rtl',
        autoWrapRow: true,
        autoWrapCol: true,
        licenseKey: 'non-commercial-and-evaluation',
        height: '600px',
        width: '100%',
        stretchH: 'all',
        className: 'htCenter htMiddle custom-ht',
        rowHeights: 60,
        mergeCells: merges,
        contextMenu: {
            items: {
                "mergeCells": {
                    name: "دمج / إلغاء دمج الخلايا (Merge/Unmerge)"
                }
            }
        },
        cells: function(row, col, prop) {
            var cellProperties = {};
            if (this.instance.getDataAtRowProp(row, 'is_summary')) {
                cellProperties.readOnly = true;
                cellProperties.className = 'htCenter htMiddle !bg-slate-200 !text-black !font-extrabold';
            }
            return cellProperties;
        },
        afterMergeCells: function (cellRange, mergeParent, autoRender) {
            saveMergeState(cellRange, true);
        },
        afterUnmergeCells: function (cellRange, autoRender) {
            saveMergeState(cellRange, false);
        },
        afterChange: function (changes, source) {
            if (source === 'loadData') return;
            handleHandsontableChange(changes, source);
        }
    });

    updateInvoiceItemsFooter();
}

async function addNewRowToDatabase() {
    if (!currentInvoiceId) return;

    // إظهار إشعار مؤقت
    const toast = showToast('جاري إضافة سطر جديد...', 'info');

    try {
        const payload = {
            invoice_id: currentInvoiceId,
            item_name: getNextItemName(),
            status: true,
            quantity: 0,
            factory_price_per_unit: 0,
            qty_per_ctn: 0,
            length_cm: 0,
            width_cm: 0,
            height_cm: 0,
            gw_per_ctn_kg: 0,
            shipping_price_per_unit: 0
        };

        const { data, error } = await _supabase.from("invoice_items").insert([payload]).select("*, item_photos(*)").single();
        if (error) throw error;

        // تهيئة الصور في الذاكرة
        if (data.item_photos) {
            const photos = Array.isArray(data.item_photos) ? data.item_photos[0] : data.item_photos;
            if (photos) {
                itemPhotosLookup[data.id] = photos;
            }
        }

        // إضافته للجدول المحلي وإعادة الرسم
        invoiceItems.push(data);
        renderInvoiceItemsTable();

        toast.remove();
        showToast('تمت إضافة السطر بنجاح!', 'success');
        
        // التمرير إلى أسفل الجدول لرؤية السطر الجديد
        setTimeout(() => {
            const gridContainer = document.getElementById('excelGrid');
            if (gridContainer) gridContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 300);

    } catch (error) {
        console.error('Error adding new row:', error);
        toast.remove();
        showToast('فشل في إضافة السطر: ' + error.message, 'error');
    }
}

function renderInvoiceItemsTable() {
    renderHandsontable();
}

function updateInvoiceItemsFooter() {
    let totalMOQ = 0, totalAmountVal = 0, totalShippingVal = 0, totalCtnVal = 0, totalCbmVal = 0;
    let activeMOQ = 0, activeAmountVal = 0, activeShippingVal = 0, activeCtnVal = 0, activeCbmVal = 0;

    invoiceItems.forEach(item => {
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

        // جميع العناصر لصف المجموع في الجدول
        totalMOQ += Number(item.quantity || 0);
        totalAmountVal += totalFactory;
        totalShippingVal += Number(item.total_shipping_cost || 0);
        totalCtnVal += Number(ctnValue || 0);
        if (totalCbm !== '-' && totalCbm !== null) {
            totalCbmVal += Number(totalCbm);
        }

        // العناصر النشطة فقط للبطاقات العلوية
        if (item.status === true) {
            activeMOQ += Number(item.quantity || 0);
            activeAmountVal += totalFactory;
            activeShippingVal += Number(item.total_shipping_cost || 0);
            activeCtnVal += Number(ctnValue || 0);
            if (totalCbm !== '-' && totalCbm !== null) {
                activeCbmVal += Number(totalCbm);
            }
        }
    });

    const totalRow = document.getElementById('invoiceItemsTotalRow');
    if (totalRow) {
        totalRow.innerHTML = `
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center" colspan="11">المجموع الإجمالي / Totals</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-blue-50">${formatNumber(activeMOQ)}</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center" colspan="2">-</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-blue-100">${formatNumber(activeAmountVal)}</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center">-</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-red-100">${formatNumber(activeShippingVal)}</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center">-</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-yellow-100">${formatNumber(activeCtnVal)}</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center" colspan="5">-</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-yellow-100">${activeCbmVal > 0 ? activeCbmVal.toFixed(4) : '-'}</td>
            <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center" colspan="3">-</td>
        `;
    }

    // تحديث سطر المجموع الوهمي داخل جدول Handsontable بجميع العناصر
    if (typeof hotInstance !== 'undefined' && hotInstance) {
        const data = hotInstance.getSourceData();
        if (data && data.length > 0) {
            const summaryRowIndex = data.length - 1;
            const summaryRow = data[summaryRowIndex];
            if (summaryRow && summaryRow.is_summary === true) {
                summaryRow.quantity = totalMOQ;
                summaryRow.total_factory_price = totalAmountVal;
                summaryRow.total_shipping_cost = totalShippingVal;
                summaryRow.CTN = totalCtnVal;
                summaryRow.total_cbm = totalCbmVal > 0 ? totalCbmVal.toFixed(4) : 0;
                hotInstance.render();
            }
        }
    }

    // تحديث البطاقات العلوية بالعناصر النشطة فقط
    const statQty = document.getElementById('statTotalQuantity');
    if (statQty) statQty.textContent = activeMOQ.toLocaleString('en-US');

    const statCtn = document.getElementById('statTotalCtn');
    if (statCtn) statCtn.textContent = activeCtnVal.toLocaleString('en-US');

    const statCbm = document.getElementById('statTotalCbm');
    if (statCbm) statCbm.textContent = activeCbmVal.toFixed(4);

    const statShipping = document.getElementById('statTotalShipping');
    if (statShipping) statShipping.textContent = '$' + activeShippingVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const statFactory = document.getElementById('statTotalFactory');
    if (statFactory) statFactory.textContent = '$' + activeAmountVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function updateInvoiceItemRowTargeted(itemId) {
    if (hotInstance) hotInstance.render();
}

function rebuildInvoiceItemRow(itemId) {
    if (hotInstance) hotInstance.render();
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

    invoiceItems = rawItems;


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

    renderInvoiceItemsTable();
    updateInvoiceItemsFooter();

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
    modalImg.src = '';
    modal.classList.add('hidden');
}

// ==========================================
// وظائف النافذة المنبثقة لعرض بيانات المنتج:
// ==========================================

function openProductDetailsModal(productId) {
    const product = getProductById(productId);
    if (!product) return;
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
async function initInvoiceItemsPage() {
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

    // عرض مؤشر تحميل
    const gridContainer = document.getElementById('excelGrid');
    if (gridContainer) {
        gridContainer.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;">
                <svg style="animation:spin 1s linear infinite;width:48px;height:48px;color:#203764" fill="none" viewBox="0 0 24 24">
                    <circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span style="font-size:14px;font-weight:600;color:#6b7280;">جاري التحميل...</span>
            </div>
            <style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>
        `;
    }

    try {
        // ⚡ استراتيجية التحميل الفائق السرعة:
        // ابدأ الثلاثة طلبات في نفس اللحظة تماماً بالتوازي الكامل
        const itemsPromise    = loadInvoiceItems();   // البنود + الصور
        const productsPromise = loadProductsLookup(); // المنتجات (قد تكون كثيرة)
        const detailsPromise  = loadInvoiceDetails(); // تفاصيل الفاتورة

        // ارسم الجدول فور وصول البنود — حتى لو المنتجات لم تصل بعد
        await itemsPromise;

        // عند وصول المنتجات: أعد رسم الجدول فقط ليظهر صور المنتجات ومعرفاتها
        productsPromise.then(() => {
            if (hotInstance) {
                hotInstance.render();
            }
            renderProductOptions();
        });

        // تفاصيل الفاتورة تُحدّث التسميات فقط — لا تأثير على الجدول
        detailsPromise.catch(err => console.error('Details load error:', err));

    } catch (err) {
        console.error('Error initializing page:', err);
    }
}

async function handleHandsontableChange(changes, source) {
    if (!changes) return;

    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        const row = change[0];
        const prop = change[1];
        const oldValue = change[2];
        let newValue = change[3];

        if (oldValue === newValue) continue;

        const itemsToRender = showOnlyActive
            ? invoiceItems.filter(item => item.status === true)
            : invoiceItems;
        
        // تجاوز سطر المجموع (لأنه غير موجود في invoiceItems الأصلية)
        if (row >= itemsToRender.length) {
            continue;
        }

        const item = itemsToRender[row];
        if (!item) continue;

        // تجاهل الأعمدة الوهمية أو المحسوبة أو التي لا تنتمي لجدول invoice_items
        const virtualColumns = [
            'client_photo_url', 'design_photo_url', 'dieline_photo_url', 
            'design_details', 'product_image_url', 'actions', 'total_factory_price', 
            'total_shipping_cost', 'cbm_per_ctn', 'total_cbm'
        ];
        if (virtualColumns.includes(prop)) {
            continue;
        }

        // الحقول الرقمية
        const numericFields = ['quantity', 'factory_price_per_unit', 'qty_per_ctn', 'gw_per_ctn_kg', 'length_cm', 'width_cm', 'height_cm', 'CTN', 'shipping_price_per_unit'];
        if (numericFields.includes(prop)) {
            let numVal = parseFloat(newValue);
            if (isNaN(numVal)) numVal = 0;
            newValue = numVal;
        }

        if (prop === 'status') {
            newValue = (newValue === true || newValue === 'true' || newValue === 1);
        }

        item[prop] = newValue;

        // إعادة الحساب محلياً
        const keepManualCtn = (prop === 'CTN');
        recalculateLocalItemFields(item, keepManualCtn, prop);

        // التحديث في قاعدة البيانات
        let updatePayload = {};
        updatePayload[prop] = newValue;
        if (prop === 'quantity' || prop === 'qty_per_ctn') {
            updatePayload['CTN'] = item.CTN;
        }
        if (prop === 'shipping_price_per_unit') {
            updatePayload['total_shipping_cost'] = item.total_shipping_cost;
        }

        try {
            const { error } = await _supabase.from('invoice_items').update(updatePayload).eq('id', item.id);
            if (error) throw error;
        } catch (err) {
            console.error('Back-end sync error:', err.message);
            showToast('❌ فشل حفظ التعديل: ' + err.message, 'error');
            item[prop] = oldValue;
            recalculateLocalItemFields(item, keepManualCtn, prop);
        }
    }

    if (hotInstance) {
        hotInstance.render();
    }
    updateInvoiceItemsFooter();
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
    item.cbm_per_ctn = cbmPerCtn !== null ? Number(cbmPerCtn.toFixed(4)) : null;
    }

    // 3. حساب إجمالي الحجم Total CBM
    const ctnVal = item.CTN !== null && item.CTN !== undefined ? item.CTN : 0;
    if (cbmPerCtn !== null && ctnVal > 0) {
        item.total_cbm = Number((cbmPerCtn * ctnVal).toFixed(4));
    } else {
        item.total_cbm = null;
    }

    // 4. حساب إجمالي السعر المصنعي
    item.total_factory_price = Number(((item.quantity || 0) * (item.factory_price_per_unit || 0)).toFixed(2));

    // 5. حساب تكلفة الشحن الإجمالية و شحن القطعة
    if (fieldName === 'shipping_price_per_unit' || item.shipping_price_per_unit > 0) {
        // إذا تم إدخال سعر شحن القطعة يدوياً، نعتمد عليه لحساب الإجمالي
        item.total_shipping_cost = Number(((item.shipping_price_per_unit || 0) * (item.quantity || 0)).toFixed(2));
    } else if (item.total_cbm !== null && currentShippingRatePerCbm > 0) {
        // الاعتماد على الحجم وسعر الشحن العام إن وجد
        item.total_shipping_cost = Number((item.total_cbm * currentShippingRatePerCbm).toFixed(2));
        if (item.total_shipping_cost && item.quantity) {
            item.shipping_price_per_unit = Number((item.total_shipping_cost / item.quantity).toFixed(4));
        }
    } else {
        item.total_shipping_cost = 0;
        item.shipping_price_per_unit = 0;
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
