
// ==========================================
// ===  نظام استيراد Excel المتقدم        ===
// ==========================================

// جدول التعيين: يربط كل اسم عمود محتمل من الأكسل بحقل في قاعدة البيانات
// يعمل بعد تطبيع النص (lowercase + حذف المسافات والحروف الخاصة)
const EXCEL_COLUMN_MAP = {
    // Size / الحجم
    'size': 'size', 'Size': 'size',
    'الحجم': 'size',

    // Specifications / المواصفات
    'specifications': 'specifications',
    'specification': 'specifications',
    'spec': 'specifications',
    'specs': 'specifications',
    'المواصفات': 'specifications',
    'مواصفات': 'specifications',

    // Sample / العينة
    'sample': 'sample',
    'sampledetails': 'sample',
    'العينة': 'sample',
    'تفاصيلالعينة': 'sample',

    // Production / التصنيع
    'production': 'production',
    'التصنيع': 'production',

    // MOQ / الكمية
    'moq': 'quantity',
    'quantity': 'quantity',
    'qty': 'quantity',
    'الكمية': 'quantity',
    'الكميةالمطلوبة': 'quantity',

    // Unit / الوحدة
    'unit': 'unit_type',
    'unittype': 'unit_type',
    'الوحدة': 'unit_type',

    // Factory Price / سعر المصنع
    'factoryprice': 'factory_price_per_unit',
    'factorypriceperunit': 'factory_price_per_unit',
    'unitpriceusdexw': 'factory_price_per_unit',
    'unitpriceusdEXW': 'factory_price_per_unit',
    'unitpriceusd': 'factory_price_per_unit',
    'unitprice': 'factory_price_per_unit',
    'priceperunit': 'factory_price_per_unit',
    'priceusd': 'factory_price_per_unit',
    'exw': 'factory_price_per_unit',
    'سعرالمصنع': 'factory_price_per_unit',
    'سعرالوحدة': 'factory_price_per_unit',

    // Qty per CTN
    'qtyperctn': 'qty_per_ctn',
    'quantityperctn': 'qty_per_ctn',
    'quantityctn': 'qty_per_ctn',
    'quantitypercarton': 'qty_per_ctn',
    'الكميةبالكرتونة': 'qty_per_ctn',

    // CTN
    'ctn': 'CTN',
    'cartons': 'CTN',
    'الكراتين': 'CTN',

    // GW per CTN KG
    'gwperctn': 'gw_per_ctn_kg',
    'gwperctnckg': 'gw_per_ctn_kg',
    'gwctnkg': 'gw_per_ctn_kg',
    'gwctn': 'gw_per_ctn_kg',
    'grossweight': 'gw_per_ctn_kg',
    'gw': 'gw_per_ctn_kg',
    'الوزنالكرتونة': 'gw_per_ctn_kg',

    // Dimensions
    'l': 'length_cm',
    'length': 'length_cm',
    'lengthcm': 'length_cm',
    'الطول': 'length_cm',

    'w': 'width_cm',
    'width': 'width_cm',
    'widthcm': 'width_cm',
    'العرض': 'width_cm',

    'h': 'height_cm',
    'height': 'height_cm',
    'heightcm': 'height_cm',
    'الارتفاع': 'height_cm',

    // Place / المكان
    'place': 'place',
    'المكان': 'place',
};

// الحقول الرقمية في قاعدة البيانات
const NUMERIC_DB_FIELDS = new Set([
    'quantity', 'factory_price_per_unit', 'qty_per_ctn', 'CTN',
    'gw_per_ctn_kg', 'length_cm', 'width_cm', 'height_cm',
    'shipping_price_per_unit'
]);

// تطبيع نص العمود: lowercase + حذف كل شيء غير حرف أو رقم عربي/انجليزي
function normalizeHeader(header) {
    return String(header || '')
        .toLowerCase()
        .replace(/[\r\n\t]+/g, ' ')      // تحويل الأسطر الجديدة والـ tab إلى مسافة
        .replace(/[\s\u00a0\-_\/\\.,()\[\]#$%&*!?؟،]+/g, '') // حذف كل المسافات والرموز
        .trim();
}

// البيانات المؤقتة للمعاينة
let excelParsedRows = [];

/**
 * يُستدعى عند اختيار ملف Excel
 */
function handleExcelFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    // إعادة تعيين مدخل الملف للسماح بإعادة اختيار نفس الملف
    event.target.value = '';

    // التحقق من توفر مكتبة SheetJS
    if (typeof XLSX === 'undefined') {
        showToast('❌ مكتبة قراءة Excel غير محملة! تأكد من اتصال الإنترنت.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // أخذ أول ورقة
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // ======================================================
            // قراءة الملف كمصفوفة خام (header: 1) للتعامل مع
            // الخلايا المدمجة والرؤوس المتعددة الصفوف
            // ======================================================
            const allRows = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                defval: '',
                raw: false
            });

            if (!allRows || allRows.length === 0) {
                showToast('⚠️ الملف فارغ أو لا يحتوي على بيانات!', 'error');
                return;
            }

            // البحث التلقائي عن صف العناوين في أول 5 صفوف
            // نختار الصف الذي يحتوي على أكبر عدد من الأعمدة المتطابقة
            const skipKeywords = ['photo', 'image', 'صورة', 'total', 'مجموع', 'cbm', 'shipping',
                'شحن', 'd2d', 'ship', 'estimated', 'amount', 'تقدير'];

            let bestHeaderRowIndex = 0;
            let bestMatchCount = 0;

            const maxRowsToCheck = Math.min(5, allRows.length);
            for (let ri = 0; ri < maxRowsToCheck; ri++) {
                const row = allRows[ri];
                let matchCount = 0;
                row.forEach(cell => {
                    const norm = normalizeHeader(String(cell || ''));
                    if (norm && EXCEL_COLUMN_MAP[norm]) matchCount++;
                });
                console.log(`[Excel Import] الصف ${ri + 1}: ${matchCount} تطابق — القيم: ${JSON.stringify(row)}`);
                if (matchCount > bestMatchCount) {
                    bestMatchCount = matchCount;
                    bestHeaderRowIndex = ri;
                }
            }

            console.log(`[Excel Import] صف العناوين المكتشف: الصف رقم ${bestHeaderRowIndex + 1}`);

            const headerRow = allRows[bestHeaderRowIndex];
            const dataRows  = allRows.slice(bestHeaderRowIndex + 1).filter(row => {
                // تصفية الصفوف الفارغة تماماً قبل بدء المعالجة لكي لا يتسبب الـ forward-fill في تكرارها
                return row && row.length > 0 && row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== '');
            });

            if (dataRows.length === 0) {
                showToast('⚠️ لا توجد بيانات أسفل صف العناوين!', 'error');
                return;
            }

            // بناء خريطة: colIndex -> dbField  +  colIndex -> originalHeader
            const headerMapping  = {}; // { colIndex: dbField }
            const headerNames    = {}; // { colIndex: originalHeaderText }
            const unmappedHeaders = [];

            headerRow.forEach((cell, colIdx) => {
                const headerText = String(cell || '').trim();
                const normalized = normalizeHeader(headerText);
                const dbField    = EXCEL_COLUMN_MAP[normalized];

                console.log(`  Col[${colIdx}] "${headerText}" → "${normalized}" → ${dbField || 'لا يوجد تطابق'}`);

                if (dbField) {
                    // أول تطابق يفوز (لا ازدواجية في dbField)
                    const alreadyMapped = Object.values(headerMapping).includes(dbField);
                    if (!alreadyMapped) {
                        headerMapping[colIdx] = dbField;
                        headerNames[colIdx]   = headerText;
                    }
                } else if (normalized !== '') {
                    const shouldSkip = skipKeywords.some(kw => normalized.includes(kw));
                    if (!shouldSkip) unmappedHeaders.push(headerText);
                }
            });

            console.log('[Excel Import] headerMapping (by colIndex):', headerMapping);

            if (Object.keys(headerMapping).length === 0) {
                showToast('❌ لم يتم التعرف على أي عمود! افتح Console (F12) لرؤية التفاصيل.', 'error');
                return;
            }

            // تحويل صفوف البيانات الخام إلى كائنات مُعيَّنة
            excelParsedRows = [];
            const dataRowIndexMapping = {}; // ربط رقم صف الإكسل برقم الصف المحلي لدينا

            let localRowIndex = 0;
            const dataRowsRaw = allRows.slice(bestHeaderRowIndex + 1);

            for (let i = 0; i < dataRowsRaw.length; i++) {
                const row = dataRowsRaw[i];
                const excelRowIndex = bestHeaderRowIndex + 1 + i;

                // تخطي الصفوف الفارغة تماماً
                const isEmpty = !row || row.length === 0 || !row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== '');
                if (isEmpty) continue;

                const mapped = {};
                Object.entries(headerMapping).forEach(([colIdxStr, dbField]) => {
                    const colIdx = parseInt(colIdxStr);
                    let rawVal   = row[colIdx];

                    if (NUMERIC_DB_FIELDS.has(dbField)) {
                        const cleaned = String(rawVal || '').replace(/[,\s]/g, '');
                        const num = parseFloat(cleaned);
                        mapped[dbField] = isNaN(num) ? 0 : num;
                    } else {
                        mapped[dbField] = String(rawVal || '').trim();
                    }
                });

                mapped.merge_metadata = {}; // تجهيز كائن الدمج
                excelParsedRows.push(mapped);
                dataRowIndexMapping[excelRowIndex] = localRowIndex;
                localRowIndex++;
            }

            // قراءة ودمج إعدادات الخلايا المدمجة من ملف الإكسل (!merges)
            const excelMerges = worksheet['!merges'] || [];
            excelMerges.forEach(merge => {
                const excelStartRow = merge.s.r;
                const excelEndRow = merge.e.r;
                const excelStartCol = merge.s.c;
                const excelEndCol = merge.e.c;

                // تجاهل الدمج إذا كان في صفوف العناوين أو قبلها
                if (excelEndRow <= bestHeaderRowIndex) return;

                const actualStartRow = Math.max(excelStartRow, bestHeaderRowIndex + 1);
                const localStartRow = dataRowIndexMapping[actualStartRow];

                if (localStartRow !== undefined) {
                    // حساب rowspan محلياً بناءً على الصفوف المتبقية (غير الفارغة)
                    let localEndRow = localStartRow;
                    for (let r = actualStartRow; r <= excelEndRow; r++) {
                        if (dataRowIndexMapping[r] !== undefined) {
                            localEndRow = dataRowIndexMapping[r];
                        }
                    }

                    const rowspan = localEndRow - localStartRow + 1;
                    const colspan = excelEndCol - excelStartCol + 1;

                    if (rowspan > 1 || colspan > 1) {
                        const dbField = headerMapping[excelStartCol];
                        if (dbField) {
                            excelParsedRows[localStartRow].merge_metadata[dbField] = { rowspan, colspan };
                        }
                    }
                }
            });

            if (excelParsedRows.length === 0) {
                showToast('⚠️ لم يُعثر على بيانات صالحة! تأكد من أن الملف يحتوي على بيانات أسفل العناوين.', 'error');
                return;
            }

            // إعادة بناء headerMapping بأسماء الأعمدة الأصلية للعرض
            const namedHeaderMapping = {};
            Object.entries(headerMapping).forEach(([colIdx, dbField]) => {
                namedHeaderMapping[headerNames[colIdx] || `Col${colIdx}`] = dbField;
            });

            // عرض مودال المعاينة
            openExcelImportModal(excelParsedRows, namedHeaderMapping, unmappedHeaders);

        } catch (err) {
            console.error('خطأ في قراءة ملف Excel:', err);
            showToast('❌ خطأ في قراءة الملف: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

/**
 * فتح مودال المعاينة وعرض الجدول
 */
function openExcelImportModal(rows, headerMapping, unmappedHeaders) {
    const modal = document.getElementById('excelImportModal');
    const rowCount = document.getElementById('excelImportRowCount');
    const warningsDiv = document.getElementById('excelImportWarnings');
    const thead = document.getElementById('excelPreviewHead');
    const tbody = document.getElementById('excelPreviewBody');

    if (!modal || !thead || !tbody) return;

    // تحديث العداد
    if (rowCount) rowCount.textContent = rows.length + ' صف سيتم استيراده';

    // عرض تحذيرات الأعمدة غير المعروفة
    if (warningsDiv) {
        if (unmappedHeaders.length > 0) {
            warningsDiv.classList.remove('hidden');
            warningsDiv.innerHTML = '⚠️ الأعمدة التالية لم يتم التعرف عليها وسيتم تجاهلها: <strong>' + unmappedHeaders.join('، ') + '</strong>';
        } else {
            warningsDiv.classList.add('hidden');
        }
    }

    // بناء قائمة حقول قاعدة البيانات المكتشفة
    const dbFields = [...new Set(Object.values(headerMapping))];
    const fieldLabels = {
        'size': 'Size',
        'specifications': 'Specifications',
        'sample': 'Sample',
        'production': 'Production',
        'quantity': 'MOQ',
        'unit_type': 'Unit',
        'factory_price_per_unit': 'Factory Price',
        'qty_per_ctn': 'Qty/CTN',
        'CTN': 'CTN',
        'gw_per_ctn_kg': 'GW/CTN KG',
        'length_cm': 'L (cm)',
        'width_cm': 'W (cm)',
        'height_cm': 'H (cm)',
        'place': 'Place',
    };

    // بناء رأس الجدول
    let theadHtml = '<tr>';
    dbFields.forEach(f => {
        theadHtml += '<th class="p-2 text-xs font-bold text-gray-600 bg-gray-100 border border-gray-200 whitespace-nowrap">' + (fieldLabels[f] || f) + '</th>';
    });
    theadHtml += '</tr>';
    thead.innerHTML = theadHtml;

    // بناء صفوف الجدول
    const fragment = document.createDocumentFragment();
    rows.forEach((row, i) => {
        const tr = document.createElement('tr');
        tr.className = i % 2 === 0 ? 'bg-white' : 'bg-gray-50';
        let rowHtml = '';
        dbFields.forEach(f => {
            const val = (row[f] !== undefined && row[f] !== '') ? row[f] : '-';
            rowHtml += '<td class="p-2 text-xs text-gray-700 border border-gray-200 whitespace-nowrap">' + val + '</td>';
        });
        tr.innerHTML = rowHtml;
        fragment.appendChild(tr);
    });
    tbody.innerHTML = '';
    tbody.appendChild(fragment);

    modal.classList.remove('hidden');
}

function closeExcelImportModal() {
    const modal = document.getElementById('excelImportModal');
    if (modal) modal.classList.add('hidden');
    excelParsedRows = [];
}

/**
 * تأكيد الاستيراد: إدراج جميع الصفوف في قاعدة البيانات
 */
async function confirmExcelImport() {
    if (!currentInvoiceId) {
        showToast('⚠️ لا يوجد معرف فاتورة نشط!', 'error');
        return;
    }
    if (!excelParsedRows || excelParsedRows.length === 0) {
        showToast('⚠️ لا توجد بيانات للاستيراد!', 'error');
        return;
    }

    const btn = document.getElementById('confirmExcelImportBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> جاري الاستيراد...';
    }

    const toast = showToast('جاري استيراد ' + excelParsedRows.length + ' صف...', 'info');

    try {
        // حساب بداية الترقيم من آخر عنصر موجود
        const startIndex = invoiceItems.length + 1;

        // إعداد حزمة الإدراج الكاملة
        const batchPayload = excelParsedRows.map((row, i) => ({
            invoice_id: currentInvoiceId,
            item_name: 'Item ' + (startIndex + i),
            quantity: row.quantity || 1,
            factory_price_per_unit: row.factory_price_per_unit || 0,
            qty_per_ctn: row.qty_per_ctn || 1,
            CTN: row.CTN || null,
            gw_per_ctn_kg: row.gw_per_ctn_kg || 0,
            length_cm: row.length_cm || 0,
            width_cm: row.width_cm || 0,
            height_cm: row.height_cm || 0,
            size: row.size || '',
            specifications: row.specifications || '',
            sample: row.sample || '',
            production: row.production || '',
            unit_type: row.unit_type || null,
            place: row.place || '1',
            status: true,
            merge_metadata: row.merge_metadata || {}
        }));

        // إدراج دفعي واحد (Batch Insert)
        const { data: insertedData, error } = await _supabase
            .from('invoice_items')
            .insert(batchPayload)
            .select('*');

        if (error) throw error;

        // إضافة البنود الجديدة للذاكرة المحلية
        const newItems = insertedData || [];
        newItems.forEach(item => {
            invoiceItems.push(item);
            recalculateLocalItemFields(item, false);
            // تهيئة لوك أب الصور
            itemPhotosLookup[item.id] = {
                client_photo_url: null,
                design_photo_url: null,
                dieline_photo_url: null
            };
        });

        // إعادة رسم الجدول والإحصائيات
        renderInvoiceItemsTable();
        updateInvoiceItemsFooter();

        closeExcelImportModal();

        toast.update('🎉 تم استيراد ' + newItems.length + ' صف من Excel بنجاح!', 'success');
        setTimeout(() => toast.remove(), 4000);

    } catch (err) {
        console.error('خطأ في الاستيراد:', err);
        toast.update('❌ فشل الاستيراد: ' + err.message, 'error');
        setTimeout(() => toast.remove(), 5000);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> تأكيد الاستيراد';
        }
    }
}
