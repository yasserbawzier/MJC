// invoice_items_controller.js
// Controller Layer - يربط بين طبقة البيانات وطبقة العرض ويدير الحالة (State)

const State = {
    invoiceItems: [],
    productsLookup: [],
    itemPhotosLookup: {},
    currentInvoiceId: null,
    currentCustomerName: '-',
    currentShippingRatePerCbm: 0,
    uploadingPhotosTracker: {},
    showOnlyActive: false,
    activePhotoItemId: null,
    activePhotoType: null,
    activePhotoUrl: null,
    activeProductSelectorItemId: null
};

// -------------------------------------------------------------
// محرر النصوص المباشر المخصص (Inline Rich Text Editor)
// -------------------------------------------------------------
window.applyInlineStyle = function (command, value, event) {
    if (event) event.preventDefault();
    if (command === 'removeFormat') {
        document.execCommand('removeFormat', false, null);
        document.execCommand('foreColor', false, '#000000');
        document.execCommand('backColor', false, 'transparent');
    } else {
        document.execCommand(command, false, value);
    }
};

class RichTextEditor extends Handsontable.editors.BaseEditor {
    init() {
        this.DIV = document.createElement('div');
        this.DIV.setAttribute('contenteditable', 'true');
        this.DIV.className = 'handsontableInput custom-ht-editor';
        this.DIV.style.position = 'absolute';
        this.DIV.style.display = 'none';
        this.DIV.style.zIndex = '9999';
        this.DIV.style.background = '#fff';
        this.DIV.style.padding = '8px';
        this.DIV.style.border = '2px solid #3b82f6';
        this.DIV.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
        this.DIV.style.outline = 'none';
        this.DIV.style.minWidth = '200px';
        this.DIV.style.minHeight = '60px';
        this.DIV.style.direction = 'rtl';
        this.DIV.style.whiteSpace = 'pre-wrap';
        this.DIV.style.overflowY = 'auto';
        this.DIV.style.maxHeight = '300px';

        this.DIV.addEventListener('mousedown', function (event) {
            event.stopPropagation();
        });

        this.DIV.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (event.shiftKey || event.altKey)) {
                event.stopPropagation();
                document.execCommand('insertLineBreak');
                event.preventDefault();
            }
        });
    }

    prepare(row, col, prop, td, originalValue, cellProperties) {
        super.prepare(row, col, prop, td, originalValue, cellProperties);
        if (!this.DIV.parentNode) {
            document.body.appendChild(this.DIV);
        }
    }

    getValue() { return this.DIV.innerHTML; }
    setValue(value) { this.DIV.innerHTML = value || ''; }
    focus() { this.DIV.focus(); }

    open() {
        const td = this.hot.getCell(this.row, this.col);
        const rect = td.getBoundingClientRect();
        const style = this.DIV.style;

        style.top = `${rect.top + window.scrollY}px`;
        style.left = `${rect.left + window.scrollX}px`;
        style.width = `${rect.width}px`;
        style.minHeight = `${Math.max(rect.height, 60)}px`;
        style.display = '';

        const toolbar = document.getElementById('richTextToolbar');
        if (toolbar) {
            toolbar.style.opacity = '1';
            toolbar.style.pointerEvents = 'auto';
        }

        setTimeout(() => {
            this.DIV.focus();
            if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined" && this.DIV.childNodes.length > 0) {
                const range = document.createRange();
                range.selectNodeContents(this.DIV);
                range.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }, 10);
    }

    close() {
        this.DIV.style.display = 'none';
        const toolbar = document.getElementById('richTextToolbar');
        if (toolbar) {
            toolbar.style.opacity = '0.5';
            toolbar.style.pointerEvents = 'none';
        }
    }
}
window.RichTextEditor = RichTextEditor;

const InvoiceItemsController = {
    // -----------------------------------------
    // دوال المساعدة (Helpers)
    // -----------------------------------------
    getProductById(productId) {
        return State.productsLookup.find(item => item.id === productId) || null;
    },

    getNextItemName() {
        return `Item ${State.invoiceItems.length + 1}`;
    },
    getMergeParentValue(rowIndex, prop) {
        if (rowIndex < 0 || !InvoiceItemsUI.hotInstance) return undefined;
        const plugin = InvoiceItemsUI.hotInstance.getPlugin('mergeCells');
        if (!plugin || !plugin.mergedCellsCollection) return undefined;
        const colIndex = InvoiceItemsUI.hotInstance.propToCol(prop);
        const mergedCell = plugin.mergedCellsCollection.get(rowIndex, colIndex);
        if (mergedCell && (mergedCell.row !== rowIndex || mergedCell.col !== colIndex)) {
            const currentData = InvoiceItemsUI.hotInstance.getSourceData();
            const parentRow = mergedCell.row;
            if (currentData[parentRow]) {
                return currentData[parentRow][prop];
            }
        }
        return undefined;
    },

    getLogicalValue(item, rowIndex, prop) {
        const parentVal = this.getMergeParentValue(rowIndex, prop);
        if (parentVal !== undefined && parentVal !== null && parentVal !== '') {
            return parentVal;
        }
        return item[prop];
    },

    recalculateLocalItemFields(item, keepCtn = false, fieldName = '', rowIndex = -1) {
        // Fetch logical values, falling back to parent if merged
        const qVal = this.getLogicalValue(item, rowIndex, 'quantity');
        const qPerCtnVal = this.getLogicalValue(item, rowIndex, 'qty_per_ctn');
        const lVal = this.getLogicalValue(item, rowIndex, 'length_cm');
        const wVal = this.getLogicalValue(item, rowIndex, 'width_cm');
        const hVal = this.getLogicalValue(item, rowIndex, 'height_cm');
        const factoryPriceVal = this.getLogicalValue(item, rowIndex, 'factory_price_per_unit');
        const shippingPriceVal = this.getLogicalValue(item, rowIndex, 'shipping_price_per_unit');

        const parentCtn = this.getMergeParentValue(rowIndex, 'CTN');
        if (parentCtn !== undefined && parentCtn !== null && !Number.isNaN(parentCtn)) {
            item.CTN = parentCtn;
        } else if (!keepCtn) {
            const q = Number(qVal) || 0;
            const qPerCtn = Number(qPerCtnVal) || 0;
            if (q > 0 && qPerCtn > 0) {
                item.CTN = Math.ceil(q / qPerCtn);
            } else {
                item.CTN = null;
            }
        }

        const parentCbmPerCtn = this.getMergeParentValue(rowIndex, 'cbm_per_ctn');
        let cbmPerCtn = null;
        if (parentCbmPerCtn !== undefined && parentCbmPerCtn !== null && !Number.isNaN(parentCbmPerCtn)) {
            item.cbm_per_ctn = parentCbmPerCtn;
            cbmPerCtn = parentCbmPerCtn;
        } else {
            const l = Number(lVal) || 0;
            const w = Number(wVal) || 0;
            const h = Number(hVal) || 0;
            if (l > 0 && w > 0 && h > 0) {
                cbmPerCtn = (l / 100) * (w / 100) * (h / 100);
                item.cbm_per_ctn = Number(cbmPerCtn.toFixed(4));
            } else {
                item.cbm_per_ctn = null; 
            }
        }

        const parentTotalCbm = this.getMergeParentValue(rowIndex, 'total_cbm');
        if (parentTotalCbm !== undefined && parentTotalCbm !== null) {
            item.total_cbm = parentTotalCbm;
        } else {
            const ctnVal = item.CTN !== null && item.CTN !== undefined ? item.CTN : 0;
            if (cbmPerCtn !== null && ctnVal > 0) {
                item.total_cbm = Number((cbmPerCtn * ctnVal).toFixed(4));
            } else {
                item.total_cbm = null;
            }
        }

        const parentFactoryPrice = this.getMergeParentValue(rowIndex, 'total_factory_price');
        if (parentFactoryPrice !== undefined && parentFactoryPrice !== null) {
            item.total_factory_price = parentFactoryPrice;
        } else {
            item.total_factory_price = Number(((Number(qVal) || 0) * (Number(factoryPriceVal) || 0)).toFixed(2));
        }

        const parentShippingCost = this.getMergeParentValue(rowIndex, 'total_shipping_cost');
        if (parentShippingCost !== undefined && parentShippingCost !== null) {
            item.total_shipping_cost = parentShippingCost;
        } else {
            if (fieldName === 'shipping_price_per_unit' || Number(shippingPriceVal) > 0) {
                item.total_shipping_cost = Number(((Number(shippingPriceVal) || 0) * (Number(qVal) || 0)).toFixed(2));
            } else if (item.total_cbm !== null && State.currentShippingRatePerCbm > 0) {
                item.total_shipping_cost = Number((item.total_cbm * State.currentShippingRatePerCbm).toFixed(2));
                const q = Number(qVal) || 0;
                if (item.total_shipping_cost && q > 0) {
                    item.shipping_price_per_unit = Number((item.total_shipping_cost / q).toFixed(4));
                }
            } else {
                item.total_shipping_cost = 0;
                item.shipping_price_per_unit = 0;
            }
        }

        // حساب المنتج + الشحن
        const parentProdShipping = this.getMergeParentValue(rowIndex, 'prodShippingUnit');
        if (parentProdShipping !== undefined) {
            item.prodShippingUnit = parentProdShipping;
        } else {
            const factoryUnit = Number(item.factory_price_per_unit || 0);
            const shippingUnit = Number(item.shipping_price_per_unit || 0);
            item.prodShippingUnit = Number((factoryUnit + shippingUnit).toFixed(4));
        }
        
        const parentTotalProdShipping = this.getMergeParentValue(rowIndex, 'totalProdShippingItem');
        if (parentTotalProdShipping !== undefined) {
            item.totalProdShippingItem = parentTotalProdShipping;
        } else {
            item.totalProdShippingItem = Number(((item.quantity || 0) * (item.prodShippingUnit || 0)).toFixed(2));
        }
    },

    calculateStats(itemsToRender) {
        let activeMOQ = 0, activeAmountVal = 0, activeShippingVal = 0, activeCtnVal = 0, activeCbmVal = 0;
        itemsToRender.forEach(item => {
            if (item.status === true) {
                activeMOQ += Number(item.quantity || 0);
                activeAmountVal += Number(item.total_factory_price || 0);
                activeShippingVal += Number(item.total_shipping_cost || 0);
                activeCtnVal += Number(item.CTN || 0);
                if (item.total_cbm !== null && item.total_cbm !== '-') {
                    activeCbmVal += Number(item.total_cbm);
                }
            }
        });
        return { activeMOQ, activeAmountVal, activeShippingVal, activeCtnVal, activeCbmVal };
    },

    async compressImageIfNeeded(file) {
        if (!file || !file.type.startsWith('image/') || file.type.includes('svg')) return file;
        if (file.size < 300 * 1024) return file;
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width; let height = img.height;
                    const MAX_SIZE = 1200;
                    if (width > height) {
                        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                    } else {
                        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                    }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg', lastModified: Date.now() }));
                        } else {
                            resolve(file);
                        }
                    }, 'image/jpeg', 0.8);
                };
                img.onerror = () => resolve(file);
            };
            reader.onerror = () => resolve(file);
        });
    },

    // -----------------------------------------
    // Renderers للجدول
    // -----------------------------------------
    getHandlers() {
        const self = this;
        return {
            customColoredNumericRenderer: function (instance, td, row, col, prop, value, cellProperties) {
                Handsontable.renderers.NumericRenderer.apply(this, arguments);
                InvoiceItemsUI.applyColumnColors(instance, td, row, prop);
            },
            customColoredHtmlRenderer: function (instance, td, row, col, prop, value, cellProperties) {
                Handsontable.renderers.HtmlRenderer.apply(this, arguments);
                InvoiceItemsUI.applyColumnColors(instance, td, row, prop);
            },
            photoRenderer: function (instance, td, row, col, prop, value, cellProperties) {
                Handsontable.renderers.BaseRenderer.apply(this, arguments);
                const itemsToRender = State.showOnlyActive ? State.invoiceItems.filter(item => item.status === true) : State.invoiceItems;
                const item = itemsToRender[row];
                if (!item) return;

                const itemPhotos = State.itemPhotosLookup[item.id] || {};
                const photoUrl = itemPhotos[prop] || null;
                const isUploading = State.uploadingPhotosTracker[`${item.id}_${prop}`];

                Handsontable.dom.empty(td);
                td.style.padding = '4px';
                td.className = cellProperties.className || 'htCenter htMiddle';

                if (photoUrl) {
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = 'position:relative;width:48px;height:48px;margin:auto;display:flex;align-items:center;justify-content:center;';

                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.style.cssText = 'width:48px;height:48px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.1);display:block;';
                    btn.onclick = () => {
                        if (item.status !== false) {
                            self.openPhotoActionsModal(item.id, prop, photoUrl);
                        } else {
                            self.openImageModal(photoUrl);
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
                        btn.onclick = () => self.openPhotoActionsModal(item.id, prop, null);
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
            },
            productImageRenderer: function (instance, td, row, col, prop, value, cellProperties) {
                Handsontable.renderers.BaseRenderer.apply(this, arguments);
                Handsontable.dom.empty(td);
                td.style.padding = '4px';
                td.className = cellProperties.className || 'htCenter htMiddle';

                const itemsToRender = State.showOnlyActive ? State.invoiceItems.filter(item => item.status === true) : State.invoiceItems;
                const item = itemsToRender[row];
                const product = item ? self.getProductById(item.product_id) : null;
                const imgUrl = (product && product.product_image_url) ? product.product_image_url : null;

                if (imgUrl) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.onclick = () => self.openImageModal(imgUrl);
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
            },
            productIdRenderer: function (instance, td, row, col, prop, value, cellProperties) {
                Handsontable.renderers.BaseRenderer.apply(this, arguments);
                Handsontable.dom.empty(td);

                const itemsToRender = State.showOnlyActive ? State.invoiceItems.filter(item => item.status === true) : State.invoiceItems;
                const item = itemsToRender[row];
                if (!item) return;

                td.className = cellProperties.className ? (cellProperties.className + ' font-bold') : 'htCenter htMiddle font-bold';

                const product = self.getProductById(item.product_id);
                const productCustomId = product ? product.product_custom_id : (value || '-');

                if (item.status !== false) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.onclick = () => self.openProductSelectorModal(item.id);
                    btn.className = 'text-blue-600 hover:text-blue-800 font-bold hover:underline transition';
                    btn.textContent = productCustomId;
                    td.appendChild(btn);
                } else {
                    const span = document.createElement('span');
                    span.className = 'text-gray-400';
                    span.textContent = productCustomId;
                    td.appendChild(span);
                }
            },
            actionsRenderer: function (instance, td, row, col, prop, value, cellProperties) {
                Handsontable.renderers.BaseRenderer.apply(this, arguments);
                Handsontable.dom.empty(td);

                const itemsToRender = State.showOnlyActive ? State.invoiceItems.filter(item => item.status === true) : State.invoiceItems;
                const item = itemsToRender[row];
                if (!item) return;

                td.className = cellProperties.className || 'htCenter htMiddle';

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.onclick = () => self.deleteInvoiceItem(item.id);
                btn.className = 'bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm hover:shadow active:scale-95 transition-all text-xs';
                btn.textContent = 'حذف';
                td.appendChild(btn);
            },
            saveMergeState: async (cellRange, isMerge) => {
                const itemsToRender = State.showOnlyActive ? State.invoiceItems.filter(item => item.status === true) : State.invoiceItems;

                let fromRowRaw = cellRange.from ? cellRange.from.row : cellRange.start.row;
                let toRowRaw = cellRange.to ? cellRange.to.row : cellRange.end.row;
                let fromColRaw = cellRange.from ? cellRange.from.col : cellRange.start.col;
                let toColRaw = cellRange.to ? cellRange.to.col : cellRange.end.col;

                const fromRow = Math.min(fromRowRaw, toRowRaw);
                const toRow = Math.max(fromRowRaw, toRowRaw);
                const fromCol = Math.min(fromColRaw, toColRaw);
                const toCol = Math.max(fromColRaw, toColRaw);

                const columnsConfig = InvoiceItemsUI.hotInstance.getSettings().columns;
                if (fromCol < 0 || fromCol >= columnsConfig.length) return;
                const colName = columnsConfig[fromCol].data;

                const dbUpdates = [];

                if (isMerge) {
                    const rowspan = toRow - fromRow + 1;
                    const colspan = toCol - fromCol + 1;

                    const parentItem = itemsToRender[fromRow];
                    let primaryValue = null;
                    if (parentItem) {
                        let meta = parentItem.merge_metadata;
                        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }
                        if (!meta || typeof meta !== 'object') meta = {};

                        meta[colName] = { rowspan, colspan };
                        parentItem.merge_metadata = meta;
                        dbUpdates.push({ id: parentItem.id, payload: { merge_metadata: meta } });

                        primaryValue = parentItem[colName];
                    }

                    for (let r = fromRow + 1; r <= toRow; r++) {
                        const childItem = itemsToRender[r];
                        if (childItem) {
                            let meta = childItem.merge_metadata;
                            if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }
                            if (!meta || typeof meta !== 'object') meta = {};
                            delete meta[colName];
                            childItem.merge_metadata = meta;

                            // Forward-fill the primary value to keep math calculations correct
                            if (primaryValue !== undefined && primaryValue !== null) {
                                childItem[colName] = primaryValue;
                                InvoiceItemsController.recalculateLocalItemFields(childItem, colName === 'CTN', colName, r);

                                // Include recalculated fields in payload
                                const payload = { merge_metadata: meta };
                                const computedCols = ['cbm_per_ctn', 'total_cbm', 'total_factory_price', 'total_shipping_cost'];
                                const virtualCols = ['client_photo_url', 'design_photo_url', 'dieline_photo_url', 'design_details', 'product_image_url', 'actions'];
                                
                                if (!computedCols.includes(colName) && !virtualCols.includes(colName)) {
                                    payload[colName] = primaryValue;
                                }

                                if (colName === 'quantity' || colName === 'qty_per_ctn') {
                                    payload['CTN'] = childItem.CTN;
                                }
                                dbUpdates.push({ id: childItem.id, payload: payload });
                            } else {
                                dbUpdates.push({ id: childItem.id, payload: { merge_metadata: meta } });
                            }
                        }
                    }
                } else {
                    for (let r = fromRow; r <= toRow; r++) {
                        const item = itemsToRender[r];
                        if (item) {
                            let meta = item.merge_metadata;
                            if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }
                            if (meta && typeof meta === 'object') {
                                delete meta[colName];
                                item.merge_metadata = meta;
                                dbUpdates.push({ id: item.id, payload: { merge_metadata: meta } });
                            }
                        }
                    }
                }

                try {
                    await Promise.all(dbUpdates.map(upd => InvoiceItemsAPI.updateInvoiceItem(upd.id, upd.payload)));
                    console.log('Saved merge state successfully!');

                    // تحديث الإحصائيات وإعادة رسم الجدول لعرض الحسابات المحدثة بعد الدمج
                    const itemsToRender = State.showOnlyActive ? State.invoiceItems.filter(item => item.status === true) : State.invoiceItems;
                    const stats = InvoiceItemsController.calculateStats(itemsToRender);
                    InvoiceItemsUI.updateFooterStats(stats);

                    if (InvoiceItemsUI.hotInstance) {
                        const currentData = InvoiceItemsUI.hotInstance.getSourceData();
                        if (currentData.length > 0) {
                            const summaryRow = currentData[currentData.length - 1];
                            if (summaryRow && summaryRow.is_summary) {
                                summaryRow.quantity = stats.activeMOQ;
                                summaryRow.total_factory_price = stats.activeAmountVal;
                                summaryRow.total_shipping_cost = stats.activeShippingVal;
                                summaryRow.CTN = stats.activeCtnVal;
                                summaryRow.total_cbm = stats.activeCbmVal > 0 ? stats.activeCbmVal.toFixed(4) : '-';
                            }
                        }
                        InvoiceItemsUI.hotInstance.render();
                    }
                } catch (err) {
                    InvoiceItemsUI.showToast('❌ فشل حفظ دمج الخلايا في قاعدة البيانات: ' + err.message, 'error');
                }
            },
            saveStyleState: async (cellRange, styleType, colorClass) => {
                const fromRow = cellRange.from ? cellRange.from.row : cellRange.start.row;
                const toRow = cellRange.to ? cellRange.to.row : cellRange.end.row;
                const fromCol = cellRange.from ? cellRange.from.col : cellRange.start.col;
                const toCol = cellRange.to ? cellRange.to.col : cellRange.end.col;

                const columnsConfig = InvoiceItemsUI.hotInstance.getSettings().columns;
                if (!columnsConfig) return;

                const dbUpdates = [];

                for (let r = Math.min(fromRow, toRow); r <= Math.max(fromRow, toRow); r++) {
                    const item = InvoiceItemsUI.hotInstance.getSourceDataAtRow(r);
                    if (!item || item.is_summary) continue;

                    let meta = item.merge_metadata;
                    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }
                    if (!meta || typeof meta !== 'object') meta = {};

                    let changed = false;

                    for (let c = Math.min(fromCol, toCol); c <= Math.max(fromCol, toCol); c++) {
                        const colDef = columnsConfig[c];
                        if (!colDef) continue;
                        const colName = colDef.data;

                        if (!meta[colName]) meta[colName] = {};
                        if (styleType === 'bg') {
                            meta[colName].bg = colorClass;
                        } else if (styleType === 'color') {
                            meta[colName].color = colorClass;
                        }
                        changed = true;
                    }

                    if (changed) {
                        item.merge_metadata = meta;
                        dbUpdates.push({ id: item.id, payload: { merge_metadata: meta } });
                    }
                }

                if (dbUpdates.length > 0) {
                    try {
                        await Promise.all(dbUpdates.map(upd => InvoiceItemsAPI.updateInvoiceItem(upd.id, upd.payload)));
                        InvoiceItemsUI.hotInstance.render();
                        InvoiceItemsUI.showToast('تم تطبيق اللون بنجاح', 'success');
                    } catch (err) {
                        InvoiceItemsUI.showToast('❌ فشل حفظ الألوان في قاعدة البيانات: ' + err.message, 'error');
                    }
                }
            },
            handleHandsontableChange: async (changes, source) => {
                if (!changes) return;

                for (let i = 0; i < changes.length; i++) {
                    const change = changes[i];
                    const row = change[0];
                    const prop = change[1];
                    const oldValue = change[2];
                    let newValue = change[3];

                    if (oldValue === newValue) continue;

                    const itemsToRender = State.showOnlyActive
                        ? State.invoiceItems.filter(item => item.status === true)
                        : State.invoiceItems;

                    if (row >= itemsToRender.length) continue;

                    const item = itemsToRender[row];
                    if (!item) continue;

                    const virtualColumns = [
                        'client_photo_url', 'design_photo_url', 'dieline_photo_url',
                        'design_details', 'product_image_url', 'actions', 'total_factory_price',
                        'total_shipping_cost', 'cbm_per_ctn', 'total_cbm'
                    ];
                    if (virtualColumns.includes(prop)) continue;

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

                    const keepManualCtn = (prop === 'CTN');
                    self.recalculateLocalItemFields(item, keepManualCtn, prop, row);

                    let updatePayload = {};
                    updatePayload[prop] = newValue;
                    if (prop === 'quantity' || prop === 'qty_per_ctn') {
                        updatePayload['CTN'] = item.CTN;
                    }

                    try {
                        await InvoiceItemsAPI.updateInvoiceItem(item.id, updatePayload);

                        let meta = item.merge_metadata;
                        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { } }
                        
                        if (meta && typeof meta === 'object' && meta[prop] && meta[prop].rowspan > 1) {
                            const rowspan = meta[prop].rowspan;
                            const dbUpdates = [];
                            const hotChanges = [];
                            
                            for (let r = row + 1; r < row + rowspan; r++) {
                                const childItem = itemsToRender[r];
                                if (childItem) {
                                    // 1. Clone child item to calculate new values without mutating the original yet
                                    const clone = Object.assign({}, childItem);
                                    clone[prop] = newValue;
                                    self.recalculateLocalItemFields(clone, keepManualCtn, prop, r);
                                    
                                    // 2. Collect changes for Handsontable to force UI update
                                    hotChanges.push([r, prop, newValue]);
                                    if (clone.CTN !== childItem.CTN) hotChanges.push([r, 'CTN', clone.CTN]);
                                    if (clone.cbm_per_ctn !== childItem.cbm_per_ctn) hotChanges.push([r, 'cbm_per_ctn', clone.cbm_per_ctn]);
                                    if (clone.total_cbm !== childItem.total_cbm) hotChanges.push([r, 'total_cbm', clone.total_cbm]);
                                    if (clone.total_shipping_cost !== childItem.total_shipping_cost) hotChanges.push([r, 'total_shipping_cost', clone.total_shipping_cost]);
                                    if (clone.total_factory_price !== childItem.total_factory_price) hotChanges.push([r, 'total_factory_price', clone.total_factory_price]);
                                    if (clone.shipping_price_per_unit !== childItem.shipping_price_per_unit) hotChanges.push([r, 'shipping_price_per_unit', clone.shipping_price_per_unit]);
                                    
                                    // 3. Build payload for API - ONLY base columns, no generated columns
                                    let childPayload = { [prop]: newValue };
                                    if (clone.CTN !== childItem.CTN) childPayload['CTN'] = clone.CTN;
                                    
                                    dbUpdates.push(InvoiceItemsAPI.updateInvoiceItem(childItem.id, childPayload));
                                }
                            }
                            
                            if (dbUpdates.length > 0) {
                                // Execute DB updates in background, don't await to not block UI
                                Promise.all(dbUpdates).catch(err => console.error('Child update error:', err));
                            }
                            
                            if (hotChanges.length > 0 && InvoiceItemsUI.hotInstance) {
                                // Handsontable will natively mutate the childItems and trigger UI update
                                InvoiceItemsUI.hotInstance.setDataAtRowProp(hotChanges, 'syncMerge');
                            }
                        }

                    } catch (err) {
                        InvoiceItemsUI.showToast('❌ حدث خطأ: ' + err.message, 'error');
                        item[prop] = oldValue;
                        self.recalculateLocalItemFields(item, keepManualCtn, prop, row);
                    }
                }

                // تحديث الإحصائيات وصف المجموع بدون إعادة تحميل كامل للبيانات (يمنع التعليق)
                const itemsToRender = State.showOnlyActive
                    ? State.invoiceItems.filter(item => item.status === true)
                    : State.invoiceItems;

                const stats = self.calculateStats(itemsToRender);
                InvoiceItemsUI.updateFooterStats(stats);

                if (InvoiceItemsUI.hotInstance) {
                    const currentData = InvoiceItemsUI.hotInstance.getSourceData();
                    if (currentData.length > 0) {
                        const summaryRow = currentData[currentData.length - 1];
                        if (summaryRow && summaryRow.is_summary) {
                            summaryRow.quantity = stats.activeMOQ;
                            summaryRow.total_factory_price = stats.activeAmountVal;
                            summaryRow.total_shipping_cost = stats.activeShippingVal;
                            summaryRow.CTN = stats.activeCtnVal;
                            summaryRow.total_cbm = stats.activeCbmVal > 0 ? stats.activeCbmVal.toFixed(4) : '-';
                        }
                    }
                    InvoiceItemsUI.hotInstance.render();
                }
            }
        };
    },

    // -----------------------------------------
    // دورة حياة الصفحة والتحديث
    // -----------------------------------------
    async init() {
        const params = new URLSearchParams(window.location.search);
        State.currentInvoiceId = params.get('invoice_id');

        if (!State.currentInvoiceId) {
            InvoiceItemsUI.showToast('خطأ: معرف الفاتورة غير محدد!', 'error');
            setTimeout(() => { window.location.href = 'invoices.html'; }, 1500);
            return;
        }

        this.bindEvents();

        try {
            const itemsPromise = InvoiceItemsAPI.fetchInvoiceItems(State.currentInvoiceId);
            const productsPromise = InvoiceItemsAPI.fetchProducts();
            const detailsPromise = InvoiceItemsAPI.fetchInvoiceDetails(State.currentInvoiceId);

            const itemsData = await itemsPromise;
            State.invoiceItems = itemsData;
            State.itemPhotosLookup = {};
            itemsData.forEach(item => {
                if (item.item_photos) {
                    const photos = Array.isArray(item.item_photos) ? item.item_photos[0] : item.item_photos;
                    if (photos) {
                        State.itemPhotosLookup[item.id] = photos;
                        
                        // Generate dynamic design_details HTML from nested elements
                        let detailsHtml = '';
                        const designs = Array.isArray(photos.design_assets) ? photos.design_assets : (photos.design_assets ? [photos.design_assets] : []);
                        designs.forEach(d => {
                             const elements = d.design_elements || [];
                             // Sort elements by display_order
                             const sortedElements = [...elements].sort((a, b) => (a.display_order || 1) - (b.display_order || 1));
                             sortedElements.forEach(el => {
                                 if (!el.is_approved) return;
                                 const typeName = el.asset_types ? el.asset_types.name : 'عنصر';
                                 detailsHtml += `<strong>${typeName}</strong><br>`;
                                 if (el.color_code) detailsHtml += `<span style="color: #666;">اللون:</span> <span style="font-family: monospace;" dir="ltr">${el.color_code}</span><br>`;
                                 if (el.additional_specifications) detailsHtml += `<span style="color: #666;">ملاحظات:</span> ${el.additional_specifications}<br>`;
                                 detailsHtml += '<br>';
                             });
                        });
                        
                        // Override database design_details with dynamically generated text
                        if (detailsHtml) {
                            item.design_details = detailsHtml.trim();
                        }
                    }
                }
            });

            this.renderTable();
            InvoiceItemsUI.updateItemNamePlaceholder(this.getNextItemName());

            productsPromise.then(data => {
                State.productsLookup = data;
                InvoiceItemsUI.updateProductOptionsDOM(data);
                InvoiceItemsUI.rebuildInvoiceItemRow();
            });

            detailsPromise.then(data => {
                State.currentCustomerName = data.customers?.full_name || '-';
                State.currentShippingRatePerCbm = data.Price_Per_CBM || 0;
                InvoiceItemsUI.updateInvoiceDetailsDOM(data, State.currentInvoiceId);
                // recalculate shipping if rate arrived after items
                State.invoiceItems.forEach(item => this.recalculateLocalItemFields(item, true));
                this.renderTable();
            });

        } catch (err) {
            console.error('Error initializing page:', err);
        }
    },

    bindEvents() {
        const toggleBtn = document.getElementById('toggleActiveFilterBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                State.showOnlyActive = !State.showOnlyActive;
                const text = document.getElementById('filterBtnText');
                if (State.showOnlyActive) {
                    toggleBtn.className = "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 hover:text-green-800 transition-all duration-200 shadow-sm active:scale-95 select-none";
                    if (text) text.textContent = "عرض كافة العناصر";
                } else {
                    toggleBtn.className = "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200 shadow-sm active:scale-95 select-none";
                    if (text) text.textContent = "عرض العناصر النشطة فقط";
                }
                this.renderTable();
            });
        }
    },

    renderTable() {
        let itemsToRender = State.showOnlyActive
            ? State.invoiceItems.filter(item => item.status === true)
            : [...State.invoiceItems];

        // Calculate totals dynamically here and append summary row
        const stats = this.calculateStats(itemsToRender); // Returns purely numerical stats based on UI logic
        InvoiceItemsUI.updateFooterStats(stats);

        // Add a virtual row for summary in handsontable
        let sumQuantity = 0, sumTotalFactory = 0, sumTotalShipping = 0, sumTotalCTN = 0, sumTotalCBM = 0;
        itemsToRender.forEach(item => {
            sumQuantity += Number(item.quantity || 0);
            sumTotalFactory += Number(item.total_factory_price || 0);
            sumTotalShipping += Number(item.total_shipping_cost || 0);
            sumTotalCTN += Number(item.CTN || 0);
            sumTotalCBM += Number(item.total_cbm || 0);
        });

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

        InvoiceItemsUI.initHandsontable('excelGrid', itemsToRender, this.getHandlers());
    },

    // -----------------------------------------
    // إضافة وتعديل وحذف البنود
    // -----------------------------------------
    async addNewBlankInvoiceItem() {
        if (!State.currentInvoiceId) return InvoiceItemsUI.showToast('⚠️ لا يوجد معرف فاتورة نشط!', 'error');

        const nextItemName = this.getNextItemName();
        const payload = {
            invoice_id: State.currentInvoiceId,
            item_name: nextItemName,
            quantity: 1, factory_price_per_unit: 0,
            qty_per_ctn: 1, CTN: 1, gw_per_ctn_kg: 0,
            length_cm: 0, width_cm: 0, height_cm: 0,
            status: true, place: '1'
        };

        const toast = InvoiceItemsUI.showToast(`جاري إضافة سطر جديد...`);
        try {
            const data = await InvoiceItemsAPI.insertInvoiceItem(payload);
            if (data) {
                State.invoiceItems.push(data);
                State.itemPhotosLookup[data.id] = { client_photo_url: null, design_photo_url: null, dieline_photo_url: null };
            }
            this.renderTable();
            toast.update(`🎉 تم إضافة البند بنجاح!`, 'success');
        } catch (err) {
            toast.update(`❌ فشل إضافة البند: ${err.message}`, 'error');
        }
    },

    async deleteInvoiceItem(itemId) {
        if (!confirm('هل أنت متأكد من الحذف؟')) return;
        const toast = InvoiceItemsUI.showToast('جاري الحذف...');
        try {
            await InvoiceItemsAPI.deleteInvoiceItem(itemId);
            State.invoiceItems = State.invoiceItems.filter(item => item.id !== itemId);
            delete State.itemPhotosLookup[itemId];
            this.renderTable();
            toast.update('🎉 تم الحذف بنجاح!', 'success');
        } catch (err) {
            toast.update(`❌ فشل الحذف: ${err.message}`, 'error');
        }
    },

    // -----------------------------------------
    // صور الخلايا (Modal Actions)
    // -----------------------------------------
    openPhotoActionsModal(itemId, photoType, currentPhotoUrl) {
        State.activePhotoItemId = itemId;
        State.activePhotoType = photoType;
        State.activePhotoUrl = currentPhotoUrl;

        const modal = document.getElementById('photoActionsModal');
        const title = document.getElementById('photoActionsTitle');
        const viewBtn = document.getElementById('viewPhotoActionBtn');
        if (!modal || !title || !viewBtn) return;

        let typeName = 'الصورة';
        if (photoType === 'client_photo_url') typeName = 'صورة العميل';
        else if (photoType === 'design_photo_url') typeName = 'صورة التصميم';
        else if (photoType === 'dieline_photo_url') typeName = 'صورة الديلاين';
        title.textContent = `خيارات ${typeName}`;

        if (currentPhotoUrl) {
            viewBtn.disabled = false;
            viewBtn.classList.replace('opacity-50', 'bg-blue-50');
            viewBtn.classList.add('text-blue-900', 'border-blue-100');
        } else {
            viewBtn.disabled = true;
            viewBtn.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-100', 'border-gray-200');
            viewBtn.classList.remove('bg-blue-50', 'border-blue-100', 'hover:bg-blue-100', 'text-blue-900');
        }
        modal.classList.remove('hidden');
    },

    openImageModal(url) {
        const modal = document.getElementById('imagePreviewModal');
        const modalImg = document.getElementById('modalPreviewImage');
        if (!modal || !modalImg) return;
        modalImg.src = url;
        modal.classList.remove('hidden');
    },

    closeImageModal() {
        const modal = document.getElementById('imagePreviewModal');
        const modalImg = document.getElementById('modalPreviewImage');
        if (!modal || !modalImg) return;
        modalImg.src = '';
        modal.classList.add('hidden');
    },

    async handlePhotoUpload(file) {
        if (!file || !State.activePhotoItemId || !State.activePhotoType) return;

        const itemId = State.activePhotoItemId;
        const photoType = State.activePhotoType;
        document.getElementById('photoActionsModal').classList.add('hidden');

        const trackerKey = `${itemId}_${photoType}`;
        const tempLocalUrl = URL.createObjectURL(file);
        const oldPhotoUrl = State.itemPhotosLookup[itemId]?.[photoType] || null;

        if (!State.itemPhotosLookup[itemId]) State.itemPhotosLookup[itemId] = {};
        State.itemPhotosLookup[itemId][photoType] = tempLocalUrl;
        State.uploadingPhotosTracker[trackerKey] = true;
        InvoiceItemsUI.rebuildInvoiceItemRow();

        const toast = InvoiceItemsUI.showToast(`جاري رفع الصورة...`);
        try {
            const compressed = await this.compressImageIfNeeded(file);
            const uploadedUrl = await InvoiceItemsAPI.uploadImage(compressed);
            if (!uploadedUrl) throw new Error('فشل رفع الصورة');

            const existingPhotos = State.itemPhotosLookup[itemId] || {};
            const payload = { item_id: itemId, [photoType]: uploadedUrl };
            if (existingPhotos.id && existingPhotos.id !== tempLocalUrl) {
                await InvoiceItemsAPI.updateItemPhotos(existingPhotos.id, { [photoType]: uploadedUrl });
            } else {
                await InvoiceItemsAPI.insertItemPhotos(payload);
            }

            State.itemPhotosLookup[itemId][photoType] = uploadedUrl;
            delete State.uploadingPhotosTracker[trackerKey];
            InvoiceItemsUI.rebuildInvoiceItemRow();
            toast.update('🎉 تم رفع الصورة بنجاح!', 'success');
        } catch (err) {
            if (oldPhotoUrl) State.itemPhotosLookup[itemId][photoType] = oldPhotoUrl;
            else delete State.itemPhotosLookup[itemId][photoType];
            delete State.uploadingPhotosTracker[trackerKey];
            InvoiceItemsUI.rebuildInvoiceItemRow();
            toast.update(`❌ فشل: ${err.message}`, 'error');
        }
    },

    // -----------------------------------------
    // المنتجات
    // -----------------------------------------
    openProductSelectorModal(itemId) {
        State.activeProductSelectorItemId = itemId;
        const searchInput = document.getElementById('productSelectorSearchInput');
        if (searchInput) searchInput.value = '';
        this.renderSelectorProducts('');
        document.getElementById('productSelectorModal').classList.remove('hidden');
    },

    renderSelectorProducts(filterText = '') {
        const grid = document.getElementById('productSelectorGrid');
        if (!grid) return;
        grid.innerHTML = '';
        const normalized = filterText.trim().toLowerCase();

        const filtered = State.productsLookup.filter(p => {
            if (!normalized) return true;
            return (p.product_custom_id || '').toLowerCase().includes(normalized) ||
                (p.product_name || '').toLowerCase().includes(normalized);
        });

        if (filtered.length === 0) {
            grid.innerHTML = '<div class="text-center p-8 text-gray-500">لا توجد نتائج.</div>';
            return;
        }

        filtered.forEach(product => {
            const card = document.createElement('div');
            card.className = 'flex flex-col sm:flex-row items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-white hover:border-blue-100 hover:shadow-md transition-all gap-4';
            const imgHtml = product.product_image_url
                ? `<img src="${product.product_image_url}" class="w-16 h-16 object-cover rounded-lg border border-gray-200">`
                : `<div class="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center text-xs">بدون صورة</div>`;
            card.innerHTML = `
                <div class="flex items-center gap-4 w-full sm:w-auto">
                    ${imgHtml}
                    <div class="text-right space-y-1">
                        <div class="flex items-center gap-2">
                            <span class="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">${product.product_custom_id}</span>
                            <h4 class="font-bold text-gray-800 text-sm">${product.product_name}</h4>
                        </div>
                    </div>
                </div>
                <button type="button" onclick="InvoiceItemsController.selectProductForInvoiceItem('${product.id}')" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded-xl shadow-sm text-sm">ربط بالبند</button>
            `;
            grid.appendChild(card);
        });
    },

    async selectProductForInvoiceItem(productId) {
        if (!State.activeProductSelectorItemId) return;
        document.getElementById('productSelectorModal').classList.add('hidden');

        const itemId = State.activeProductSelectorItemId;
        const itemIndex = State.invoiceItems.findIndex(i => i.id === itemId);
        if (itemIndex === -1) return;

        const oldProductId = State.invoiceItems[itemIndex].product_id;
        State.invoiceItems[itemIndex].product_id = productId;
        InvoiceItemsUI.rebuildInvoiceItemRow();

        const toast = InvoiceItemsUI.showToast('جاري الربط...');
        try {
            await InvoiceItemsAPI.updateInvoiceItem(itemId, { product_id: productId });
            toast.update('🎉 تم الربط بنجاح!', 'success');
        } catch (err) {
            State.invoiceItems[itemIndex].product_id = oldProductId;
            InvoiceItemsUI.rebuildInvoiceItemRow();
            toast.update(`❌ فشل الربط: ${err.message}`, 'error');
        }
    },

    // -----------------------------------------
    // تصدير إكسل
    // -----------------------------------------
    exportToExcel() {
        if (!InvoiceItemsUI.hotInstance) return InvoiceItemsUI.showToast('لم يتم تحميل الجدول', 'error');

        const itemsToRender = State.showOnlyActive ? State.invoiceItems.filter(item => item.status === true) : State.invoiceItems;
        const columnsConfig = InvoiceItemsUI.hotInstance.getSettings().columns;
        const headers = InvoiceItemsUI.hotInstance.getColHeader();
        const aoa = [];

        const headerRow = [];
        headers.forEach((h, colIdx) => {
            const colDef = columnsConfig[colIdx];
            let bgColor = "FFE5E7EB";
            if (colDef) {
                if (['shipping_price_per_unit'].includes(colDef.data)) bgColor = "FFFECACA";
                else if (['quantity', 'unit_type', 'factory_price_per_unit'].includes(colDef.data)) bgColor = "FFBFDBFE";
                else if (['qty_per_ctn', 'CTN', 'gw_per_ctn_kg', 'length_cm', 'width_cm', 'height_cm'].includes(colDef.data)) bgColor = "FFE8DCCB";
            }
            headerRow.push({ v: h ? h.toString() : "", s: { fill: { fgColor: { rgb: bgColor } }, font: { bold: true } } });
        });
        aoa.push(headerRow);

        itemsToRender.forEach(item => {
            const rowData = [];
            columnsConfig.forEach(col => {
                let val = ''; let isFormula = false;
                if (col.data === 'product_id') {
                    const p = this.getProductById(item.product_id);
                    val = p ? p.product_custom_id : '';
                } else if (col.data === 'product_image_url') {
                    const p = this.getProductById(item.product_id);
                    if (p && p.product_image_url) { val = `IMAGE("${p.product_image_url}")`; isFormula = true; }
                } else if (['client_photo_url', 'design_photo_url', 'dieline_photo_url'].includes(col.data)) {
                    const url = (State.itemPhotosLookup[item.id] || {})[col.data];
                    if (url) { val = `IMAGE("${url}")`; isFormula = true; }
                } else {
                    val = item[col.data] || '';
                    if (typeof val === 'string' && val.includes('<')) {
                        const temp = document.createElement('div'); temp.innerHTML = val;
                        val = temp.textContent || '';
                    }
                }

                let bgColor = "FFFFFFFF";
                if (['shipping_price_per_unit'].includes(col.data)) bgColor = "FFFEE2E2";
                else if (['quantity', 'unit_type', 'factory_price_per_unit'].includes(col.data)) bgColor = "FFDBEAFE";
                else if (['qty_per_ctn', 'CTN', 'gw_per_ctn_kg', 'length_cm', 'width_cm', 'height_cm'].includes(col.data)) bgColor = "FFF5EBDF";

                if (isFormula) rowData.push({ f: val, s: { fill: { fgColor: { rgb: bgColor } } } });
                else rowData.push({ v: val, s: { fill: { fgColor: { rgb: bgColor } } } });
            });
            aoa.push(rowData);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(aoa);

        // إضافة دمج الخلايا إلى الإكسل
        const plugin = InvoiceItemsUI.hotInstance.getPlugin('mergeCells');
        if (plugin && plugin.mergedCellsCollection && plugin.mergedCellsCollection.mergedCells) {
            const hotMerges = plugin.mergedCellsCollection.mergedCells;
            if (hotMerges.length > 0) {
                ws['!merges'] = hotMerges.map(m => {
                    return {
                        s: { r: m.row + 1, c: m.col },
                        e: { r: m.row + 1 + m.rowspan - 1, c: m.col + m.colspan - 1 }
                    };
                });
            }
        }

        XLSX.utils.book_append_sheet(wb, ws, "Invoice Items");
        XLSX.writeFile(wb, `Invoice_${document.getElementById('invoiceNumberDisplay')?.textContent || 'Export'}_Items.xlsx`);
        InvoiceItemsUI.showToast('تم تصدير الإكسل بنجاح', 'success');
    }
};

window.InvoiceItemsController = InvoiceItemsController;

document.addEventListener('DOMContentLoaded', () => {
    InvoiceItemsController.init();

    // ربط المدخلات
    const fileInput = document.getElementById('hiddenPhotoSelectorInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            InvoiceItemsController.handlePhotoUpload(e.target.files[0]);
            fileInput.value = '';
        });
    }

    const viewBtn = document.getElementById('viewPhotoActionBtn');
    if (viewBtn) {
        viewBtn.addEventListener('click', () => {
            if (State.activePhotoUrl) {
                InvoiceItemsController.openImageModal(State.activePhotoUrl);
                document.getElementById('photoActionsModal').classList.add('hidden');
            }
        });
    }

    const uploadBtn = document.getElementById('uploadPhotoActionBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });
    }
});
