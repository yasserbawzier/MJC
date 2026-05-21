// تم ربط هذا الملف بالفعل في الـ HTML باسم item_designs.js

let itemDesigns = [];
let invoiceItemsLookup = [];
let assetTypes = [];
let currentInvoiceId = null;
let currentDesignFile = null;
let currentEditDesignFile = null;
const DESIGN_FILE_BUCKET = 'product-images';

// دالة تنسيق الأرقام
function formatNumber(value) {
    if (value === null || value === undefined || value === '') return '-';
    return Number(value).toLocaleString('en-US');
}

// البحث عن عنصر بالمعرف
function getInvoiceItemById(itemId) {
    return invoiceItemsLookup.find(item => item.id === itemId) || null;
}

// تعبئة قائمة العناصر المنسدلة
function renderInvoiceItemsOptions() {
    const selects = ['designItemId', 'editDesignItemId'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">اختر العنصر</option>';
        invoiceItemsLookup.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.item_name || `Item ${item.id}`;
            select.appendChild(option);
        });
    });
}

function renderAssetTypeOptions() {
    const selects = ['designAssetTypeId', 'editDesignAssetTypeId'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">اختر نوع الأصول</option>';
        assetTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.name || `Asset ${type.id}`;
            select.appendChild(option);
        });
    });
}

async function loadAssetTypes() {
    const { data, error } = await _supabase.from('asset_types').select('*').order('created_at', { ascending: false });
    if (error) {
        console.error(error.message);
        assetTypes = [];
        return;
    }
    assetTypes = data || [];
    renderAssetTypeOptions();
}

function handleDesignFileChange(event) {
    const file = event.target.files?.[0] || null;
    currentDesignFile = file;
    const preview = document.getElementById('designFilePreview');
    const previewImg = document.getElementById('designFilePreviewImg');
    if (!preview || !previewImg) return;

    if (!file) {
        preview.classList.add('hidden');
        previewImg.src = '';
        return;
    }

    previewImg.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
}

function handleEditDesignFileChange(event) {
    const file = event.target.files?.[0] || null;
    currentEditDesignFile = file;
    const preview = document.getElementById('editDesignFilePreview');
    const previewImg = document.getElementById('editDesignFilePreviewImg');
    if (!preview || !previewImg) return;

    if (!file) {
        preview.classList.add('hidden');
        previewImg.src = '';
        return;
    }

    previewImg.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
}

function setSavingButtonState(button, isSaving) {
    if (!button) return;
    if (isSaving) {
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }
        button.disabled = true;
        button.textContent = 'جاري الحفظ...';
    } else {
        button.disabled = false;
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

async function uploadDesignFile(file) {
    if (!file) return null;
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
    const filePath = `item-design-files/${fileName}`;
    const { error } = await _supabase.storage.from(DESIGN_FILE_BUCKET).upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
    });
    if (error) {
        throw new Error(`Upload error: ${error.message || error.details || JSON.stringify(error)}`);
    }
    const { data: publicData, error: publicError } = _supabase.storage.from(DESIGN_FILE_BUCKET).getPublicUrl(filePath);
    if (publicError) {
        throw new Error(`Public URL error: ${publicError.message || publicError.details || JSON.stringify(publicError)}`);
    }
    if (!publicData || !publicData.publicUrl) {
        throw new Error('لم يتم الحصول على رابط الصورة العام بعد الرفع. راجع إعدادات الباكت.');
    }
    return publicData.publicUrl;
}

// عرض تصاميم العناصر في الجدول
function renderItemDesignsTable() {
    const tbody = document.getElementById('itemDesignsTableBody');
    if (!tbody) return;
    if (!itemDesigns || itemDesigns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-gray-500">لا توجد تصاميم لهذه الفاتورة بعد.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();
    itemDesigns.forEach(design => {
        const invoiceItem = getInvoiceItemById(design.item_id);
        const itemName = invoiceItem ? invoiceItem.item_name || `Item ${design.item_id}` : `Item ${design.item_id}`;
        const approvalStatus = design.is_approved ? 'موافق عليه' : 'غير موافق عليه';

        const designFileCell = design.file_url ? `<a href="${design.file_url}" target="_blank" class="text-blue-600 hover:underline">عرض الملف</a>` : '-';
        const specifications = design.specifications || '-';asset_type_id
        const assetTypeName = design.asset_type_id ? (assetTypes.find(type => type.id === design.asset_type_id)?.name || design.asset_type_id) : '-';
        const createdAt = design.created_at ? new Date(design.created_at).toLocaleString('en-US', { hour12: false }) : '-';

        const row = document.createElement('tr');
        row.className = 'border-b hover:bg-blue-50 transition';
        row.innerHTML = `
            <td class="p-4 text-sm text-gray-700">${itemName}</td>
            <td class="p-4 text-sm text-gray-700">${designFileCell}</td>
            <td class="p-4 text-sm text-gray-700">${specifications}</td>
            <td class="p-4 text-sm text-gray-700">${assetTypeName}</td>
            <td class="p-4 text-sm text-gray-700">${design.version_number || '-'}</td>
            <td class="p-4 text-sm text-gray-700">${approvalStatus}</td>
            <td class="p-4 text-sm text-gray-700">${createdAt}</td>
            <td class="p-4 text-sm text-gray-700">${design.admin_notes || '-'}</td>
            <td class="p-4 text-left whitespace-nowrap">
                <button onclick="editItemDesign('${design.id}')" class="bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700 text-sm mr-2">تعديل</button>
            </td>
        `;
        fragment.appendChild(row);
    });
    tbody.appendChild(fragment);
}

// تحميل تفاصيل الفاتورة
async function loadInvoiceDetails() {
    const { data: invoiceData, error: invoiceError } = await _supabase.from('invoices').select('*, customers(customer_custom_id, full_name)').eq('id', currentInvoiceId).single();
    if (invoiceError) { alert('خطأ في جلب الفاتورة'); return; }

    document.getElementById('invoiceNumberDisplay').textContent = invoiceData.invoice_number || '-';
    document.getElementById('invoiceCustomerDisplay').textContent = invoiceData.customers?.customer_custom_id || '-';
    document.getElementById('invoiceCustomerNameDisplay').textContent = invoiceData.customers?.full_name ? `- ${invoiceData.customers.full_name}` : '';
    document.getElementById('invoiceIdDisplay').textContent = invoiceData.id || '-';

    // تحديث رابط العودة
    const backLink = document.getElementById('backToInvoiceItemsLink');
    if (backLink) {
        backLink.href = `invoice_items.html?invoice_id=${currentInvoiceId}`;
    }
}

// تحميل عناصر الفاتورة
async function loadInvoiceItems() {
    const { data, error } = await _supabase.from('invoice_items').select('id, item_name').eq('invoice_id', currentInvoiceId).order('created_at', { ascending: true });
    if (error) { console.error(error.message); return; }
    invoiceItemsLookup = data || [];
    renderInvoiceItemsOptions();
}

// تحميل تصاميم العناصر
async function loadItemDesigns() {
    if (!invoiceItemsLookup || invoiceItemsLookup.length === 0) {
        itemDesigns = [];
        renderItemDesignsTable();
        return;
    }

    const { data, error } = await _supabase.from('item_designs').select('id, item_id, file_url, specifications, asset_type_id, version_number, is_approved, admin_notes, created_at').in('item_id', invoiceItemsLookup.map(item => item.id)).order('created_at', { ascending: false });
    if (error) { console.error(error.message); return; }
    itemDesigns = data || [];
    renderItemDesignsTable();
}

// إضافة تصميم جديد
async function addItemDesign(event) {
    event.preventDefault();
    if (!currentInvoiceId) return;

    const submitButton = document.getElementById('itemDesignSubmitButton');
    setSavingButtonState(submitButton, true);

    const payload = {
        item_id: document.getElementById('designItemId').value,
        version_number: parseInt(document.getElementById('designVersionNumber').value) || 1,
        is_approved: document.getElementById('designIsApproved').value === 'true',
        admin_notes: document.getElementById('designAdminNotes').value,
        specifications: document.getElementById('designSpecifications').value,
        asset_type_id: document.getElementById('designAssetTypeId').value || null
    };

    try {
        if (currentDesignFile) {
            payload.file_url = await uploadDesignFile(currentDesignFile);
        }

        const { error } = await _supabase.from('item_designs').insert([payload]);
        if (error) throw error;

        alert('تم حفظ التصميم بنجاح');
        document.getElementById('itemDesignForm').reset();
        currentDesignFile = null;
        const fileInput = document.getElementById('designFile');
        if (fileInput) fileInput.value = '';
        const preview = document.getElementById('designFilePreview');
        if (preview) preview.classList.add('hidden');
        await loadItemDesigns();
    } catch (err) {
        alert('خطأ: ' + err.message);
    } finally {
        setSavingButtonState(submitButton, false);
    }
}

// تعديل تصميم
async function editItemDesign(designId) {
    const design = itemDesigns.find(d => d.id === designId);
    if (!design) return;

    document.getElementById('editDesignId').value = design.id;
    document.getElementById('editDesignItemId').value = design.item_id;
    document.getElementById('editDesignVersionNumber').value = design.version_number;
    document.getElementById('editDesignIsApproved').value = design.is_approved ? 'true' : 'false';
    document.getElementById('editDesignAdminNotes').value = design.admin_notes || '';
    document.getElementById('editDesignSpecifications').value = design.specifications || '';
    document.getElementById('editDesignAssetTypeId').value = design.asset_type_id || '';

    const preview = document.getElementById('editDesignFilePreview');
    const previewImg = document.getElementById('editDesignFilePreviewImg');
    if (preview && previewImg) {
        if (design.file_url) {
            previewImg.src = design.file_url;
            preview.classList.remove('hidden');
        } else {
            previewImg.src = '';
            preview.classList.add('hidden');
        }
    }

    currentEditDesignFile = null;
    const fileInput = document.getElementById('editDesignFile');
    if (fileInput) fileInput.value = '';

    document.getElementById('editDesignModal').classList.remove('hidden');
}

async function saveEditItemDesign(event) {
    event.preventDefault();

    const submitButton = document.getElementById('editDesignSubmitButton');
    setSavingButtonState(submitButton, true);

    const designId = document.getElementById('editDesignId').value;
    const payload = {
        item_id: document.getElementById('editDesignItemId').value,
        version_number: parseInt(document.getElementById('editDesignVersionNumber').value) || 1,
        is_approved: document.getElementById('editDesignIsApproved').value === 'true',
        admin_notes: document.getElementById('editDesignAdminNotes').value,
        specifications: document.getElementById('editDesignSpecifications').value,
        asset_type_id: document.getElementById('editDesignAssetTypeId').value || null
    };

    try {
        if (currentEditDesignFile) {
            payload.file_url = await uploadDesignFile(currentEditDesignFile);
        }

        const { error } = await _supabase.from('item_designs').update(payload).eq('id', designId);
        if (error) throw error;

        alert('تم تعديل التصميم بنجاح');
        closeEditModal();
        await loadItemDesigns();
    } catch (err) {
        alert('خطأ: ' + err.message);
    } finally {
        setSavingButtonState(submitButton, false);
    }
}

function closeEditModal() {
    document.getElementById('editDesignModal').classList.add('hidden');
}

// تشغيل عند التحميل
function initItemDesignsPage() {
    const params = new URLSearchParams(window.location.search);
    currentInvoiceId = params.get('invoice_id');

    if (!currentInvoiceId) {
        alert('لا يوجد معرف فاتورة');
        window.location.href = 'invoices.html';
        return;
    }

    // ربط الأحداث
    document.getElementById('itemDesignForm').addEventListener('submit', addItemDesign);
    document.getElementById('editDesignForm').addEventListener('submit', saveEditItemDesign);
    const designFileInput = document.getElementById('designFile');
    if (designFileInput) designFileInput.addEventListener('change', handleDesignFileChange);
    const editDesignFileInput = document.getElementById('editDesignFile');
    if (editDesignFileInput) editDesignFileInput.addEventListener('change', handleEditDesignFileChange);

    loadInvoiceDetails();
    Promise.all([loadInvoiceItems(), loadAssetTypes()]).then(() => loadItemDesigns());
}

window.addEventListener('DOMContentLoaded', initItemDesignsPage);