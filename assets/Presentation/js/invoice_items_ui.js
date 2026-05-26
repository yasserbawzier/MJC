// invoice_items_ui.js
// Presentation Layer - مسؤولة عن كل ما يتعلق بواجهة المستخدم وجدول Handsontable

const InvoiceItemsUI = {
    hotInstance: null,

    // -----------------------------------------
    // نظام التنبيهات (Toasts)
    // -----------------------------------------
    showToast(message, type = 'info') {
        const notifier = (window.parent && window.parent !== window && window.parent.showNotification) 
            ? window.parent.showNotification 
            : window.showNotification;
        if (notifier) {
            return notifier(message, type);
        }
        alert(message);
        return { update: () => {}, remove: () => {} };
    },

    // -----------------------------------------
    // تحديث الواجهة والتفاصيل
    // -----------------------------------------
    updateInvoiceDetailsDOM(invoiceData, currentInvoiceId) {
        document.getElementById('invoiceNumberDisplay').textContent = invoiceData.invoice_number || '-';
        document.getElementById('invoiceCustomerDisplay').textContent = invoiceData.customers?.customer_custom_id || '-';
        document.getElementById('invoiceCustomerNameDisplay').textContent = invoiceData.customers?.full_name || '-';
        document.getElementById('invoiceShippingDestinationDisplay').textContent = invoiceData.shipping_rates?.country_code || '-';
        document.getElementById('invoiceCbmPriceDisplay').textContent = invoiceData.Price_Per_CBM ? Number(invoiceData.Price_Per_CBM).toFixed(2) : '-';

        const designsLink = document.getElementById('itemDesignsLink');
        if (designsLink) designsLink.href = `../../html/item_designs.html?invoice_id=${currentInvoiceId}`;
        const commissionsLink = document.getElementById('itemCommissionsLink');
        if (commissionsLink) commissionsLink.href = `commissions.html?invoice_id=${currentInvoiceId}`;
        const customerInvoiceLink = document.getElementById('customerInvoiceLink');
        if (customerInvoiceLink) customerInvoiceLink.href = `customer_invoice.html?invoice_id=${currentInvoiceId}`;
    },

    updateProductOptionsDOM(productsLookup) {
        const select = document.getElementById('invoiceItemProductId');
        if (!select) return;
        select.innerHTML = '<option value="">اختر المنتج</option>';
        productsLookup.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = `${product.product_custom_id || product.id} - ${product.product_name || 'بدون اسم'}`;
            select.appendChild(option);
        });
    },

    updateItemNamePlaceholder(nextName) {
        const itemNameInput = document.getElementById('itemName');
        if (itemNameInput) {
            itemNameInput.value = nextName;
            itemNameInput.placeholder = nextName;
        }
    },

    updateFooterStats(stats) {
        const totalRow = document.getElementById('invoiceItemsTotalRow');
        if (totalRow) {
            totalRow.innerHTML = `
                <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center font-bold" colspan="11">المجموع الإجمالي / Totals</td>
                <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center font-bold bg-[#dbeafe]">${InvoiceItemsUI.formatNumber(stats.activeMOQ)}</td>
                <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-[#dbeafe]">-</td>
                <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-[#dbeafe]">-</td>
                <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center font-bold bg-[#bfdbfe]">${InvoiceItemsUI.formatNumber(stats.activeAmountVal)}</td>
                <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-[#fee2e2]">-</td>
                <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center font-bold bg-[#fecaca]">${InvoiceItemsUI.formatNumber(stats.activeShippingVal)}</td>
                <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-[#f5ebdf]">-</td>
                <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center font-bold bg-[#f5ebdf]">${InvoiceItemsUI.formatNumber(stats.activeCtnVal)}</td>
                <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center bg-[#f5ebdf]" colspan="5">-</td>
                <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center font-bold bg-[#e8dccb]">${stats.activeCbmVal > 0 ? stats.activeCbmVal.toFixed(4) : '-'}</td>
                <td class="p-3 text-sm text-gray-900 border border-gray-200 text-center" colspan="3">-</td>
            `;
        }

        const statQty = document.getElementById('statTotalQuantity');
        if (statQty) statQty.textContent = stats.activeMOQ.toLocaleString('en-US');
        const statCtn = document.getElementById('statTotalCtn');
        if (statCtn) statCtn.textContent = stats.activeCtnVal.toLocaleString('en-US');
        const statCbm = document.getElementById('statTotalCbm');
        if (statCbm) statCbm.textContent = stats.activeCbmVal.toFixed(4);
        const statShipping = document.getElementById('statTotalShipping');
        if (statShipping) statShipping.textContent = '$' + stats.activeShippingVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const statFactory = document.getElementById('statTotalFactory');
        if (statFactory) statFactory.textContent = '$' + stats.activeAmountVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    formatNumber(value) {
        if (value === null || value === undefined || value === '') return '-';
        return Number(value).toLocaleString('en-US');
    },

    // -----------------------------------------
    // Handsontable Renderers 
    // -----------------------------------------
    applyColumnColors(instance, td, row, prop) {
        const redCols = ['shipping_price_per_unit'];
        const blueCols = ['quantity', 'unit_type', 'factory_price_per_unit'];
        const brownCols = ['qty_per_ctn', 'CTN', 'gw_per_ctn_kg', 'length_cm', 'width_cm', 'height_cm'];

        const rowData = instance.getSourceDataAtRow(row);
        if (!rowData) return;

        if (rowData.is_summary) {
            if (redCols.includes(prop)) td.style.backgroundColor = '#fecaca';
            else if (blueCols.includes(prop)) td.style.backgroundColor = '#bfdbfe';
            else if (brownCols.includes(prop)) td.style.backgroundColor = '#e8dccb';

            td.style.color = '#000';
            td.style.fontWeight = 'bold';
        } else {
            if (redCols.includes(prop)) td.style.backgroundColor = '#fee2e2';
            else if (blueCols.includes(prop)) td.style.backgroundColor = '#dbeafe';
            else if (brownCols.includes(prop)) td.style.backgroundColor = '#f5ebdf';
        }
    },

    getMergesFromData(itemsToRender) {
        const merges = [];
        const columnsConfig = [
            'item_name', 'client_photo_url', 'design_photo_url', 'dieline_photo_url',
            'design_details', 'size', 'specifications', 'product_id', 'product_image_url',
            'sample', 'production', 'quantity', 'unit_type', 'factory_price_per_unit',
            'total_factory_price', 'shipping_price_per_unit', 'total_shipping_cost',
            'qty_per_ctn', 'CTN', 'gw_per_ctn_kg', 'length_cm', 'width_cm', 'height_cm',
            'cbm_per_ctn', 'total_cbm', 'place', 'status'
        ];

        itemsToRender.forEach((item, rowIndex) => {
            if (item.merge_metadata) {
                let meta = item.merge_metadata;
                if (typeof meta === 'string') {
                    try { meta = JSON.parse(meta); } catch (e) { meta = null; }
                }
                if (meta && typeof meta === 'object') {
                    Object.keys(meta).forEach(colName => {
                        const colIndex = columnsConfig.indexOf(colName);
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
        return merges;
    },

    // -----------------------------------------
    // تهيئة الجدول
    // -----------------------------------------
    initHandsontable(containerId, itemsToRender, handlers) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const merges = this.getMergesFromData(itemsToRender);

        if (this.hotInstance) {
            this.hotInstance.loadData(itemsToRender);
            this.hotInstance.updateSettings({ mergeCells: merges });
            return;
        }

        container.innerHTML = ''; // إزالة اللودر

        const self = this;
        this.hotInstance = new Handsontable(container, {
            data: itemsToRender,
            rowHeaders: true,
            colHeaders: [
                'Item', 'Client Photo', 'Design', 'Dieline', 'Design details', 'Size', 'Specifications',
                'ProductID', 'Product Image', 'Sample', 'Production', 'MOQ', 'Unit', 'Factory price',
                'Total Amount', 'Shipping Price/Unit', 'Total Shipping', 'Quantity/CTN', 'CTN',
                'GW/CTN KG', 'L', 'W', 'H', 'CBM/CTN', 'Total CBM', 'place', 'status', 'Actions'
            ],
            columns: [
                { data: 'item_name', renderer: 'html', editor: window.RichTextEditor },
                { data: 'client_photo_url', renderer: handlers.photoRenderer, readOnly: true },
                { data: 'design_photo_url', renderer: handlers.photoRenderer, readOnly: true },
                { data: 'dieline_photo_url', renderer: handlers.photoRenderer, readOnly: true },
                { data: 'design_details', renderer: 'html', editor: window.RichTextEditor },
                { data: 'size', renderer: 'html', editor: window.RichTextEditor },
                { data: 'specifications', renderer: 'html', editor: window.RichTextEditor },
                { data: 'product_id', renderer: handlers.productIdRenderer, readOnly: true },
                { data: 'product_image_url', renderer: handlers.productImageRenderer, readOnly: true },
                { data: 'sample', renderer: 'html', editor: window.RichTextEditor },
                { data: 'production', renderer: 'html', editor: window.RichTextEditor },
                { data: 'quantity', type: 'numeric', renderer: handlers.customColoredNumericRenderer, className: 'ht-bg-blue' },
                { data: 'unit_type', renderer: handlers.customColoredHtmlRenderer, editor: window.RichTextEditor, className: 'ht-bg-blue' },
                { data: 'factory_price_per_unit', type: 'numeric', renderer: handlers.customColoredNumericRenderer, className: 'ht-bg-blue' },
                { data: 'total_factory_price', type: 'numeric', readOnly: true },
                { data: 'shipping_price_per_unit', type: 'numeric', renderer: handlers.customColoredNumericRenderer, className: 'ht-bg-red' },
                { data: 'total_shipping_cost', type: 'numeric', readOnly: true },
                { data: 'qty_per_ctn', type: 'numeric', renderer: handlers.customColoredNumericRenderer, className: 'ht-bg-brown' },
                { data: 'CTN', type: 'numeric', renderer: handlers.customColoredNumericRenderer, className: 'ht-bg-brown' },
                { data: 'gw_per_ctn_kg', type: 'numeric', renderer: handlers.customColoredNumericRenderer, className: 'ht-bg-brown' },
                { data: 'length_cm', type: 'numeric', renderer: handlers.customColoredNumericRenderer, className: 'ht-bg-brown' },
                { data: 'width_cm', type: 'numeric', renderer: handlers.customColoredNumericRenderer, className: 'ht-bg-brown' },
                { data: 'height_cm', type: 'numeric', renderer: handlers.customColoredNumericRenderer, className: 'ht-bg-brown' },
                { data: 'cbm_per_ctn', type: 'numeric', readOnly: true },
                { data: 'total_cbm', type: 'numeric', readOnly: true },
                { data: 'place', renderer: 'html', editor: window.RichTextEditor },
                { data: 'status', type: 'checkbox' },
                { data: 'actions', renderer: handlers.actionsRenderer, readOnly: true }
            ],
            layoutDirection: 'rtl',
            autoWrapRow: true,
            autoWrapCol: true,
            licenseKey: 'non-commercial-and-evaluation',
            height: '600px',
            width: '100%',
            stretchH: 'none',
            colWidths: [140, 130, 100, 100, 160, 90, 150, 130, 150, 110, 120, 90, 90, 140, 140, 180, 150, 140, 90, 130, 70, 70, 70, 120, 120, 90, 80, 100],
            manualColumnResize: true,
            className: 'htCenter htMiddle custom-ht',
            rowHeights: 60,
            mergeCells: merges,
            search: true,
            filters: true,
            dropdownMenu: true,
            contextMenu: {
                items: {
                    "textColor": {
                        name: 'لون النص 🔤',
                        submenu: {
                            items: [
                                { key: "textColor:red", name: 'أحمر (Red)', callback: function (key, selection) { handlers.saveStyleState(selection[0], 'color', 'ht-text-red'); } },
                                { key: "textColor:green", name: 'أخضر (Green)', callback: function (key, selection) { handlers.saveStyleState(selection[0], 'color', 'ht-text-green'); } },
                                { key: "textColor:blue", name: 'أزرق (Blue)', callback: function (key, selection) { handlers.saveStyleState(selection[0], 'color', 'ht-text-blue'); } },
                                { key: "textColor:brown", name: 'بني (Brown)', callback: function (key, selection) { handlers.saveStyleState(selection[0], 'color', 'ht-text-brown'); } },
                                { key: "textColor:black", name: 'أسود (Black)', callback: function (key, selection) { handlers.saveStyleState(selection[0], 'color', 'ht-text-black'); } },
                                { key: "textColor:white", name: 'أبيض (White)', callback: function (key, selection) { handlers.saveStyleState(selection[0], 'color', 'ht-text-white'); } },
                                { key: "textColor:clear", name: 'إزالة اللون (الافتراضي)', callback: function (key, selection) { handlers.saveStyleState(selection[0], 'color', 'ht-text-none'); } }
                            ]
                        }
                    },
                    "---------": {},
                    "mergeCells": { name: "دمج / إلغاء دمج الخلايا (Merge/Unmerge)" },
                    "copy": { name: "نسخ (Copy)" },
                    "cut": { name: "قص (Cut)" },
                    "clear_custom": { name: "مسح المحتويات (Clear)", callback: function () { this.emptySelectedCells(); } },
                    "undo": { name: "تراجع (Undo)" },
                    "redo": { name: "إعادة (Redo)" }
                }
            },
            cells: function (row, col, prop) {
                var cellProperties = {};
                let customClasses = ['htCenter', 'htMiddle', 'custom-ht'];
                let rowData = this.instance.getSourceDataAtRow(row);

                const redCols = ['shipping_price_per_unit', 'total_shipping_cost'];
                const blueCols = ['quantity', 'unit_type', 'factory_price_per_unit', 'total_factory_price'];
                const brownCols = ['qty_per_ctn', 'CTN', 'gw_per_ctn_kg', 'length_cm', 'width_cm', 'height_cm', 'cbm_per_ctn', 'total_cbm'];

                if (redCols.includes(prop)) customClasses.push('ht-bg-red');
                else if (blueCols.includes(prop)) customClasses.push('ht-bg-blue');
                else if (brownCols.includes(prop)) customClasses.push('ht-bg-brown');

                if (rowData && rowData.merge_metadata) {
                    let meta = rowData.merge_metadata;
                    if (typeof meta === 'string') {
                        try { meta = JSON.parse(meta); } catch (e) { meta = null; }
                    }
                    if (meta && typeof meta === 'object' && meta[prop]) {
                        if (meta[prop].color && meta[prop].color !== 'ht-text-none') customClasses.push(meta[prop].color);
                    }
                }

                if (rowData && rowData.is_summary) {
                    cellProperties.readOnly = true;
                    customClasses.push('!text-black', '!font-extrabold');
                    if (!redCols.includes(prop) && !blueCols.includes(prop) && !brownCols.includes(prop)) {
                        customClasses.push('!bg-slate-200');
                    }
                }

                cellProperties.className = customClasses.join(' ');
                return cellProperties;
            },
            afterMergeCells: function (cellRange, mergeParent, autoRender) {
                handlers.saveMergeState(cellRange, true);
            },
            afterUnmergeCells: function (cellRange, autoRender) {
                handlers.saveMergeState(cellRange, false);
            },
            afterChange: function (changes, source) {
                if (source === 'loadData' || (typeof source === 'string' && source.toLowerCase().includes('merge'))) return;
                handlers.handleHandsontableChange(changes, source);
            },
            beforeCopy: function (data) {
                for (let r = 0; r < data.length; r++) {
                    for (let c = 0; c < data[r].length; c++) {
                        if (typeof data[r][c] === 'string') {
                            data[r][c] = data[r][c].replace(/<[^>]*>?/gm, '');
                        }
                    }
                }
            }
        });

        // Fix for Shift + Scroll jumping vertically
        window.addEventListener('wheel', function(e) {
            if (e.shiftKey) {
                const htContainer = e.target.closest('.handsontable');
                if (htContainer && container.contains(htContainer)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    
                    const holder = htContainer.querySelector('.wtHolder');
                    if (holder) {
                        const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
                        holder.scrollLeft += delta;
                    }
                }
            }
        }, { passive: false, capture: true });
    },

    rebuildInvoiceItemRow() {
        if (this.hotInstance) {
            this.hotInstance.render();
        }
    }
};

window.InvoiceItemsUI = InvoiceItemsUI;
window.closeProductDetailsModal = () => { document.getElementById('productDetailsModal')?.classList.add('hidden'); };
window.closeEditModal = () => { document.getElementById('editInvoiceItemModal')?.classList.add('hidden'); };
window.closeProductSelectorModal = () => { document.getElementById('productSelectorModal')?.classList.add('hidden'); };
window.closePhotoActionsModal = () => { document.getElementById('photoActionsModal')?.classList.add('hidden'); };
window.closeAddProductModal = () => { document.getElementById('addProductModal')?.classList.add('hidden'); };
window.openAddProductModal = async () => {
    document.getElementById('addProductModal')?.classList.remove('hidden');
    try {
        const types = await InvoiceItemsAPI.fetchProductTypes();
        const typeSelect = document.getElementById('newProductTypeId');
        if (typeSelect && types) {
            typeSelect.innerHTML = '<option value="">���� ��� ������...</option>';
            types.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.type_name;
                typeSelect.appendChild(opt);
            });
        }
    } catch (err) {
        console.error(err);
    }
};
window.submitAddProduct = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitNewProductBtn');
    const spinner = document.getElementById('submitNewProductSpinner');
    btn.disabled = true;
    spinner.classList.remove('hidden');

    try {
        const customId = await InvoiceItemsAPI.generateNewProductCustomId();
        const payload = {
            product_custom_id: customId,
            product_name: document.getElementById('newProductName').value,
            product_type_id: document.getElementById('newProductTypeId').value || null,
            specifications: document.getElementById('newProductSpecs').value,
            sample_details: document.getElementById('newProductSample').value,
            moq: document.getElementById('newProductMoq').value || 0,
            manufacturing_days: document.getElementById('newProductDays').value || 0,
            status: true
        };

        let productImgUrl = null;
        const imgFile = document.getElementById('newProductImage').files[0];
        if (imgFile) {
            const compressed = await InvoiceItemsController.compressImageIfNeeded(imgFile);
            productImgUrl = await InvoiceItemsAPI.uploadImage(compressed);
            payload.product_image_url = productImgUrl;
        }

        const videoFile = document.getElementById('newProductVideo').files[0];
        if (videoFile) {
            payload.product_video_url = await InvoiceItemsAPI.uploadImage(videoFile); // Assuming it handles video
        }

        await InvoiceItemsAPI.insertProduct(payload);
        InvoiceItemsUI.showToast('��� ����� ������ �����!', 'success');
        window.closeAddProductModal();

        const products = await InvoiceItemsAPI.fetchProducts();
        State.productsLookup = products;
        InvoiceItemsUI.updateProductOptionsDOM(products);
        InvoiceItemsController.renderSelectorProducts('');

    } catch (err) {
        InvoiceItemsUI.showToast('���: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        spinner.classList.add('hidden');
    }
};
