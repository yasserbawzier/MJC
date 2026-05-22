let hot;
let gridData = [];
let invoiceItemsLookup = [];
let availableItemPhotos = [];
let assetTypes = [];
let currentInvoiceId = null;

// دالة تنسيق الأرقام
function formatNumber(value) {
    if (value === null || value === undefined || value === '') return '-';
    return Number(value).toLocaleString('en-US');
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

// تحميل عناصر الفاتورة وصورها المتاحة
async function loadAvailableItems() {
    // 1. Fetch invoice items
    const { data: invoiceItems, error: itemsError } = await _supabase.from('invoice_items').select('id, item_name').eq('invoice_id', currentInvoiceId);
    if (itemsError) { console.error(itemsError); return; }
    invoiceItemsLookup = invoiceItems || [];

    if (invoiceItemsLookup.length === 0) {
        availableItemPhotos = [];
        return;
    }

    const itemIds = invoiceItemsLookup.map(i => i.id);

    // 2. Fetch item_photos for these items
    const { data: photos, error: photosError } = await _supabase.from('item_photos').select('id, item_id, invoice_items(item_name)').in('item_id', itemIds);
    if (photosError) { console.error(photosError); return; }
    
    availableItemPhotos = (photos || []).map(p => ({
        id: p.id,
        name: p.invoice_items ? p.invoice_items.item_name : 'عنصر غير معروف'
    }));
}

async function loadAssetTypes() {
    const { data, error } = await _supabase.from('asset_types').select('*').order('created_at', { ascending: false });
    if (error) {
        console.error(error.message);
        assetTypes = [];
        return;
    }
    assetTypes = data || [];
    
    // Populate dropdown
    const select = document.getElementById('elementAssetTypeId');
    if (select) {
        select.innerHTML = '<option value="">اختر نوع العنصر...</option>';
        assetTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.name || `Asset ${type.id}`;
            select.appendChild(option);
        });
    }
}

// تحميل تصاميم العناصر (باستخدام الجدول الجديد design_assets)
async function loadItemDesigns() {
    if (availableItemPhotos.length === 0) {
        gridData = [];
        hot.loadData(gridData);
        return;
    }

    const photoIds = availableItemPhotos.map(p => p.id);

    try {
        const { data, error } = await _supabase
            .from('design_assets')
            .select(`
                id,
                design_details,
                item_photos (
                    client_photo_url,
                    design_photo_url,
                    dieline_photo_url,
                    invoice_items ( item_name )
                ),
                design_elements (
                    id,
                    asset_type_id,
                    image_url,
                    color_code,
                    additional_specifications,
                    is_approved,
                    display_order,
                    asset_types ( name )
                )
            `)
            .in('design_id', photoIds)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Map the nested data to a flat structure for Handsontable
        gridData = data.map(row => {
            const itemPhotos = row.item_photos || {};
            const invoiceItems = itemPhotos.invoice_items || {};
            
            // Filter only approved elements
            const approvedElements = (row.design_elements || []).filter(el => el.is_approved === true);
            
            return {
                id: row.id,
                item_name: invoiceItems.item_name || '-',
                client_photo: itemPhotos.client_photo_url || '',
                design_photo: itemPhotos.design_photo_url || '',
                dieline_photo: itemPhotos.dieline_photo_url || '',
                design_details: row.design_details || '',
                display_order: approvedElements.length > 0 ? approvedElements[0].display_order : 1, // Fallback if needed
                elements: approvedElements
            };
        });

        hot.loadData(gridData);
        // Update dropdown source if grid is initialized
        if (hot && availableItemPhotos.length > 0) {
            hot.updateSettings({
                columns: getColumnsConfig()
            });
        }

    } catch (err) {
        console.error("Error loading designs:", err);
        alert("حدث خطأ أثناء تحميل بيانات التصاميم. هل تأكدت من تفعيل جداول design_assets الجديدة؟");
    }
}

// Custom renderer for images
function imageRenderer(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.BaseRenderer.apply(this, arguments);
    td.style.verticalAlign = 'middle';
    td.style.textAlign = 'center';

    if (value) {
        td.innerHTML = `<img src="${value}" class="grid-image" onclick="openImageModal('${value}')" alt="Photo" onerror="this.src='https://via.placeholder.com/60?text=No+Image'"/>`;
    } else {
        td.innerHTML = '<span style="color:#ccc; font-size:12px;">لا يوجد</span>';
    }
    return td;
}

// Custom renderer for design elements
function elementsRenderer(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.BaseRenderer.apply(this, arguments);
    td.style.verticalAlign = 'top'; // Align to top for bigger badges
    td.style.whiteSpace = 'normal';
    td.style.padding = '8px';
    
    if (value && Array.isArray(value) && value.length > 0) {
        let html = '<div class="flex flex-wrap gap-3 justify-center">';
        value.forEach(el => {
            const typeName = el.asset_types ? el.asset_types.name : 'عنصر';
            const displayOrder = el.display_order || 1;
            
            const imgHtml = el.image_url ? `
                <img src="${el.image_url}" class="w-full h-24 rounded-lg object-cover border border-gray-300 cursor-pointer hover:opacity-90 transition shadow-sm mb-2" onclick="openImageModal('${el.image_url}'); event.stopPropagation();" title="عرض الصورة مكبرة"/>
            ` : '';
            
            const colorHtml = el.color_code ? `
                <div class="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-gray-200 shadow-sm mb-2 w-full justify-center">
                    <span class="w-5 h-5 rounded-full border border-gray-300 shadow-sm" style="background-color: ${el.color_code};" title="${el.color_code}"></span>
                    <span class="text-[10px] font-mono text-gray-700 uppercase font-bold">${el.color_code}</span>
                </div>
            ` : '';
            
            const specsHtml = el.additional_specifications ? `
                <div class="w-full bg-white p-2 rounded-lg border border-gray-200 shadow-sm text-center">
                    <p class="text-[10px] text-gray-800 leading-relaxed whitespace-pre-wrap m-0">${el.additional_specifications}</p>
                </div>
            ` : '';

            const headerBadge = `<span class="text-[10px] bg-blue-100 text-blue-800 px-3 py-1 rounded-md font-bold border border-blue-200 shadow-sm w-full text-center mb-1">${typeName}</span>
            <span class="text-[9px] text-gray-500 font-bold mb-3">تصميم #${displayOrder}</span>`;

            html += `
                <div class="flex flex-col items-center p-2.5 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition w-[140px] shrink-0 h-max shadow-sm" title="اضغط لتعديل العنصر" onclick="openEditElementModal('${el.id}')">
                    ${headerBadge}
                    ${imgHtml}
                    ${colorHtml}
                    ${specsHtml}
                </div>
            `;
        });
        html += '</div>';
        td.innerHTML = html;
    } else {
        td.innerHTML = '<span style="color:#ccc; font-size:12px;">لا توجد عناصر</span>';
    }
    return td;
}

function actionsRenderer(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.BaseRenderer.apply(this, arguments);
    td.style.verticalAlign = 'middle';
    td.style.textAlign = 'center';
    
    if (value) {
        const itemName = instance.getDataAtRowProp(row, 'item_name');
        const safeItemName = itemName ? itemName.replace(/'/g, "\\'") : '';
        td.innerHTML = `
            <div class="flex flex-col gap-1.5 justify-center items-center h-full py-1">
                <button onclick="openManageElementsModal('${value}')" class="bg-purple-600 text-white px-2 py-1.5 rounded-lg hover:bg-purple-700 text-[10px] font-bold transition shadow-sm border border-purple-800 w-full max-w-[100px]">إضافة عنصر ➕</button>
                <a href="product_history.html?invoice_id=${currentInvoiceId}&item=${encodeURIComponent(itemName)}" class="bg-blue-600 text-white px-2 py-1.5 rounded-lg hover:bg-blue-700 text-[10px] font-bold transition shadow-sm border border-blue-800 w-full max-w-[100px] text-center inline-block">عرض التصاميم 🖼️</a>
            </div>
        `;
    } else {
        td.innerHTML = '';
    }
    return td;
}

function getColumnsConfig() {
    return [
        { data: 'display_order', type: 'numeric', className: 'htCenter htMiddle', width: 60 },
        { 
            data: 'item_name', 
            type: 'dropdown', 
            source: availableItemPhotos.map(a => a.name),
            className: 'htCenter htMiddle font-bold', 
            width: 150 
        },
        { data: 'client_photo', renderer: imageRenderer, readOnly: true, width: 80 },
        { data: 'design_photo', renderer: imageRenderer, readOnly: true, width: 80 },
        { data: 'dieline_photo', renderer: imageRenderer, readOnly: true, width: 80 },
        { data: 'design_details', type: 'text', className: 'htMiddle', width: 250 },
        { data: 'elements', renderer: elementsRenderer, readOnly: true, width: 300 },
        { data: 'id', renderer: actionsRenderer, readOnly: true, width: 120 }
    ];
}

function initGrid() {
    const container = document.getElementById('designsGrid');

    hot = new Handsontable(container, {
        data: gridData,
        rowHeaders: true,
        colHeaders: [
            'الترتيب',
            'اسم العنصر',
            'صورة العميل',
            'صورة الديزاين',
            'صورة الدايلن',
            'تفاصيل التصميم',
            'العناصر المعتمدة',
            'إجراءات'
        ],
        columns: getColumnsConfig(),
        layoutDirection: 'rtl',
        width: '100%',
        height: '100%',
        rowHeights: autoRowHeight, // Auto adjusting height
        manualColumnResize: true,
        manualRowResize: true,
        filters: true,
        dropdownMenu: true,
        contextMenu: ['copy', 'alignment'],
        licenseKey: 'non-commercial-and-evaluation',
        afterChange: async function (changes, source) {
            if (source === 'loadData' || !changes) return;

            for (const [row, prop, oldValue, newValue] of changes) {
                if (oldValue !== newValue) {
                    const record = hot.getSourceDataAtRow(row);
                    const updateData = {};
                    
                    if (prop === 'item_name') {
                        const selectedItem = availableItemPhotos.find(a => a.name === newValue);
                        if (selectedItem) {
                            updateData['design_id'] = selectedItem.id;
                        } else {
                            continue;
                        }
                    } else if (prop === 'display_order' || prop === 'design_details') {
                        updateData[prop] = newValue;
                    } else {
                        continue;
                    }
                    
                    try {
                        const { error } = await _supabase
                            .from('design_assets')
                            .update(updateData)
                            .eq('id', record.id);
                            
                        if (error) {
                            console.error('Update error:', error);
                            alert('فشل في تحديث البيانات');
                        } else if (prop === 'item_name') {
                            // Reload to fetch the associated photos
                            loadItemDesigns();
                        }
                    } catch (err) {
                        console.error('Error updating:', err);
                    }
                }
            }
        }
    });
}

window.addNewRowToDatabase = async function() {
    if (availableItemPhotos.length === 0) {
        alert('لا توجد عناصر في هذه الفاتورة لربط التصاميم بها. أضف عناصر للفاتورة أولاً.');
        return;
    }

    // نختار أول عنصر كعنصر افتراضي حتى يظهر السطر في الجدول، ويمكن للمستخدم تغييره لاحقاً
    const defaultDesignId = availableItemPhotos[0].id;

    try {
        const { data, error } = await _supabase
            .from('design_assets')
            .insert([{ 
                design_id: defaultDesignId,
                design_details: 'تصميم جديد'
            }])
            .select();

        if (error) throw error;
        
        await loadItemDesigns();
    } catch (error) {
        console.error('Error adding row:', error);
        alert('حدث خطأ أثناء إضافة السطر. تأكد من تفعيل جداول design_assets الجديدة.');
    }
}

function autoRowHeight(index) {
    return undefined;
}

// Modal functions
window.openManageElementsModal = function(designAssetId) {
    document.getElementById('currentDesignAssetId').value = designAssetId;
    document.getElementById('currentEditElementId').value = '';
    document.getElementById('addElementForm').reset();
    document.getElementById('elementImagePreviewContainer').classList.add('hidden');
    document.getElementById('manageElementsModalTitle').textContent = 'إضافة عنصر للتصميم';
    document.getElementById('manageElementsModal').classList.remove('hidden');
}

window.openEditElementModal = function(elementId) {
    let targetElement = null;
    let targetDesignId = null;
    
    for (const row of gridData) {
        const el = row.elements.find(e => e.id === elementId);
        if (el) {
            targetElement = el;
            targetDesignId = row.id;
            break;
        }
    }
    
    if (!targetElement) return;

    document.getElementById('currentDesignAssetId').value = targetDesignId;
    document.getElementById('currentEditElementId').value = targetElement.id;
    
    document.getElementById('elementAssetTypeId').value = targetElement.asset_type_id || '';
    document.getElementById('elementSpecs').value = targetElement.additional_specifications || '';
    document.getElementById('elementIsApproved').checked = targetElement.is_approved;
    
    if (targetElement.color_code) {
        document.getElementById('useElementColor').checked = true;
        document.getElementById('elementColor').value = targetElement.color_code;
    } else {
        document.getElementById('useElementColor').checked = false;
        document.getElementById('elementColor').value = '#000000';
    }

    if (targetElement.image_url) {
        document.getElementById('elementImagePreview').src = targetElement.image_url;
        document.getElementById('elementImagePreviewContainer').classList.remove('hidden');
    } else {
        document.getElementById('elementImagePreviewContainer').classList.add('hidden');
    }
    
    document.getElementById('manageElementsModalTitle').textContent = 'تعديل العنصر';
    document.getElementById('manageElementsModal').classList.remove('hidden');
}

window.closeManageElementsModal = function() {
    document.getElementById('manageElementsModal').classList.add('hidden');
    document.getElementById('currentDesignAssetId').value = '';
    document.getElementById('currentEditElementId').value = '';
}

async function uploadDesignFileToBucket(file) {
    const DESIGN_FILE_BUCKET = 'product-images';
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `item-design-files/${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
    const { error } = await _supabase.storage.from(DESIGN_FILE_BUCKET).upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
    });
    if (error) throw new Error(`Upload error: ${error.message}`);

    const { data: publicData } = _supabase.storage.from(DESIGN_FILE_BUCKET).getPublicUrl(fileName);
    return publicData.publicUrl;
}

// Auto-calculate next display_order when asset type is selected for a NEW element
document.getElementById('elementAssetTypeId').addEventListener('change', async function(e) {
    const assetTypeId = e.target.value;
    const isEdit = document.getElementById('currentEditElementId').value !== '';
    const designAssetId = document.getElementById('currentDesignAssetId').value;
    const displayOrderInput = document.getElementById('elementDisplayOrder');
    
    if (isEdit || !assetTypeId || !designAssetId || !displayOrderInput) return;

    displayOrderInput.placeholder = "جاري الحساب...";

    let itemName = null;
    for (const row of gridData) {
        if (row.id === designAssetId) {
            itemName = row.item_name;
            break;
        }
    }
    if (!itemName) return;

    let maxOrder = 0;
    for (const row of gridData) {
        if (row.item_name === itemName) {
            row.elements.forEach(el => {
                if (el.asset_type_id === assetTypeId) {
                    const elOrder = el.display_order || 1;
                    if (elOrder > maxOrder) maxOrder = elOrder;
                }
            });
        }
    }
    
    displayOrderInput.value = maxOrder + 1;
});

document.getElementById('addElementForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const designAssetId = document.getElementById('currentDesignAssetId').value;
    const assetTypeId = document.getElementById('elementAssetTypeId').value;
    const file = document.getElementById('elementImage').files[0];
    const useColor = document.getElementById('useElementColor').checked;
    const color = useColor ? document.getElementById('elementColor').value : null;
    const specs = document.getElementById('elementSpecs').value;
    const isApproved = document.getElementById('elementIsApproved').checked;
    const displayOrder = document.getElementById('elementDisplayOrder') ? parseInt(document.getElementById('elementDisplayOrder').value) : 1;

    if (!designAssetId || !assetTypeId) {
        alert('يجب تحديد السطر ونوع العنصر');
        return;
    }

    const submitBtn = document.getElementById('submitAddElementBtn');
    const spinner = document.getElementById('submitElementSpinner');
    submitBtn.disabled = true;
    spinner.classList.remove('hidden');

    try {
        let imageUrl = null;
        if (file) {
            imageUrl = await uploadDesignFileToBucket(file);
        }

        const payload = {
            design_asset_id: designAssetId,
            asset_type_id: assetTypeId,
            color_code: color,
            additional_specifications: specs,
            is_approved: isApproved,
            display_order: displayOrder
        };
        
        if (imageUrl !== null) {
            payload.image_url = imageUrl;
        }

        const editId = document.getElementById('currentEditElementId').value;
        if (editId) {
            const { error } = await _supabase.from('design_elements').update(payload).eq('id', editId);
            if (error) throw error;
            alert('تم تعديل العنصر بنجاح!');
        } else {
            const { error } = await _supabase.from('design_elements').insert([payload]);
            if (error) throw error;
            alert('تم إضافة العنصر بنجاح!');
        }

        closeManageElementsModal();
        await loadItemDesigns(); // Reload grid
    } catch (err) {
        console.error('Error adding element:', err);
        alert('خطأ: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        spinner.classList.add('hidden');
    }
});

document.getElementById('elementImage').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const previewContainer = document.getElementById('elementImagePreviewContainer');
    const previewImg = document.getElementById('elementImagePreview');
    if (file) {
        previewImg.src = URL.createObjectURL(file);
        previewContainer.classList.remove('hidden');
    }
});



window.openImageModal = function(src) {
    if(!src) return;
    const modal = document.getElementById('imagePreviewModal');
    const modalImg = document.getElementById('modalPreviewImage');
    if(!modal || !modalImg) return;
    modalImg.src = src;
    modal.classList.remove('hidden');
}

window.closeImageModal = function() {
    const modal = document.getElementById('imagePreviewModal');
    if(!modal) return;
    modal.classList.add('hidden');
    document.getElementById('modalPreviewImage').src = '';
}

// Close modal on Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeImageModal();
    }
});

// تشغيل عند التحميل
function initItemDesignsPage() {
    const params = new URLSearchParams(window.location.search);
    currentInvoiceId = params.get('invoice_id');

    if (!currentInvoiceId) {
        alert('لا يوجد معرف فاتورة');
        window.location.href = 'invoices.html';
        return;
    }

    loadInvoiceDetails();
    initGrid();
    Promise.all([loadAvailableItems(), loadAssetTypes()]).then(() => loadItemDesigns());
}

window.addEventListener('DOMContentLoaded', initItemDesignsPage);