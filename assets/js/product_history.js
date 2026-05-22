/**
 * State Management
 */
const State = {
    elementsMap: {},
    itemName: null
};

/**
 * DOM Elements Cache
 */
const DOM = {
    container: null,
    topImageContainer: null,
    historyProductName: null,
    modal: {
        container: null,
        assetTypeId: null,
        specs: null,
        isApproved: null,
        displayOrder: null,
        useColor: null,
        colorContainer: null,
        color: null,
        imagePreviewContainer: null,
        imagePreview: null,
        editId: null,
        imageFile: null,
        submitBtn: null,
        spinner: null
    }
};

/**
 * Initialization
 */
document.addEventListener('DOMContentLoaded', () => {
    if (typeof _supabase === 'undefined') {
        console.error('Supabase client is not initialized in App.js');
        return;
    }

    cacheDOM();
    
    const urlParams = new URLSearchParams(window.location.search);
    State.itemName = urlParams.get('item');

    if (!State.itemName) {
        showError('لم يتم تحديد المنتج. يرجى الرجوع والمحاولة مجدداً.');
        return;
    }

    DOM.historyProductName.textContent = State.itemName;
    
    loadHistory();
    loadAssetTypes();
    setupDragScroll();
    setupEventListeners();
});

function cacheDOM() {
    DOM.container = document.getElementById('productDesignsContainer');
    DOM.topImageContainer = document.getElementById('topProductImageContainer');
    DOM.historyProductName = document.getElementById('historyProductName');
    
    // Modal
    DOM.modal.container = document.getElementById('manageElementsModal');
    DOM.modal.assetTypeId = document.getElementById('elementAssetTypeId');
    DOM.modal.specs = document.getElementById('elementSpecs');
    DOM.modal.isApproved = document.getElementById('elementIsApproved');
    DOM.modal.displayOrder = document.getElementById('elementDisplayOrder');
    DOM.modal.useColor = document.getElementById('useElementColor');
    DOM.modal.colorContainer = document.getElementById('colorInputContainer');
    DOM.modal.color = document.getElementById('elementColor');
    DOM.modal.imagePreviewContainer = document.getElementById('elementImagePreviewContainer');
    DOM.modal.imagePreview = document.getElementById('elementImagePreview');
    DOM.modal.editId = document.getElementById('currentEditElementId');
    DOM.modal.imageFile = document.getElementById('elementImage');
    DOM.modal.submitBtn = document.getElementById('submitAddElementBtn');
    DOM.modal.spinner = document.getElementById('submitElementSpinner');
}

/**
 * Main Controller
 */
async function loadHistory() {
    showLoading();
    try {
        const data = await fetchHistoryData(State.itemName);
        if (!data) return;

        const processedData = processHistoryData(data.photos, data.designs, data.invoiceItems);
        renderHistoryBoard(processedData.categories, processedData.elementsGroups, processedData.topImageUrl);
    } catch (err) {
        console.error('Error in loadHistory:', err);
        showError('حدث خطأ أثناء تحميل السجل.');
    }
}

/**
 * Data Fetching
 */
async function fetchHistoryData(itemName) {
    const { data: invoiceItems, error: itemsError } = await _supabase.from('invoice_items')
        .select('id, invoice_id, invoices(invoice_number, created_at)')
        .eq('item_name', itemName);
    if (itemsError) throw itemsError;
    if (!invoiceItems || invoiceItems.length === 0) {
        showEmptyState();
        return null;
    }

    const itemIds = invoiceItems.map(i => i.id);

    const { data: photos, error: photosError } = await _supabase.from('item_photos')
        .select('id, item_id, client_photo_url, design_photo_url, dieline_photo_url')
        .in('item_id', itemIds);
    if (photosError) throw photosError;
    if (!photos || photos.length === 0) {
        showEmptyState();
        return null;
    }

    const photoIds = photos.map(p => p.id);

    const { data: designs, error: designsError } = await _supabase.from('design_assets')
        .select(`
            id, design_id, design_details, created_at,
            design_elements ( id, design_asset_id, asset_type_id, image_url, color_code, additional_specifications, is_approved, display_order, asset_types(name) )
        `)
        .in('design_id', photoIds)
        .order('created_at', { ascending: false });
    if (designsError) throw designsError;

    return { invoiceItems, photos, designs: designs || [] };
}

/**
 * Data Processing
 */
function processHistoryData(photos, designs, invoiceItems) {
    const categories = {
        'الديزاين الأساسي': [],
        'الدايلن الأساسي': []
    };
    const elementsGroups = {};
    let topImageUrl = null;
    
    State.elementsMap = {}; // Reset state for fresh load

    designs.forEach(design => {
        const photo = photos.find(p => p.id === design.design_id);
        const invItem = invoiceItems.find(i => i.id === photo.item_id);
        
        const meta = { 
            invNum: invItem?.invoices?.invoice_number || '-', 
            invDate: invItem?.invoices ? new Date(invItem.invoices.created_at).toLocaleDateString('en-GB') : '-', 
            details: design.design_details 
        };

        // Determine Top Image
        if (photo.client_photo_url && !topImageUrl && !photo.design_photo_url) {
            topImageUrl = photo.client_photo_url;
        }
        
        if (photo.design_photo_url) {
            categories['الديزاين الأساسي'].push({ url: photo.design_photo_url, meta });
            if (!topImageUrl) topImageUrl = photo.design_photo_url;
        }
        
        if (photo.dieline_photo_url) {
            categories['الدايلن الأساسي'].push({ url: photo.dieline_photo_url, meta });
        }

        // Process Elements
        const allElements = design.design_elements || [];
        allElements.forEach(el => {
            const typeName = el.asset_types?.name || 'عنصر غير محدد';
            if (!elementsGroups[typeName]) elementsGroups[typeName] = [];
            
            const elData = {
                id: el.id,
                design_asset_id: el.design_asset_id,
                asset_type_id: el.asset_type_id,
                url: el.image_url,
                color_code: el.color_code,
                specs: el.additional_specifications,
                is_approved: el.is_approved,
                display_order: el.display_order || 1,
                meta
            };
            
            State.elementsMap[el.id] = elData;
            elementsGroups[typeName].push(elData);
        });
    });

    return { categories, elementsGroups, topImageUrl };
}

/**
 * UI Rendering
 */
function renderHistoryBoard(categories, elementsGroups, topImageUrl) {
    // Render Top Image
    if (topImageUrl) {
        DOM.topImageContainer.innerHTML = `<img src="${topImageUrl}" onclick="openImageModal('${topImageUrl}')" class="w-32 h-32 md:w-48 md:h-48 rounded-2xl object-cover shadow-lg border-4 border-white cursor-pointer hover:scale-105 transition" title="صورة المنتج (أحدث تصميم)" />`;
        DOM.topImageContainer.classList.remove('hidden');
    } else {
        DOM.topImageContainer.innerHTML = '';
        DOM.topImageContainer.classList.add('hidden');
    }

    let html = '';

    // Render Primary Designs (Main, Dieline)
    for (const [title, items] of Object.entries(categories)) {
        if (items.length === 0) continue;
        const itemsHtml = items.map(item => createDesignCardTemplate(item)).join('');
        html += createColumnTemplate(title, itemsHtml);
    }

    // Render Elements Groups
    for (const [typeName, items] of Object.entries(elementsGroups)) {
        if (items.length === 0) continue;
        const itemsHtml = items.map(el => createElementCardTemplate(el)).join('');
        html += createColumnTemplate(`عناصر: ${typeName}`, itemsHtml);
    }

    if (!html) {
        showEmptyState();
        return;
    }
    
    DOM.container.innerHTML = html;
}

/**
 * HTML Templates
 */
function createColumnTemplate(title, itemsHtml) {
    return `
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm min-w-[260px] w-64 flex flex-col shrink-0 h-max overflow-hidden hover:shadow-md transition">
            <div class="p-4 border-b border-gray-100 bg-gray-50 shrink-0">
                <h4 class="text-base font-bold text-gray-800 flex items-center gap-2">
                    <span class="w-2 h-5 bg-blue-500 rounded-full"></span>
                    ${title}
                </h4>
            </div>
            <div class="p-4 flex-1 flex flex-col gap-4">
                ${itemsHtml}
            </div>
        </div>
    `;
}

function createDesignCardTemplate(item) {
    const detailsHtml = item.meta.details 
        ? `<div class="mt-2 text-[10px] text-gray-600 bg-white p-2 rounded-lg border border-gray-100 text-right leading-relaxed">${item.meta.details}</div>` 
        : '';
        
    return `
        <div class="flex flex-col bg-gray-50 border border-gray-200 rounded-xl p-3 w-full relative shadow-sm">
            <img src="${item.url}" onclick="openImageModal('${item.url}')" class="w-full h-28 rounded-lg object-cover cursor-pointer hover:opacity-90 transition border border-gray-200 shadow-sm" title="اضغط للتكبير" />
            <div class="mt-3 flex justify-between items-center bg-white px-2 py-1 rounded-md shadow-sm border border-gray-100">
                <span class="text-[9px] font-bold text-gray-700">ف #${item.meta.invNum}</span>
                <span class="text-[9px] text-gray-500 font-mono">${item.meta.invDate}</span>
            </div>
            ${detailsHtml}
        </div>
    `;
}

function createElementCardTemplate(el) {
    const statusClass = el.is_approved ? 'border-blue-200 bg-blue-50' : 'border-red-200 bg-red-50 opacity-90';
    const statusBadge = el.is_approved 
        ? '<span class="text-[9px] bg-green-100 text-green-700 px-2 py-1 rounded-md font-bold border border-green-200 shadow-sm flex-1 text-center">معتمد ✓</span>' 
        : '<span class="text-[9px] bg-red-100 text-red-700 px-2 py-1 rounded-md font-bold border border-red-200 shadow-sm flex-1 text-center">غير معتمد ✗</span>';
    
    // Stop propagation on image click so it doesn't open the edit modal
    const imgHtml = el.url 
        ? `<img src="${el.url}" onclick="event.stopPropagation(); openImageModal('${el.url}')" class="w-full h-28 rounded-lg object-cover cursor-pointer hover:opacity-90 transition border border-gray-300 shadow-sm mb-3" />` 
        : '';
        
    const colorHtml = el.color_code 
        ? `<div class="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200 shadow-sm mb-3 w-full justify-center">
               <span class="w-6 h-6 rounded-full border border-gray-300 shadow-sm" style="background-color: ${el.color_code};" title="${el.color_code}"></span>
               <span class="text-xs font-mono text-gray-700 uppercase font-bold">${el.color_code}</span>
           </div>` 
        : '';
        
    const specsHtml = el.specs 
        ? `<div class="w-full bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm text-right mb-3">
               <p class="text-[11px] text-gray-800 leading-relaxed whitespace-pre-wrap">${el.specs}</p>
           </div>` 
        : '';

    const detailsHtml = el.meta.details 
        ? `<div class="w-full pt-2 border-t border-gray-200/50" title="تفاصيل التصميم الأساسي"><p class="text-[9px] text-gray-500 bg-white/60 p-2 rounded-lg leading-relaxed">${el.meta.details}</p></div>` 
        : '';

    return `
        <div class="flex flex-col items-center p-3 rounded-xl border ${statusClass} w-full shadow-sm hover:shadow-md transition cursor-pointer" onclick="openEditElementModal('${el.id}')" title="اضغط لتعديل العنصر">
            <div class="flex justify-between w-full items-center gap-2 mb-3">
                ${statusBadge}
                <div class="flex flex-col items-end shrink-0">
                    <span class="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-t-md shadow-sm font-extrabold border border-blue-100 border-b-0 w-full text-center">تصميم #${el.display_order}</span>
                    <span class="text-[9px] text-gray-600 bg-white px-2 py-0.5 shadow-sm font-bold border border-gray-100 border-b-0 w-full text-center">ف #${el.meta.invNum}</span>
                    <span class="text-[8px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-b-md shadow-sm border border-gray-100 font-mono w-full text-center">${el.meta.invDate}</span>
                </div>
            </div>
            ${imgHtml}
            ${colorHtml}
            ${specsHtml}
            ${detailsHtml}
        </div>
    `;
}

/**
 * UI Helpers
 */
function showLoading() {
    DOM.container.innerHTML = '<div class="text-center text-gray-500 font-bold w-full mt-10 text-xl">جاري التحميل...</div>';
}

function showEmptyState() {
    DOM.container.innerHTML = '<div class="text-center text-gray-500 w-full mt-10 text-xl font-bold">لا توجد بيانات تفصيلية مسجلة لهذا المنتج.</div>';
}

function showError(msg) {
    if(DOM.container) {
        DOM.container.innerHTML = `<div class="text-center text-red-500 w-full mt-10 text-xl font-bold">${msg}</div>`;
    }
}

/**
 * Image Modal
 */
window.openImageModal = function(src) {
    if(!src) return;
    const modal = document.getElementById('imagePreviewModal');
    document.getElementById('previewImage').src = src;
    modal.classList.remove('hidden');
}

window.closeImageModal = function() {
    document.getElementById('imagePreviewModal').classList.add('hidden');
    document.getElementById('previewImage').src = '';
}

/**
 * Drag to Scroll
 */
function setupDragScroll() {
    const slider = DOM.container;
    let isDown = false, startX, scrollLeft;

    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        slider.classList.add('active');
        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
    });
    slider.addEventListener('mouseleave', () => { isDown = false; slider.classList.remove('active'); });
    slider.addEventListener('mouseup', () => { isDown = false; slider.classList.remove('active'); });
    slider.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const walk = (e.pageX - slider.offsetLeft - startX) * 1.5;
        slider.scrollLeft = scrollLeft - walk;
    });
}

/**
 * Edit Element Logic
 */
async function loadAssetTypes() {
    const { data, error } = await _supabase.from('asset_types').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error.message);
    
    if (DOM.modal.assetTypeId) {
        DOM.modal.assetTypeId.innerHTML = '<option value="">اختر نوع العنصر...</option>';
        (data || []).forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.name;
            DOM.modal.assetTypeId.appendChild(option);
        });
    }
}

window.openEditElementModal = function(elementId) {
    const targetElement = State.elementsMap[elementId];
    if (!targetElement) return;

    DOM.modal.editId.value = targetElement.id;
    DOM.modal.assetTypeId.value = targetElement.asset_type_id || '';
    DOM.modal.specs.value = targetElement.specs || '';
    DOM.modal.isApproved.checked = targetElement.is_approved;
    if(DOM.modal.displayOrder) DOM.modal.displayOrder.value = targetElement.display_order || 1;
    
    if (targetElement.color_code) {
        DOM.modal.useColor.checked = true;
        DOM.modal.colorContainer.classList.remove('hidden');
        DOM.modal.color.value = targetElement.color_code;
    } else {
        DOM.modal.useColor.checked = false;
        DOM.modal.colorContainer.classList.add('hidden');
        DOM.modal.color.value = '#000000';
    }

    if (targetElement.url) {
        DOM.modal.imagePreview.src = targetElement.url;
        DOM.modal.imagePreviewContainer.classList.remove('hidden');
    } else {
        DOM.modal.imagePreviewContainer.classList.add('hidden');
    }
    
    DOM.modal.container.classList.remove('hidden');
}

window.closeManageElementsModal = function() {
    DOM.modal.container.classList.add('hidden');
    DOM.modal.editId.value = '';
}

async function uploadDesignFileToBucket(file) {
    const DESIGN_FILE_BUCKET = 'product-images';
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `item-design-files/${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
    const { error } = await _supabase.storage.from(DESIGN_FILE_BUCKET).upload(fileName, file, { cacheControl: '3600' });
    if (error) throw new Error(`Upload error: ${error.message}`);
    return _supabase.storage.from(DESIGN_FILE_BUCKET).getPublicUrl(fileName).data.publicUrl;
}

function setupEventListeners() {
    DOM.modal.imageFile.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            DOM.modal.imagePreview.src = URL.createObjectURL(file);
            DOM.modal.imagePreviewContainer.classList.remove('hidden');
        }
    });

    document.getElementById('addElementForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const assetTypeId = DOM.modal.assetTypeId.value;
        const file = DOM.modal.imageFile.files[0];
        const color = DOM.modal.useColor.checked ? DOM.modal.color.value : null;
        const specs = DOM.modal.specs.value;
        const isApproved = DOM.modal.isApproved.checked;
        const displayOrder = DOM.modal.displayOrder ? DOM.modal.displayOrder.value : 1;
        const editId = DOM.modal.editId.value;

        if (!editId || !assetTypeId) {
            alert('حدث خطأ. البيانات غير مكتملة.');
            return;
        }

        DOM.modal.submitBtn.disabled = true;
        DOM.modal.spinner.classList.remove('hidden');

        try {
            let imageUrl = null;
            if (file) imageUrl = await uploadDesignFileToBucket(file);

            const payload = {
                asset_type_id: assetTypeId,
                color_code: color,
                additional_specifications: specs,
                is_approved: isApproved,
                display_order: displayOrder,
            };
            if (imageUrl) payload.image_url = imageUrl;

            const { error } = await _supabase.from('design_elements').update(payload).eq('id', editId);
            if (error) throw error;

            closeManageElementsModal();
            await loadHistory(); 
        } catch (err) {
            console.error('Error updating element:', err);
            alert('خطأ: ' + err.message);
        } finally {
            DOM.modal.submitBtn.disabled = false;
            DOM.modal.spinner.classList.add('hidden');
        }
    });
}
