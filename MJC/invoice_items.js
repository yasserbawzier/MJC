// تم ربط هذا الملف بالفعل في الـ HTML باسم invoice_items.js

let invoiceItems = [];
let productsLookup = [];
let itemPhotosLookup = {};
let currentInvoiceId = null;

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

async function reorderInvoiceItems() {
    const { data, error } = await _supabase.from('invoice_items')
        .select('id, item_name, created_at')
        .eq('invoice_id', currentInvoiceId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error(error.message);
        return;
    }

    const items = data || [];
    const updates = [];

    items.forEach((item, index) => {
        const expectedName = `Item ${index + 1}`;
        if (item.item_name !== expectedName) {
            updates.push({ id: item.id, item_name: expectedName });
        }
    });

    for (const update of updates) {
        const { error: updateError } = await _supabase.from('invoice_items')
            .update({ item_name: update.item_name })
            .eq('id', update.id);

        if (updateError) {
            console.error(updateError.message);
        }
    }

    await loadInvoiceItems();
}

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
    if (!invoiceItems || invoiceItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="21" class="p-4 text-center text-gray-500">لا توجد عناصر لهذه الفاتورة بعد.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    invoiceItems.forEach(item => {
        const product = getProductById(item.product_id);
        const productCustomId = product ? product.product_custom_id || '-' : '-';
        const productImage = product && product.product_image_url ? `<img src="${product.product_image_url}" alt="Factory Image" class="w-16 h-16 object-cover rounded-lg border border-gray-200">` : '-';
        
        const totalFactory = (item.quantity || 0) * (item.factory_price_per_unit || 0);
        
        // حساب CBM
        const cbmPerCtn = item.length_cm && item.width_cm && item.height_cm 
            ? ((Number(item.length_cm) / 100) * (Number(item.width_cm) / 100) * (Number(item.height_cm) / 100)).toFixed(4)
            : null;

        const itemPhotos = itemPhotosLookup[item.id] || {};
        const clientPhotoCell = itemPhotos.client_photo_url ? `<a href="${itemPhotos.client_photo_url}" target="_blank" class="inline-block"><img src="${itemPhotos.client_photo_url}" alt="Client Photo" class="w-16 h-16 object-cover rounded-lg border border-gray-200"></a>` : '-';
        const designPhotoCell = itemPhotos.design_photo_url ? `<a href="${itemPhotos.design_photo_url}" target="_blank" class="inline-block"><img src="${itemPhotos.design_photo_url}" alt="Design Photo" class="w-16 h-16 object-cover rounded-lg border border-gray-200"></a>` : '-';
        const dielinePhotoCell = itemPhotos.dieline_photo_url ? `<a href="${itemPhotos.dieline_photo_url}" target="_blank" class="inline-block"><img src="${itemPhotos.dieline_photo_url}" alt="Dieline Photo" class="w-16 h-16 object-cover rounded-lg border border-gray-200"></a>` : '-';

        const row = document.createElement('tr');
        row.className = 'border-b hover:bg-blue-50 transition';
        row.innerHTML = `
            <td class="p-4 text-sm text-gray-700">${item.item_name || '-'}</td>
            <td class="p-4 text-sm text-gray-700">${clientPhotoCell}</td>
            <td class="p-4 text-sm text-gray-700">${designPhotoCell}</td>
            <td class="p-4 text-sm text-gray-700">${dielinePhotoCell}</td>
            <td class="p-4 text-sm text-gray-700">-</td>
            <td class="p-4 text-sm text-gray-700">${item.size || '-'}</td>
            <td class="p-4 text-sm text-gray-700">${item.specifications || '-'}</td>
            <td class="p-4 text-sm text-gray-700">${productCustomId}</td>
            <td class="p-4 text-sm text-gray-700">${productImage}</td>
            <td class="p-4 text-sm text-gray-700">${formatNumber(item.quantity)}</td>
            <td class="p-4 text-sm text-gray-700">${formatNumber(item.factory_price_per_unit)}</td>
            <td class="p-4 text-sm text-gray-700">${formatNumber(totalFactory)}</td>
            <td class="p-4 text-sm text-gray-700">${formatNumber(item.qty_per_ctn)}</td>
            <td class="p-4 text-sm text-gray-700">${formatNumber(item.gw_per_ctn_kg)}</td>
            <td class="p-4 text-sm text-gray-700">${formatNumber(item.length_cm)}</td>
            <td class="p-4 text-sm text-gray-700">${formatNumber(item.width_cm)}</td>
            <td class="p-4 text-sm text-gray-700">${formatNumber(item.height_cm)}</td>
            <td class="p-4 text-sm text-gray-700">${formatNumber(cbmPerCtn)}</td>
            <td class="p-4 text-sm text-gray-700">${formatNumber(item.shipping_price_per_unit)}</td>
            <td class="p-4 text-sm text-gray-700">${formatNumber(item.total_shipping_cost)}</td>
            <td class="p-4 text-left whitespace-nowrap">
                <button onclick="editInvoiceItem('${item.id}')" class="bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700 text-sm mr-2">تعديل</button>
                <button onclick="deleteInvoiceItem('${item.id}')" class="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 text-sm">حذف</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// تحميل المنتجات
async function loadProductsLookup() {
    const { data, error } = await _supabase.from('products').select('*').order('product_custom_id', { ascending: true });
    if (error) { console.error(error.message); return; }
    productsLookup = data || [];
    renderProductOptions();
}

// تحميل تفاصيل الفاتورة
async function loadInvoiceDetails() {
    const { data: invoiceData, error: invoiceError } = await _supabase.from('invoices').select('*, customers(customer_custom_id, full_name),shipping_rates(country_name)').eq('id', currentInvoiceId).single();
    if (invoiceError) { alert('خطأ في جلب الفاتورة'); return; }

    document.getElementById('invoiceNumberDisplay').textContent = invoiceData.invoice_number || '-';
    document.getElementById('invoiceCustomerDisplay').textContent = invoiceData.customers?.customer_custom_id || '-';
    document.getElementById('invoiceCustomerNameDisplay').textContent = invoiceData.customers?.full_name || '-';
    document.getElementById('invoiceShippingDestinationDisplay').textContent = invoiceData.shipping_rates?.country_name || '-';
    // تحديث رابط تصاميم العناصر
    const designsLink = document.getElementById('itemDesignsLink');
    if (designsLink) {
        designsLink.href = `item_designs.html?invoice_id=${currentInvoiceId}`;
    }
}

// تحميل عناصر الفاتورة
async function loadInvoiceItems() {
    const { data, error } = await _supabase.from('invoice_items')
        .select('*')
        .eq('invoice_id', currentInvoiceId)
        .order('created_at', { ascending: true });
    if (error) { console.error(error.message); return; }
    invoiceItems = data || [];

    const itemIds = invoiceItems.map(item => item.id).filter(Boolean);
    await loadItemPhotosForInvoiceItems(itemIds);

    renderInvoiceItemsTable();
    updateItemNameField();
}

// --- الوظيفة المطلوبة: حفظ العنصر ---
async function addInvoiceItem(event) {
    event.preventDefault();
    if (!currentInvoiceId) return;
const submitBtn = document.getElementById('saveInvoiceItemButton');
if(submitBtn){
    submitBtn.disabled=true;
    submitBtn.classList.add('opacity-50','cursor-not-allowed');
    submitBtn.innerText='جاري الحفظ...';
}
    // تجميع البيانات من النموذج
    const payload = {
        invoice_id: currentInvoiceId,
        product_id: document.getElementById('invoiceItemProductId').value || null,
        item_name: getNextItemName(),
        size: document.getElementById('itemSize').value,
        specifications: document.getElementById('itemSpecifications').value,
        quantity: parseFloat(document.getElementById('itemQuantity').value) || 0,
        unit_type: document.getElementById('itemUnitType').value || null,
        factory_price_per_unit: parseFloat(document.getElementById('itemFactoryPricePerUnit').value) || 0,
        qty_per_ctn: parseInt(document.getElementById('itemQtyPerCtn').value) || 0,
        gw_per_ctn_kg: parseFloat(document.getElementById('itemGwPerCtnKg').value) || 0,
        length_cm: parseFloat(document.getElementById('itemLengthCm').value) || 0,
        width_cm: parseFloat(document.getElementById('itemWidthCm').value) || 0,
        height_cm: parseFloat(document.getElementById('itemHeightCm').value) || 0,
       
       
        
        place: document.getElementById('itemPlace').value || 1
    };

    const clientPhotoFile = document.getElementById('itemClientPhoto').files[0];
    const designPhotoFile = document.getElementById('itemDesignPhoto').files[0];
    const dielinePhotoFile = document.getElementById('itemDielinePhoto').files[0];

    try {
        const { data, error } = await _supabase.from('invoice_items').insert([payload]).select('id').single();
        if (error) throw error;

        const itemId = data?.id;
        if (itemId) {
            const clientPhotoUrl = clientPhotoFile ? await uploadInvoiceItemImageFile(clientPhotoFile) : null;
            const designPhotoUrl = designPhotoFile ? await uploadInvoiceItemImageFile(designPhotoFile) : null;
            const dielinePhotoUrl = dielinePhotoFile ? await uploadInvoiceItemImageFile(dielinePhotoFile) : null;

            if (clientPhotoUrl || designPhotoUrl || dielinePhotoUrl) {
                const { error: photosError } = await _supabase.from('item_photos').insert([{
                    item_id: itemId,
                    client_photo_url: clientPhotoUrl,
                    design_photo_url: designPhotoUrl,
                    dieline_photo_url: dielinePhotoUrl
                }]);
                if (photosError) throw photosError;
            }
        }

        alert('تم حفظ العنصر والصور بنجاح');
        document.getElementById('invoiceItemForm').reset();
        document.getElementById('productPreview').classList.add('hidden');
        await loadInvoiceItems(); // تحديث الجدول
    } catch (err) {
        alert('خطأ: ' + err.message);
    }
    if (submitBtn) {
    submitBtn.disabled = false; // إعادة تفعيل الزر
    submitBtn.classList.remove('opacity-50', 'cursor-not-allowed'); // إرجاع الشكل الطبيعي
    submitBtn.innerText = 'حفظ المنتج'; // إرجاع النص الأصلي
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
    const submitBtn = document.getElementById('updateInvoiceItemButton');

    try {
        const itemId = document.getElementById('editInvoiceItemId').value;
        if (!itemId) { alert('معرف العنصر غير موجود'); return; }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
            submitBtn.innerText = 'جاري الحفظ...';
        }

        const payload = {
            size: (document.getElementById('editItemSize') || {}).value || '',
            specifications: (document.getElementById('editItemSpecifications') || {}).value || '',
            quantity: parseFloat((document.getElementById('editItemQuantity') || {}).value) || 0,
            unit_type: (document.getElementById('editItemUnitType') || {}).value || null,
            factory_price_per_unit: parseFloat((document.getElementById('editItemFactoryPricePerUnit') || {}).value) || 0,
            qty_per_ctn: parseInt((document.getElementById('editItemQtyPerCtn') || {}).value) || 0,
            gw_per_ctn_kg: parseFloat((document.getElementById('editItemGwPerCtnKg') || {}).value) || 0,
            length_cm: parseFloat((document.getElementById('editItemLengthCm') || {}).value) || 0,
            width_cm: parseFloat((document.getElementById('editItemWidthCm') || {}).value) || 0,
            height_cm: parseFloat((document.getElementById('editItemHeightCm') || {}).value) || 0,
            
            place: (document.getElementById('editItemPlace') || {}).value || ''
        };

        const { error } = await _supabase.from('invoice_items').update(payload).eq('id', itemId);
        if (error) throw error;

        const clientPhotoFile = (document.getElementById('editItemClientPhoto') || {}).files?.[0];
        const designPhotoFile = (document.getElementById('editItemDesignPhoto') || {}).files?.[0];
        const dielinePhotoFile = (document.getElementById('editItemDielinePhoto') || {}).files?.[0];

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
                const { error: photosError } = await _supabase.from('item_photos').update(photosPayload).eq('id', existingPhotos.id);
                if (photosError) throw photosError;
            } else {
                const { error: photosError } = await _supabase.from('item_photos').insert([photosPayload]);
                if (photosError) throw photosError;
            }
        }

        alert('تم تحديث العنصر بنجاح');
        closeEditModal();
        await loadInvoiceItems();
        await loadInvoiceDetails();
    } catch (err) {
        alert('خطأ: ' + err.message);
        console.error(err);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            submitBtn.innerText = 'حفظ التعديلات';
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
    if (!confirm('هل أنت متأكد؟')) return;
    const { error } = await _supabase.from('invoice_items').delete().eq('id', itemId);
    if (!error) await reorderInvoiceItems();
}

// تشغيل عند التحميل
function initInvoiceItemsPage() {
    const params = new URLSearchParams(window.location.search);
    currentInvoiceId = params.get('invoice_id');
    
    if (!currentInvoiceId) {
        alert('لا يوجد معرف فاتورة');
        window.location.href = 'invoices.html';
        return;
    }

    // ربط الأحداث
    document.getElementById('invoiceItemProductId').addEventListener('change', updateProductPreview);
    document.getElementById('invoiceItemForm').addEventListener('submit', addInvoiceItem);
    document.getElementById('editInvoiceItemForm').addEventListener('submit', updateInvoiceItem);

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