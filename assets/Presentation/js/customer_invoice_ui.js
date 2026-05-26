/**
 * customer_invoice_ui.js
 * Presentation Layer for the Customer Invoice page.
 * Handles DOM manipulation and rendering.
 */

const CustomerInvoiceUI = {
    fmt(num) {
        if (num === null || num === undefined || isNaN(num)) return '0.00';
        return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    toggleColumnSelector() {
        const panel = document.getElementById('columnSelectorPanel');
        const icon = document.getElementById('selectorToggleIcon');
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            icon.textContent = '▲ إخفاء الخيارات / Hide Options';
        } else {
            panel.classList.add('hidden');
            icon.textContent = '▼ عرض الخيارات / Show Options';
        }
    },

    initColumnSelectorPanel(columnsConfig, visibilityState, onToggle) {
        const grid = document.getElementById('selectorGrid');
        if (!grid) return;
        grid.innerHTML = '';

        columnsConfig.forEach(col => {
            const isVisible = visibilityState[col.id] !== false;

            const wrapper = document.createElement('label');
            wrapper.className = 'flex items-center gap-2.5 bg-slate-50 hover:bg-slate-100/80 px-3 py-2 rounded-xl border border-gray-150 cursor-pointer select-none transition-all duration-200 text-xs font-semibold text-gray-700';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `chk_${col.id}`;
            checkbox.checked = isVisible;
            checkbox.className = 'w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 accent-emerald-600';
            
            checkbox.addEventListener('change', (e) => {
                onToggle(col.id, e.target.checked);
            });

            const span = document.createElement('span');
            span.textContent = col.label;

            wrapper.appendChild(checkbox);
            wrapper.appendChild(span);
            grid.appendChild(wrapper);
        });
    },

    applyColumnVisibility(colId, isVisible) {
        const cells = document.querySelectorAll(`.col-${colId}`);
        cells.forEach(cell => {
            if (isVisible) {
                cell.style.display = '';
            } else {
                cell.style.display = 'none';
            }
        });
        
        const chk = document.getElementById(`chk_${colId}`);
        if (chk && chk.checked !== isVisible) {
            chk.checked = isVisible;
        }
    },

    updateToggleButton(showInactiveItems) {
        const btn = document.getElementById('btnToggleInactive');
        if (!btn) return;
        
        if (showInactiveItems) {
            btn.innerHTML = '👁️‍🗨️ إخفاء العناصر الملغية';
            btn.classList.replace('bg-gray-100', 'bg-emerald-100');
            btn.classList.replace('text-gray-700', 'text-emerald-700');
        } else {
            btn.innerHTML = '👁️ إظهار العناصر الملغية';
            btn.classList.replace('bg-emerald-100', 'bg-gray-100');
            btn.classList.replace('text-emerald-700', 'text-gray-700');
        }
    },

    renderHeaderDetails(invoiceData, invoiceNumber) {
        document.getElementById('invoiceNumDisplay').textContent = invoiceNumber;
        document.title = invoiceNumber !== '-' ? `Invoice_${invoiceNumber}` : 'Commercial Invoice';
        
        document.getElementById('customerName').textContent = invoiceData.customers?.full_name || '-';
        document.getElementById('customerId').textContent = invoiceData.customers?.customer_custom_id || '-';
        document.getElementById('customerContact').textContent = invoiceData.customers?.phone || '-';
        
        const today = new Date();
        document.getElementById('invoiceDateDisplay').textContent = today.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    renderItemsTable(itemsToRender, productsLookup, itemPhotosLookup) {
        const tbody = document.getElementById('customerInvoiceTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (itemsToRender.length === 0) {
            tbody.innerHTML = `<tr><td colspan="23" class="p-8 text-center text-gray-500 font-bold">⚠️ لا توجد عناصر لعرضها.</td></tr>`;
            return { grandPieces: 0, grandCtn: 0, grandGw: 0, grandCbm: 0, grandDeliveredTotal: 0 };
        }

        const fragment = document.createDocumentFragment();

        let grandPieces = 0;
        let grandCtn = 0;
        let grandGw = 0;
        let grandCbm = 0;
        let grandDeliveredTotal = 0;

        const skipMatrix = {};

        itemsToRender.forEach((item, index) => {
            const product = productsLookup[item.product_id] || null;
            const itemPhoto = itemPhotosLookup[item.id] || {};

            // Calculations
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

            const qtyPerCtn = Number(item.qty_per_ctn || 0);
            const ctnCount = Number(item.CTN || 0);
            const gwPerCtn = Number(item.gw_per_ctn_kg || 0);
            const lengthCm = Number(item.length_cm || 0);
            const widthCm = Number(item.width_cm || 0);
            const heightCm = Number(item.height_cm || 0);

            const cbmPerCtn = (lengthCm * widthCm * heightCm) / 1000000;
            const totalCbm = cbmPerCtn * ctnCount;

            grandPieces += qty;
            grandCtn += ctnCount;
            grandGw += (gwPerCtn * ctnCount);
            grandCbm += totalCbm;
            grandDeliveredTotal += totalLandedAmount;

            const productImageHtml = product && product.product_image_url
                ? `<img src="${product.product_image_url}" alt="Product" onclick="CustomerInvoiceUI.openImagePreview(this.src)" class="w-36 h-36 object-contain rounded-xl border border-gray-250 mx-auto shadow-sm hover:scale-110 hover:shadow-md cursor-zoom-in transition-all duration-200 bg-white">`
                : '-';
            const clientPhotoHtml = itemPhoto.client_photo_url
                ? `<img src="${itemPhoto.client_photo_url}" alt="Client" onclick="CustomerInvoiceUI.openImagePreview(this.src)" class="w-36 h-36 object-contain rounded-xl border border-gray-250 mx-auto shadow-sm hover:scale-110 hover:shadow-md cursor-zoom-in transition-all duration-200 bg-white">`
                : '-';
            const designPhotoHtml = itemPhoto.design_photo_url
                ? `<img src="${itemPhoto.design_photo_url}" alt="Design" onclick="CustomerInvoiceUI.openImagePreview(this.src)" class="w-36 h-36 object-contain rounded-xl border border-gray-250 mx-auto shadow-sm hover:scale-110 hover:shadow-md cursor-zoom-in transition-all duration-200 bg-white">`
                : '-';
            const dielinePhotoHtml = itemPhoto.dieline_photo_url
                ? `<img src="${itemPhoto.dieline_photo_url}" alt="Dieline" onclick="CustomerInvoiceUI.openImagePreview(this.src)" class="w-36 h-36 object-contain rounded-xl border border-gray-250 mx-auto shadow-sm hover:scale-110 hover:shadow-md cursor-zoom-in transition-all duration-200 bg-white">`
                : '-';

            const row = document.createElement('tr');
            row.className = item.status === true 
                ? 'hover:bg-slate-50/50 transition text-xs font-mono'
                : 'bg-gray-100 text-gray-400 opacity-70 grayscale transition text-xs font-mono line-through decoration-gray-400';
            
            const buildTd = (colName, colClass, content, isHtml = false, extraAttrs = '') => {
                if (skipMatrix[index] && skipMatrix[index][colName]) return '';
                
                let rowspan = 1;
                let meta = item.merge_metadata;
                if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e) { meta = null; } }
                
                if (meta && meta[colName] && meta[colName].rowspan > 1) {
                    rowspan = meta[colName].rowspan;
                    for (let r = 1; r < rowspan; r++) {
                        const targetRow = index + r;
                        if (!skipMatrix[targetRow]) skipMatrix[targetRow] = {};
                        skipMatrix[targetRow][colName] = true;
                    }
                }
                
                const rsAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : '';
                const val = isHtml ? content : (content || '-');
                return `<td class="p-3 border border-black ${colClass}"${rsAttr} ${extraAttrs}>${val}</td>`;
            };

            row.innerHTML = `
                ${buildTd('item_index', 'text-center font-bold col-item select-none', index + 1)}
                ${buildTd('product_id', 'font-bold col-productid', product?.product_custom_id || '-')}
                ${buildTd('product_image_url', 'text-center col-productimage', productImageHtml, true)}
                ${buildTd('client_photo_url', 'text-center col-clientphoto', clientPhotoHtml, true)}
                ${buildTd('design_photo_url', 'text-center col-designphoto', designPhotoHtml, true)}
                ${buildTd('dieline_photo_url', 'text-center col-dielinephoto', dielinePhotoHtml, true)}
                ${buildTd('design_details', 'font-bold col-designdetails font-sans', item.design_details || '-')}
                ${buildTd('size', 'col-size', item.size || '-', false, 'dir="ltr"')}
                ${buildTd('specifications', 'col-specifications font-sans', item.specifications || '-')}
                ${buildTd('sample', 'col-sample font-sans', item.sample || '-')}
                ${buildTd('production', 'col-production font-sans', item.production || '-')}
                ${buildTd('quantity', 'text-center font-bold col-moq', qty.toLocaleString('en-US'))}
                ${buildTd('unit_type', 'text-center col-unit font-sans', item.unit_type || '-')}
                ${buildTd('factory_price_per_unit', 'text-right font-bold col-unitprice', '$' + this.fmt(unitLandedPrice), false, 'dir="ltr"')}
                ${buildTd('total_factory_price', 'text-right font-black col-totalamount', '$' + this.fmt(totalLandedAmount), false, 'dir="ltr"')}
                ${buildTd('qty_per_ctn', 'text-center col-qtyctn', qtyPerCtn.toLocaleString('en-US'))}
                ${buildTd('CTN', 'text-center col-ctn', ctnCount.toLocaleString('en-US'))}
                ${buildTd('gw_per_ctn_kg', 'text-center col-gwctn', (gwPerCtn * ctnCount).toLocaleString('en-US', { maximumFractionDigits: 2 }))}
                ${buildTd('length_cm', 'text-center col-length', lengthCm)}
                ${buildTd('width_cm', 'text-center col-width', widthCm)}
                ${buildTd('height_cm', 'text-center col-height', heightCm)}
                ${buildTd('cbm_per_ctn', 'text-right col-cbmctn', cbmPerCtn.toFixed(4), false, 'dir="ltr"')}
                ${buildTd('total_cbm', 'text-right font-bold col-totalcbm', totalCbm.toFixed(4), false, 'dir="ltr"')}
            `;
            fragment.appendChild(row);
        });
        
        tbody.appendChild(fragment);
        return { grandPieces, grandCtn, grandGw, grandCbm, grandDeliveredTotal };
    },

    updateFooterTotals(totals) {
        document.getElementById('footTotalQuantity').textContent = totals.grandPieces.toLocaleString('en-US');
        document.getElementById('footTotalAmount').textContent = `$${this.fmt(totals.grandDeliveredTotal)}`;
        document.getElementById('footTotalCtn').textContent = totals.grandCtn.toLocaleString('en-US');
        document.getElementById('footTotalGw').textContent = totals.grandGw.toLocaleString('en-US', { maximumFractionDigits: 2 });
        document.getElementById('footTotalCbm').textContent = totals.grandCbm.toFixed(4);

        const grandTotalDisplay = document.getElementById('grandTotalDisplay');
        if (grandTotalDisplay) {
            grandTotalDisplay.textContent = `$${this.fmt(totals.grandDeliveredTotal)}`;
        }
    },

    initResizableColumns() {
        const table = document.querySelector('.print-table');
        if (!table) return;

        const headers = table.querySelectorAll('th');
        headers.forEach(th => {
            if (th.querySelector('.resizer')) return;

            const resizer = document.createElement('div');
            resizer.classList.add('resizer', 'no-print');
            th.appendChild(resizer);

            let startX, startWidth, minAllowedWidth = 30;

            resizer.addEventListener('mousedown', function (e) {
                startX = e.pageX;
                startWidth = th.offsetWidth;
                
                const tempSpan = document.createElement('span');
                tempSpan.style.whiteSpace = 'nowrap';
                tempSpan.style.position = 'absolute';
                tempSpan.style.visibility = 'hidden';
                tempSpan.style.font = window.getComputedStyle(th).font;
                tempSpan.textContent = th.textContent.trim();
                document.body.appendChild(tempSpan);
                
                minAllowedWidth = tempSpan.offsetWidth + 24; 
                document.body.removeChild(tempSpan);

                resizer.classList.add('resizing');

                const onMouseMove = function (e) {
                    let newWidth = startWidth + (e.pageX - startX);
                    if (newWidth < minAllowedWidth) newWidth = minAllowedWidth;
                    
                    th.style.setProperty('width', newWidth + 'px', 'important');
                    th.style.setProperty('min-width', newWidth + 'px', 'important');
                    th.style.setProperty('max-width', newWidth + 'px', 'important');
                };

                const onMouseUp = function () {
                    resizer.classList.remove('resizing');
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
                e.stopPropagation();
                e.preventDefault();
            });
        });
    },

    openImagePreview(src) {
        let modal = document.getElementById('image-preview-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'image-preview-modal';
            modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-300 no-print';
            modal.innerHTML = `
                <div class="relative max-w-4xl max-h-[90vh] p-2 bg-white rounded-2xl shadow-2xl scale-95 transition-transform duration-300 mx-4 flex items-center justify-center">
                    <button onclick="CustomerInvoiceUI.closeImagePreview()" class="absolute -top-12 right-0 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition duration-200">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                    <img id="preview-modal-img" src="" class="max-w-full max-h-[80vh] object-contain rounded-xl">
                </div>
            `;
            modal.addEventListener('click', (e) => {
                if (e.target === modal) CustomerInvoiceUI.closeImagePreview();
            });
            document.body.appendChild(modal);
        }

        const img = document.getElementById('preview-modal-img');
        img.src = src;

        modal.classList.remove('opacity-0', 'pointer-events-none');
        setTimeout(() => {
            const container = modal.querySelector('.relative');
            if (container) {
                container.classList.remove('scale-95');
                container.classList.add('scale-100');
            }
        }, 10);
    },

    closeImagePreview() {
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
    }
};

window.CustomerInvoiceUI = CustomerInvoiceUI;
