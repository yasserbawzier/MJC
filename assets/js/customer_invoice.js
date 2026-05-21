// فاتورة تجارية للعميل - منطق الاستعلام والعمليات المالية والحسابية والتحكم تفاعلياً بالأعمدة الـ 22
let currentInvoiceId = null;
let invoiceItems = [];
let productsLookup = [];
let itemPhotosLookup = {};

// قائمة الأعمدة الـ 22 لتسهيل إدارتها تفاعلياً
const ALL_COLUMNS = [
    { id: 'item', label: 'Item / مسلسل' },
    { id: 'productid', label: 'ProductID / رمز المنتج' },
    { id: 'productimage', label: 'Product Image / صورة المنتج' },
    { id: 'clientphoto', label: 'Client Photo / صورة العميل' },
    { id: 'designphoto', label: 'Design Photo / صورة التصميم' },
    { id: 'dielinephoto', label: 'Dieline Photo / صورة الدايلاين' },
    { id: 'designdetails', label: 'Design details / تفاصيل التصميم' },
    { id: 'size', label: 'Size / المقاس' },
    { id: 'specifications', label: 'Specifications / المواصفات' },
    { id: 'sample', label: 'Sample / العينة' },
    { id: 'production', label: 'Production / الإنتاج' },
    { id: 'moq', label: 'MOQ / الكمية المطلوبة' },
    { id: 'unit', label: 'Unit / الوحدة' },
    { id: 'unitprice', label: 'Unit Price USD / سعر القطعة واصل' },
    { id: 'totalamount', label: 'Total Amount USD / إجمالي الصنف واصل' },
    { id: 'qtyctn', label: 'Quantity/CTN / التعبئة لكل كرتون' },
    { id: 'ctn', label: 'CTN / الكراتين' },
    { id: 'gwctn', label: 'G.W./CTN KG / الوزن الإجمالي القائم' },
    { id: 'length', label: 'L / الطول (سم)' },
    { id: 'width', label: 'W / العرض (سم)' },
    { id: 'height', label: 'H / الارتفاع (سم)' },
    { id: 'cbmctn', label: 'CBM/CTN / حجم الكرتون' },
    { id: 'totalcbm', label: 'Total CBM / الحجم الكلي' }
];

// حالة رؤية الأعمدة المخزنة
let columnVisibility = {};

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    currentInvoiceId = params.get('invoice_id');

    if (!currentInvoiceId) {
        alert('حدث خطأ: معرف الفاتورة غير موجود في الرابط!');
        window.location.href = 'invoices.html';
        return;
    }

    // تعيين تاريخ اليوم تلقائياً بصيغة رسمية واضحة بالإنجليزية للفاتورة الدولية
    const today = new Date();
    document.getElementById('invoiceDateDisplay').textContent = today.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // استعادة حالة رؤية الأعمدة من localStorage
    ALL_COLUMNS.forEach(col => {
        const stored = localStorage.getItem(`col_visibility_${col.id}`);
        columnVisibility[col.id] = stored !== 'false'; // الافتراضي هو true
    });

    // بناء واجهة محدد الأعمدة تفاعلياً
    initColumnSelectorPanel();

    // تعيين رابط زر الرجوع لعناصر الفاتورة
    const backBtn = document.getElementById('backToManagerViewLink');
    if (backBtn) {
        backBtn.href = `invoice_items.html?invoice_id=${currentInvoiceId}`;
    }

    // جلب كافة بيانات الفاتورة
    await loadCustomerInvoiceData();
});

// تنسيق الأرقام
function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0.00';
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// فتح وإغلاق لوحة تحديد الأعمدة
function toggleColumnSelector() {
    const panel = document.getElementById('columnSelectorPanel');
    const icon = document.getElementById('selectorToggleIcon');
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        icon.textContent = '▲ إخفاء الخيارات / Hide Options';
    } else {
        panel.classList.add('hidden');
        icon.textContent = '▼ عرض الخيارات / Show Options';
    }
}

// بناء شبكة الخيارات التفاعلية للأعمدة الـ 22
function initColumnSelectorPanel() {
    const grid = document.getElementById('selectorGrid');
    if (!grid) return;
    grid.innerHTML = '';

    ALL_COLUMNS.forEach(col => {
        const isVisible = columnVisibility[col.id] !== false;

        const wrapper = document.createElement('label');
        wrapper.className = 'flex items-center gap-2.5 bg-slate-50 hover:bg-slate-100/80 px-3 py-2 rounded-xl border border-gray-150 cursor-pointer select-none transition-all duration-200 text-xs font-semibold text-gray-700';
        wrapper.innerHTML = `
            <input type="checkbox" id="chk_${col.id}" ${isVisible ? 'checked' : ''} onchange="toggleColumnVisibility('${col.id}', this.checked)" class="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 accent-emerald-600">
            <span>${col.label}</span>
        `;
        grid.appendChild(wrapper);
    });
}

// إخفاء وإظهار عمود معين
function toggleColumnVisibility(colId, isVisible) {
    columnVisibility[colId] = isVisible;
    localStorage.setItem(`col_visibility_${colId}`, isVisible);

    // تطبيق الإخفاء/الإظهار على كلاسات الخلايا المعنية
    const cells = document.querySelectorAll(`.col-${colId}`);
    cells.forEach(cell => {
        if (isVisible) {
            cell.style.display = '';
        } else {
            cell.style.display = 'none';
        }
    });
}

// تطبيق جميع الرؤى للأعمدة مرة واحدة
function applyAllColumnVisibilities() {
    ALL_COLUMNS.forEach(col => {
        const isVisible = columnVisibility[col.id] !== false;
        toggleColumnVisibility(col.id, isVisible);
    });
}

// تحديد الكل أو إخفاء الكل
function setAllColumns(isVisible) {
    ALL_COLUMNS.forEach(col => {
        const chk = document.getElementById(`chk_${col.id}`);
        if (chk) chk.checked = isVisible;
        toggleColumnVisibility(col.id, isVisible);
    });
}

// جلب البيانات من السحابة
async function loadCustomerInvoiceData() {
    try {
        const [
            { data: invoiceData, error: invoiceError },
            { data: itemsData, error: itemsError },
            { data: productsData, error: productsError }
        ] = await Promise.all([
            _supabase.from('invoices').select('*, customers(customer_custom_id, full_name, phone)').eq('id', currentInvoiceId).single(),
            _supabase.from('invoice_items').select('id, product_id, invoice_id, status, created_at, factory_price_per_unit, quantity, shipping_price_per_unit, fixed_commission_rate, qty_per_ctn, CTN, gw_per_ctn_kg, length_cm, width_cm, height_cm, size, specifications, sample, production, unit_type').eq('invoice_id', currentInvoiceId).eq('status', true).order('created_at', { ascending: true }),
            _supabase.from('products').select('id, product_name, product_custom_id, product_image_url')
        ]);

        if (invoiceError) throw invoiceError;
        if (itemsError) throw itemsError;
        if (productsError) throw productsError;

        productsLookup = productsData || [];
        invoiceItems = itemsData || [];

        // ملء ترويسة معلومات العميل والفاتورة الرسمية المحدثة
        document.getElementById('invoiceNumDisplay').textContent = invoiceData.invoice_number || '-';
        document.getElementById('customerName').textContent = invoiceData.customers?.full_name || '-';
        document.getElementById('customerId').textContent = invoiceData.customers?.customer_custom_id || '-';
        document.getElementById('customerContact').textContent = invoiceData.customers?.phone || '-';

        // جلب صور البنود الإضافية المخصصة
        const itemIds = invoiceItems.map(item => item.id).filter(Boolean);
        if (itemIds.length > 0) {
            const { data: photosData, error: photosError } = await _supabase
                .from('item_photos')
                .select('*')
                .in('item_id', itemIds);

            if (!photosError && photosData) {
                photosData.forEach(photo => {
                    itemPhotosLookup[photo.item_id] = photo;
                });
            }
        }

        // بناء وعرض الفاتورة التجارية
        renderCustomerInvoiceItems();

    } catch (err) {
        console.error('Error loading customer invoice:', err.message);
        alert('حدث خطأ أثناء معالجة الفاتورة للعميل: ' + err.message);
    }
}

// بناء صفوف الجدول وحساب المجاميع للعميل
function renderCustomerInvoiceItems() {
    const tbody = document.getElementById('customerInvoiceTableBody');
    if (!tbody) return;

    if (invoiceItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="23" class="p-8 text-center text-gray-500 font-bold">⚠️ لا توجد عناصر نشطة في هذه الفاتورة للتصدير حالياً.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    let grandPieces = 0;
    let grandCtn = 0;
    let grandGw = 0;
    let grandCbm = 0;
    let grandDeliveredTotal = 0;

    invoiceItems.forEach((item, index) => {
        const product = productsLookup.find(p => p.id === item.product_id);
        const itemPhoto = itemPhotosLookup[item.id] || {};

        // الحسابات المالية الدقيقة والمطابقة
        const factoryPrice = Number(item.factory_price_per_unit || 0);
        const qty = Number(item.quantity || 0);
        const shippingPerUnit = Number(item.shipping_price_per_unit || 0);
        const prodShippingUnit = factoryPrice + shippingPerUnit;

        const noteVal = localStorage.getItem(`notes_commission_${item.id}`) || 'factory';
        const commissionRate = Number(item.fixed_commission_rate || 0);

        let commissionPerUnit = 0;
        if (commissionRate > 0) {
            if (noteVal === 'factory') {
                commissionPerUnit = factoryPrice * commissionRate;
            } else {
                commissionPerUnit = prodShippingUnit * commissionRate;
            }
        }

        const unitLandedPrice = prodShippingUnit + commissionPerUnit;
        const totalLandedAmount = unitLandedPrice * qty;

        // حسابات التعبئة والشحن والكراتين والـ CBM
        const qtyPerCtn = Number(item.qty_per_ctn || 0);
        const ctnCount = Number(item.CTN || 0);
        const gwPerCtn = Number(item.gw_per_ctn_kg || 0);
        const lengthCm = Number(item.length_cm || 0);
        const widthCm = Number(item.width_cm || 0);
        const heightCm = Number(item.height_cm || 0);

        // حساب CBM لكل كرتون
        const cbmPerCtn = (lengthCm * widthCm * heightCm) / 1000000;
        const totalCbm = cbmPerCtn * ctnCount;

        grandPieces += qty;
        grandCtn += ctnCount;
        grandGw += (gwPerCtn * ctnCount);
        grandCbm += totalCbm;
        grandDeliveredTotal += totalLandedAmount;

        // تجهيز صورة المنتج الافتراضية وصور البند الثلاث بحجم أكبر (w-28 h-28) مع إمكانية التكبير والتأثيرات
        const productImageHtml = product && product.product_image_url
            ? `<img src="${product.product_image_url}" alt="Product Image" onclick="openImagePreview(this.src)" class="w-28 h-28 object-cover rounded-xl border border-gray-250 mx-auto shadow-sm hover:scale-110 hover:shadow-md cursor-zoom-in transition-all duration-200">`
            : '-';
        const clientPhotoHtml = itemPhoto.client_photo_url
            ? `<img src="${itemPhoto.client_photo_url}" alt="Client Photo" onclick="openImagePreview(this.src)" class="w-28 h-28 object-cover rounded-xl border border-gray-250 mx-auto shadow-sm hover:scale-110 hover:shadow-md cursor-zoom-in transition-all duration-200">`
            : '-';
        const designPhotoHtml = itemPhoto.design_photo_url
            ? `<img src="${itemPhoto.design_photo_url}" alt="Design Photo" onclick="openImagePreview(this.src)" class="w-28 h-28 object-cover rounded-xl border border-gray-250 mx-auto shadow-sm hover:scale-110 hover:shadow-md cursor-zoom-in transition-all duration-200">`
            : '-';
        const dielinePhotoHtml = itemPhoto.dieline_photo_url
            ? `<img src="${itemPhoto.dieline_photo_url}" alt="Dieline Photo" onclick="openImagePreview(this.src)" class="w-28 h-28 object-cover rounded-xl border border-gray-250 mx-auto shadow-sm hover:scale-110 hover:shadow-md cursor-zoom-in transition-all duration-200">`
            : '-';

        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50/50 transition text-xs border-b border-gray-100 font-mono';
        row.innerHTML = `
            <td class="p-3 text-center font-bold text-gray-400 col-item select-none">${index + 1}</td>
            <td class="p-3 font-bold text-slate-700 col-productid">${product?.product_custom_id || '-'}</td>
            <td class="p-3 text-center col-productimage">${productImageHtml}</td>
            <td class="p-3 text-center col-clientphoto">${clientPhotoHtml}</td>
            <td class="p-3 text-center col-designphoto">${designPhotoHtml}</td>
            <td class="p-3 text-center col-dielinephoto">${dielinePhotoHtml}</td>
            <td class="p-3 text-slate-850 font-bold col-designdetails font-sans">${item.design_details || '-'}</td>
            <td class="p-3 text-gray-500 col-size" dir="ltr">${item.size || '-'}</td>
            <td class="p-3 text-gray-500 col-specifications font-sans">${item.specifications || '-'}</td>
            <td class="p-3 text-gray-500 col-sample font-sans">${item.sample || '-'}</td>
            <td class="p-3 text-gray-500 col-production font-sans">${item.production || '-'}</td>
            <td class="p-3 text-center font-bold col-moq">${qty.toLocaleString('en-US')}</td>
            <td class="p-3 text-center text-gray-500 col-unit font-sans">${item.unit_type || '-'}</td>
            <td class="p-3 text-right font-bold text-slate-800 col-unitprice" dir="ltr">$${formatNumber(unitLandedPrice)}</td>
            <td class="p-3 text-right font-black text-emerald-700 bg-emerald-50/10 col-totalamount" dir="ltr">$${formatNumber(totalLandedAmount)}</td>
            <td class="p-3 text-center col-qtyctn">${qtyPerCtn.toLocaleString('en-US')}</td>
            <td class="p-3 text-center col-ctn">${ctnCount.toLocaleString('en-US')}</td>
            <td class="p-3 text-center col-gwctn">${(gwPerCtn * ctnCount).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
            <td class="p-3 text-center col-length">${lengthCm}</td>
            <td class="p-3 text-center col-width">${widthCm}</td>
            <td class="p-3 text-center col-height">${heightCm}</td>
            <td class="p-3 text-right col-cbmctn" dir="ltr">${cbmPerCtn.toFixed(4)}</td>
            <td class="p-3 text-right font-bold col-totalcbm" dir="ltr">${totalCbm.toFixed(4)}</td>
        `;
        fragment.appendChild(row);
    });
    
    tbody.appendChild(fragment);

    // تحديث قيم خلايا المجموع في الـ tfoot
    document.getElementById('footTotalQuantity').textContent = grandPieces.toLocaleString('en-US');
    document.getElementById('footTotalAmount').textContent = `$${formatNumber(grandDeliveredTotal)}`;
    document.getElementById('footTotalCtn').textContent = grandCtn.toLocaleString('en-US');
    document.getElementById('footTotalGw').textContent = grandGw.toLocaleString('en-US', { maximumFractionDigits: 2 });
    document.getElementById('footTotalCbm').textContent = grandCbm.toFixed(4);

    // تحديث بطاقات ملخص الفاتورة والشروط الكلية (إذا كانت موجودة)
    const grandTotalDisplay = document.getElementById('grandTotalDisplay');
    if (grandTotalDisplay) {
        grandTotalDisplay.textContent = `$${formatNumber(grandDeliveredTotal)}`;
    }

    // تطبيق حالة رؤية الأعمدة الـ 22 كاملة فوراً
    applyAllColumnVisibilities();
}

// دالة عرض وتكبير الصور بشكل منبثق فخم
window.openImagePreview = function (src) {
    let modal = document.getElementById('image-preview-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'image-preview-modal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-300 no-print';
        modal.innerHTML = `
            <div class="relative max-w-4xl max-h-[90vh] p-2 bg-white rounded-2xl shadow-2xl scale-95 transition-transform duration-300 mx-4 flex items-center justify-center">
                <button onclick="closeImagePreview()" class="absolute -top-12 right-0 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition duration-200">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
                <img id="preview-modal-img" src="" class="max-w-full max-h-[80vh] object-contain rounded-xl">
            </div>
        `;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeImagePreview();
        });
        document.body.appendChild(modal);
    }

    const img = document.getElementById('preview-modal-img');
    img.src = src;

    // إظهار المودال مع تأثير انتقال سلس
    modal.classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => {
        const container = modal.querySelector('.relative');
        if (container) {
            container.classList.remove('scale-95');
            container.classList.add('scale-100');
        }
    }, 10);
};

window.closeImagePreview = function () {
    const modal = document.getElementById('image-preview-modal');
    if (modal) {
        const container = modal.querySelector('.relative');
        if (container) {
            container.classList.remove('scale-100');
            container.classList.add('scale-95');
        }
        setTimeout(() => {
            modal.classList.add('opacity-0', 'pointer-events-none');
        }, 150);
    }
};
