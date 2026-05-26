/**
 * commissions_ui.js
 * Presentation Layer for the Commissions page.
 * Handles DOM manipulation and rendering purely.
 */

const CommissionsUI = {
    fmt(value, decimals = 2) {
        if (value === null || value === undefined || value === '') return '-';
        const n = Number(value);
        if (isNaN(n)) return '-';
        return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    },

    highlightCell(element) {
        if (!element) return;
        element.classList.add('bg-green-100');
        setTimeout(() => {
            element.classList.remove('bg-green-100');
        }, 500);
    },

    updateInvoiceDetailsDOM(data, invoiceId) {
        document.getElementById('invoiceNumberDisplay').textContent = data.invoice_number || '-';
        document.getElementById('invoiceCustomerDisplay').textContent = data.customers?.customer_custom_id || '-';
        document.getElementById('invoiceCustomerNameDisplay').textContent = data.customers?.full_name || '-';
        document.getElementById('invoiceShippingDestinationDisplay').textContent = data.shipping_rates?.country_code || '-';
        document.getElementById('invoiceCbmPriceDisplay').textContent = data.Price_Per_CBM ? Number(data.Price_Per_CBM).toFixed(2) : '-';

        const itemsLink = document.getElementById('backToInvoiceItemsLink');
        if (itemsLink) {
            itemsLink.href = `invoice_items.html?invoice_id=${invoiceId}`;
        }
    },

    renderCommissionsTable(items, productsMap, ratesList) {
        const tbody = document.getElementById('commissionsItemsTableBody');
        const tfoot = document.getElementById('commissionsTotalRow');
        if (!tbody) return;

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="17" class="p-8 text-center text-gray-500">لا توجد عناصر لهذه الفاتورة.</td></tr>';
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        const fragment = document.createDocumentFragment();
        tbody.innerHTML = '';

        items.forEach(item => {
            const product = productsMap[item.product_id] || null;
            const productId = product ? (product.product_custom_id || '-') : '-';
            const productImg = product && product.product_image_url
                ? `<img src="${product.product_image_url}" class="w-12 h-12 object-cover rounded-lg border border-gray-200 mx-auto" alt="img" loading="lazy">`
                : '<span class="text-gray-400">-</span>';

            const activeBadge = item.status
                ? `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200"><span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>Active</span>`
                : `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-gray-50 text-gray-500 border border-gray-200"><span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span>Inactive</span>`;

            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-blue-50 transition-colors';
            row.innerHTML = `
                <td class="p-3 text-gray-700 font-medium border border-gray-200">${item.item_name || '-'}</td>
                <td class="p-3 border border-gray-200 text-center">${activeBadge}</td>
                <td class="p-3 text-blue-600 font-bold border border-gray-200">${productId}</td>
                <td class="p-3 border border-gray-200 text-center">${productImg}</td>
                <td class="p-3 text-gray-700 border border-gray-200">${this.fmt(item.factory_price_per_unit)}</td>
                <td class="p-3 text-gray-700 font-semibold border border-gray-200">${this.fmt(item.quantity, 0)}</td>
                <td class="p-3 text-gray-700 font-semibold bg-blue-50 border border-gray-200">${this.fmt(item.total_factory_price)}</td>
                <td id="cell-shipping-unit-${item.id}" class="p-3 text-gray-700 border border-gray-200" contenteditable="true" onblur="CommissionsController.updateShippingPriceInline('${item.id}', this)" onkeydown="CommissionsUI.handleEditableCellKeyDown(event, this)">${this.fmt(item.shipping_price_per_unit)}</td>
                <td id="cell-shipping-total-${item.id}" class="p-3 text-gray-700 bg-red-50 border border-gray-200">${this.fmt(item.total_shipping_cost)}</td>
                <td id="cell-prod-ship-unit-${item.id}" class="p-3 text-gray-700 border border-gray-200">${this.fmt(item.prodShippingUnit)}</td>
                <td id="cell-prod-ship-total-${item.id}" class="p-3 text-gray-700 bg-green-50 font-semibold border border-gray-200">${this.fmt(item.totalProdShippingItem)}</td>
                <td class="p-3 border border-gray-200">
                    <select onchange="CommissionsController.updateNoteCommission('${item.id}', this.value)" class="text-xs border border-purple-200 rounded-lg px-2 py-1.5 bg-purple-50 text-purple-800 font-semibold focus:ring-2 focus:ring-purple-400 outline-none cursor-pointer">
                        <option value="factory" ${item.notes_commission === 'factory' ? 'selected' : ''}>Factory Price</option>
                        <option value="factory_shipping" ${item.notes_commission === 'factory_shipping' ? 'selected' : ''}>Factory + Shipping</option>
                    </select>
                </td>
                <td class="p-3 border border-gray-200">
                    <select onchange="CommissionsController.updateCommissionRate('${item.id}', this.value)" class="text-xs border border-purple-200 rounded-lg px-2 py-1.5 bg-purple-50 text-purple-800 font-bold focus:ring-2 focus:ring-purple-400 outline-none cursor-pointer min-w-[80px]">
                        <option value="">-- Select --</option>
                        ${ratesList.map(r =>
                `<option value="${r.commission_rate}" ${Number(item.fixed_commission_rate) === r.commission_rate ? 'selected' : ''}>${r.commission_rate}</option>`
            ).join('')}
                    </select>
                </td>
                <td id="cell-comm-unit-${item.id}" class="p-3 text-purple-700 font-semibold border border-gray-200 transition-colors">${this.fmt(item.commissionPerUnit)}</td>
                <td id="cell-comm-total-${item.id}" class="p-3 text-purple-700 font-bold bg-purple-50 border border-gray-200 transition-colors">${this.fmt(item.totalCommissionItem)}</td>
                <td id="cell-usd-unit-${item.id}" class="p-3 text-yellow-700 font-semibold border border-gray-200 transition-colors">${this.fmt(item.unitPriceUSD)}</td>
                <td id="cell-usd-total-${item.id}" class="p-3 text-yellow-700 font-bold bg-yellow-50 border border-gray-200 transition-colors">${this.fmt(item.totalAmountUSD)}</td>
            `;
            fragment.appendChild(row);
        });

        tbody.appendChild(fragment);
    },

    updateItemRowCells(item) {
        const cellShippingUnit = document.getElementById(`cell-shipping-unit-${item.id}`);
        const cellShippingTotal = document.getElementById(`cell-shipping-total-${item.id}`);
        const cellProdShipUnit = document.getElementById(`cell-prod-ship-unit-${item.id}`);
        const cellProdShipTotal = document.getElementById(`cell-prod-ship-total-${item.id}`);
        const cellCommUnit = document.getElementById(`cell-comm-unit-${item.id}`);
        const cellCommTotal = document.getElementById(`cell-comm-total-${item.id}`);
        const cellUsdUnit = document.getElementById(`cell-usd-unit-${item.id}`);
        const cellUsdTotal = document.getElementById(`cell-usd-total-${item.id}`);

        if (cellShippingUnit) { cellShippingUnit.textContent = this.fmt(item.shipping_price_per_unit); this.highlightCell(cellShippingUnit); }
        if (cellShippingTotal) { cellShippingTotal.textContent = this.fmt(item.total_shipping_cost); this.highlightCell(cellShippingTotal); }
        if (cellProdShipUnit) { cellProdShipUnit.textContent = this.fmt(item.prodShippingUnit); this.highlightCell(cellProdShipUnit); }
        if (cellProdShipTotal) { cellProdShipTotal.textContent = this.fmt(item.totalProdShippingItem); this.highlightCell(cellProdShipTotal); }
        if (cellCommUnit) { cellCommUnit.textContent = this.fmt(item.commissionPerUnit); this.highlightCell(cellCommUnit); }
        if (cellCommTotal) { cellCommTotal.textContent = this.fmt(item.totalCommissionItem); this.highlightCell(cellCommTotal); }
        if (cellUsdUnit) { cellUsdUnit.textContent = this.fmt(item.unitPriceUSD); this.highlightCell(cellUsdUnit); }
        if (cellUsdTotal) { cellUsdTotal.textContent = this.fmt(item.totalAmountUSD); this.highlightCell(cellUsdTotal); }
    },

    updateFooterTotals(totals) {
        const tfoot = document.getElementById('commissionsTotalRow');
        if (tfoot) {
            tfoot.innerHTML = `
                <tr class="bg-gray-100 font-bold border-t-2 border-double border-gray-400 text-xs">
                    <td class="p-3 border border-gray-200 text-center" colspan="5">Total / المجموع</td>
                    <td class="p-3 border border-gray-200 text-center bg-blue-50">${this.fmt(totals.totalMOQ, 0)}</td>
                    <td class="p-3 border border-gray-200 text-center bg-blue-100">${this.fmt(totals.totalFactoryAmt)}</td>
                    <td class="p-3 border border-gray-200 text-center">-</td>
                    <td class="p-3 border border-gray-200 text-center bg-red-100">${this.fmt(totals.totalShipping)}</td>
                    <td class="p-3 border border-gray-200 text-center">-</td>
                    <td class="p-3 border border-gray-200 text-center bg-green-100">${this.fmt(totals.totalProdShipping)}</td>
                    <td class="p-3 border border-gray-200 text-center" colspan="3">-</td>
                    <td class="p-3 border border-gray-200 text-center bg-purple-100">${this.fmt(totals.totalCommission)}</td>
                    <td class="p-3 border border-gray-200 text-center">-</td>
                    <td class="p-3 border border-gray-200 text-center bg-yellow-100">${this.fmt(totals.totalUSD)}</td>
                </tr>
            `;
        }

        const statQty = document.getElementById('statTotalQuantity');
        if (statQty) statQty.textContent = totals.totalMOQ.toLocaleString('en-US');

        const statFactory = document.getElementById('statTotalFactory');
        if (statFactory) statFactory.textContent = '$' + totals.totalFactoryAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const statShipping = document.getElementById('statTotalShipping');
        if (statShipping) statShipping.textContent = '$' + totals.totalShipping.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const statProdShipping = document.getElementById('statTotalProdShipping');
        if (statProdShipping) statProdShipping.textContent = '$' + totals.totalProdShipping.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const statCommission = document.getElementById('statTotalCommission');
        if (statCommission) statCommission.textContent = '$' + totals.totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const statUSD = document.getElementById('statTotalUSD');
        if (statUSD) statUSD.textContent = '$' + totals.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    renderCommissionsRatesList(rates) {
        const listBody = document.getElementById('modalCommissionsList');
        if (!listBody) return;

        if (rates.length === 0) {
            listBody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-gray-500 text-sm">لا توجد نسب مسجلة حالياً.</td></tr>';
            return;
        }

        listBody.innerHTML = '';
        rates.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors';
            row.innerHTML = `
                <td class="p-3 text-gray-800 font-semibold text-sm text-left">${item.commission_rate}</td>
                <td class="p-3 text-left">
                    <button onclick="CommissionsController.deleteCommission('${item.id}')"
                        class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors"
                        title="حذف">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </td>
            `;
            listBody.appendChild(row);
        });
    },

    handleEditableCellKeyDown(e, element) {
        if (e.key === 'Enter') {
            e.preventDefault();
            element.blur();
        }
    },

    showToast(message, type = 'info') {
        const notifier = (window.parent && window.parent !== window && window.parent.showNotification) 
            ? window.parent.showNotification 
            : window.showNotification;
        if (notifier) {
            return notifier(message, type);
        }
        alert(message);
        return { update: () => {}, remove: () => {} };
    }
};

window.CommissionsUI = CommissionsUI;

// Global Modals
window.showManageCommissionsModal = function () {
    document.getElementById('manageCommissionsModal').classList.remove('hidden');
};
window.closeManageCommissionsModal = function () {
    document.getElementById('manageCommissionsModal').classList.add('hidden');
    document.getElementById('addCommissionForm').reset();
    // Render to apply new rates if changed
    CommissionsController.renderAndCalculate();
};
