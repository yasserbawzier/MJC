/**
 * commissions.js
 * Handles the commissions page:
 * - Reads invoice_id from URL params
 * - Loads invoice details + invoice items + products
 * - Renders commissions table with computed columns
 * - Handles commission rate modal (add/delete)
 * - Saves commission rate changes back to invoice_items
 */

let currentInvoiceId = null;
let commissionsItems = [];     // invoice_items rows
let productsMap = {};          // product_id -> product row
let commissionRates = [];      // rows from commissions_settings

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value, decimals = 2) {
    if (value === null || value === undefined || value === '') return '-';
    const n = Number(value);
    if (isNaN(n)) return '-';
    return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ─── Supabase fetching ────────────────────────────────────────────────────────

async function loadInvoiceDetails() {
    const { data, error } = await _supabase
        .from('invoices')
        .select('*, customers(customer_custom_id, full_name), shipping_rates(country_code)')
        .eq('id', currentInvoiceId)
        .single();

    if (error) { console.error('Invoice fetch error:', error.message); return; }

    document.getElementById('invoiceNumberDisplay').textContent = data.invoice_number || '-';
    document.getElementById('invoiceCustomerDisplay').textContent = data.customers?.customer_custom_id || '-';
    document.getElementById('invoiceCustomerNameDisplay').textContent = data.customers?.full_name || '-';
    document.getElementById('invoiceShippingDestinationDisplay').textContent = data.shipping_rates?.country_code || '-';
    document.getElementById('invoiceCbmPriceDisplay').textContent = data.Price_Per_CBM ? Number(data.Price_Per_CBM).toFixed(2) : '-';
}

async function loadProductsForItems() {
    // Extract unique valid product_ids from current items
    const productIds = [...new Set(commissionsItems.map(item => item.product_id).filter(id => id))];
    if (productIds.length === 0) {
        productsMap = {};
        return;
    }

    const { data, error } = await _supabase
        .from('products')
        .select('id, product_custom_id, product_image_url, product_name')
        .in('id', productIds);

    if (error) { console.error('Products fetch error:', error.message); return; }
    productsMap = {};
    (data || []).forEach(p => { productsMap[p.id] = p; });
}

async function loadCommissionItems() {
    const { data, error } = await _supabase
        .from('invoice_items')
        .select('id, item_name, status, product_id, factory_price_per_unit, quantity, total_factory_price, shipping_price_per_unit, total_shipping_cost, fixed_commission_rate')
        .eq('invoice_id', currentInvoiceId)
        .order('created_at', { ascending: true });

    if (error) { console.error('Items fetch error:', error.message); return; }

    // Populate notes_commission locally from localStorage
    commissionsItems = (data || []).map(item => {
        item.notes_commission = localStorage.getItem(`notes_commission_${item.id}`) || 'factory';
        return item;
    });
}

async function loadCommissionRates() {
    const { data, error } = await _supabase
        .from('commissions_settings')
        .select('id, commission_rate')
        .order('created_at', { ascending: true });
    if (error) { console.error('Rates fetch error:', error.message); return; }
    commissionRates = data || [];
}

// ─── Table rendering ──────────────────────────────────────────────────────────

function renderCommissionsTable() {
    const tbody = document.getElementById('commissionsItemsTableBody');
    const tfoot = document.getElementById('commissionsTotalRow');
    if (!tbody) return;

    if (commissionsItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="17" class="p-8 text-center text-gray-500">لا توجد عناصر لهذه الفاتورة.</td></tr>';
        tfoot.innerHTML = '';
        return;
    }

    // Build dropdown options for commission rate
    const rateOptions = commissionRates.map(r =>
        `<option value="${r.commission_rate}">${r.commission_rate}</option>`
    ).join('');

    // Build dropdown options for note (commission base)
    const noteOptions = `
        <option value="factory">Factory Price / سعر المصنع</option>
        <option value="factory_shipping">Factory + Shipping / المصنع + الشحن</option>
    `;

    let totalMOQ = 0, totalFactoryAmt = 0, totalShipping = 0,
        totalProdShipping = 0, totalCommission = 0, totalUSD = 0;

    tbody.innerHTML = '';

    commissionsItems.forEach(item => {
        const product = productsMap[item.product_id] || null;
        const productId = product ? (product.product_custom_id || '-') : '-';
        const productImg = product && product.product_image_url
            ? `<img src="${product.product_image_url}" class="w-12 h-12 object-cover rounded-lg border border-gray-200 mx-auto" alt="img">`
            : '<span class="text-gray-400">-</span>';

        const factoryPrice = Number(item.factory_price_per_unit || 0);
        const moq = Number(item.quantity || 0);
        const totalAmount = Number(item.total_factory_price || 0);
        const shippingPerUnit = Number(item.shipping_price_per_unit || 0);
        const totalShippingItem = Number(item.total_shipping_cost || 0);

        // Product + Shipping per unit
        const prodShippingUnit = factoryPrice + shippingPerUnit;
        // Total Product + Shipping
        const totalProdShippingItem = prodShippingUnit * moq;

        // Commission base (from notes_commission field)
        const noteVal = item.notes_commission || 'factory';
        const commissionRate = Number(item.fixed_commission_rate || 0);

        let commissionPerUnit = 0;
        if (noteVal === 'factory') {
            commissionPerUnit = factoryPrice * commissionRate;
        } else {
            commissionPerUnit = prodShippingUnit * commissionRate;
        }

        const totalCommissionItem = commissionPerUnit * moq;
        const unitPriceUSD = prodShippingUnit + commissionPerUnit;
        const totalAmountUSD = unitPriceUSD * moq;

        // Accumulate totals
        totalMOQ += moq;
        totalFactoryAmt += totalAmount;
        totalShipping += totalShippingItem;
        totalProdShipping += totalProdShippingItem;
        totalCommission += totalCommissionItem;
        totalUSD += totalAmountUSD;

        // Active badge
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
            <td class="p-3 text-gray-700 border border-gray-200">${fmt(factoryPrice)}</td>
            <td class="p-3 text-gray-700 font-semibold border border-gray-200">${fmt(moq, 0)}</td>
            <td class="p-3 text-gray-700 font-semibold bg-blue-50 border border-gray-200">${fmt(totalAmount)}</td>
            <td class="p-3 text-gray-700 border border-gray-200">${fmt(shippingPerUnit)}</td>
            <td class="p-3 text-gray-700 bg-red-50 border border-gray-200">${fmt(totalShippingItem)}</td>
            <td class="p-3 text-gray-700 border border-gray-200">${fmt(prodShippingUnit)}</td>
            <td class="p-3 text-gray-700 bg-green-50 font-semibold border border-gray-200">${fmt(totalProdShippingItem)}</td>
            <td class="p-3 border border-gray-200">
                <select onchange="updateNoteCommission('${item.id}', this.value)" class="text-xs border border-purple-200 rounded-lg px-2 py-1.5 bg-purple-50 text-purple-800 font-semibold focus:ring-2 focus:ring-purple-400 outline-none cursor-pointer">
                    <option value="factory" ${noteVal === 'factory' ? 'selected' : ''}>Factory Price</option>
                    <option value="factory_shipping" ${noteVal === 'factory_shipping' ? 'selected' : ''}>Factory + Shipping</option>
                </select>
            </td>
            <td class="p-3 border border-gray-200">
                <select onchange="updateCommissionRate('${item.id}', this.value)" class="text-xs border border-purple-200 rounded-lg px-2 py-1.5 bg-purple-50 text-purple-800 font-bold focus:ring-2 focus:ring-purple-400 outline-none cursor-pointer min-w-[80px]">
                    <option value="">-- Select --</option>
                    ${commissionRates.map(r =>
            `<option value="${r.commission_rate}" ${Number(item.fixed_commission_rate) === r.commission_rate ? 'selected' : ''}>${r.commission_rate}</option>`
        ).join('')}
                </select>
            </td>
            <td class="p-3 text-purple-700 font-semibold border border-gray-200">${fmt(commissionPerUnit)}</td>
            <td class="p-3 text-purple-700 font-bold bg-purple-50 border border-gray-200">${fmt(totalCommissionItem)}</td>
            <td class="p-3 text-yellow-700 font-semibold border border-gray-200">${fmt(unitPriceUSD)}</td>
            <td class="p-3 text-yellow-700 font-bold bg-yellow-50 border border-gray-200">${fmt(totalAmountUSD)}</td>
        `;
        tbody.appendChild(row);
    });

    // Totals row
    tfoot.innerHTML = `
        <tr class="bg-gray-100 font-bold border-t-2 border-double border-gray-400 text-xs">
            <td class="p-3 border border-gray-200 text-center" colspan="5">Total / المجموع</td>
            <td class="p-3 border border-gray-200 text-center bg-blue-50">${fmt(totalMOQ, 0)}</td>
            <td class="p-3 border border-gray-200 text-center bg-blue-100">${fmt(totalFactoryAmt)}</td>
            <td class="p-3 border border-gray-200 text-center">-</td>
            <td class="p-3 border border-gray-200 text-center bg-red-100">${fmt(totalShipping)}</td>
            <td class="p-3 border border-gray-200 text-center">-</td>
            <td class="p-3 border border-gray-200 text-center bg-green-100">${fmt(totalProdShipping)}</td>
            <td class="p-3 border border-gray-200 text-center" colspan="3">-</td>
            <td class="p-3 border border-gray-200 text-center bg-purple-100">${fmt(totalCommission)}</td>
            <td class="p-3 border border-gray-200 text-center">-</td>
            <td class="p-3 border border-gray-200 text-center bg-yellow-100">${fmt(totalUSD)}</td>
        </tr>
    `;

    // تحديث قيم بطاقات الإحصائيات في الصفحة
    const statQty = document.getElementById('statTotalQuantity');
    if (statQty) statQty.textContent = totalMOQ.toLocaleString('en-US');

    const statFactory = document.getElementById('statTotalFactory');
    if (statFactory) statFactory.textContent = '$' + totalFactoryAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const statShipping = document.getElementById('statTotalShipping');
    if (statShipping) statShipping.textContent = '$' + totalShipping.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const statCommission = document.getElementById('statTotalCommission');
    if (statCommission) statCommission.textContent = '$' + totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const statUSD = document.getElementById('statTotalUSD');
    if (statUSD) statUSD.textContent = '$' + totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Inline update functions ──────────────────────────────────────────────────

async function updateCommissionRate(itemId, rateValue) {
    const rate = rateValue === '' ? null : Number(rateValue);

    // Update locally
    const item = commissionsItems.find(i => i.id === itemId);
    if (item) item.fixed_commission_rate = rate;
    renderCommissionsTable();

    // Persist to DB
    const { error } = await _supabase
        .from('invoice_items')
        .update({ fixed_commission_rate: rate })
        .eq('id', itemId);

    if (error) {
        console.error('Error saving commission rate:', error.message);
        alert('خطأ في حفظ نسبة العمولة: ' + error.message);
    }
}

async function updateNoteCommission(itemId, noteValue) {
    // Update locally
    const item = commissionsItems.find(i => i.id === itemId);
    if (item) item.notes_commission = noteValue;
    renderCommissionsTable();

    // Persist locally using localStorage
    localStorage.setItem(`notes_commission_${itemId}`, noteValue);
}

async function updateShippingPriceInline(itemId, element) {
    let rawValue = element.innerText.trim().replace(/,/g, '');
    let parsedValue = rawValue === '' ? 0 : parseFloat(rawValue);

    const item = commissionsItems.find(i => i.id === itemId);
    if (!item) return;

    if (isNaN(parsedValue) || parsedValue < 0) {
        alert('يرجى إدخال قيمة رقمية صالحة وغير سالبة');
        element.innerText = fmt(item.shipping_price_per_unit || 0);
        return;
    }

    if (Number(item.shipping_price_per_unit || 0) === parsedValue) {
        return; // No change
    }

    // Update local model
    item.shipping_price_per_unit = parsedValue;
    item.total_shipping_cost = Number((parsedValue * (item.quantity || 0)).toFixed(2));

    // Rerender table to update all totals and display formatted values
    renderCommissionsTable();

    // Persist to DB
    const { error } = await _supabase
        .from('invoice_items')
        .update({
            shipping_price_per_unit: parsedValue,
            total_shipping_cost: item.total_shipping_cost
        })
        .eq('id', itemId);

    if (error) {
        console.error('Error saving shipping price per unit:', error.message);
        alert('خطأ في حفظ سعر الشحن للوحدة: ' + error.message);
    }
}

function handleEditableCellKeyDown(e, element) {
    if (e.key === 'Enter') {
        e.preventDefault();
        element.blur();
    }
}

// ─── Manage Commissions Modal ─────────────────────────────────────────────────

async function loadCommissionsList() {
    const listBody = document.getElementById('modalCommissionsList');
    listBody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-gray-500 text-sm">جاري التحميل...</td></tr>';

    await loadCommissionRates();

    if (commissionRates.length === 0) {
        listBody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-gray-500 text-sm">لا توجد نسب مسجلة حالياً.</td></tr>';
        return;
    }

    listBody.innerHTML = '';
    commissionRates.forEach(item => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition-colors';
        row.innerHTML = `
            <td class="p-3 text-gray-800 font-semibold text-sm text-left">${item.commission_rate}</td>
            <td class="p-3 text-left">
                <button onclick="deleteCommission('${item.id}')"
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
}

function showManageCommissionsModal() {
    document.getElementById('manageCommissionsModal').classList.remove('hidden');
    loadCommissionsList();
}

function closeManageCommissionsModal() {
    document.getElementById('manageCommissionsModal').classList.add('hidden');
    document.getElementById('addCommissionForm').reset();
    // Refresh the table dropdowns
    renderCommissionsTable();
}

document.getElementById('addCommissionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '...';
    submitBtn.classList.add('opacity-75', 'cursor-not-allowed');

    const rate = document.getElementById('commissionRate').value;

    try {
        const { error } = await _supabase
            .from('commissions_settings')
            .insert([{ commission_rate: Number(rate) }]);

        if (error) throw error;

        document.getElementById('commissionRate').value = '';
        await loadCommissionsList();
    } catch (err) {
        console.error('Add rate error:', err.message);
        alert('خطأ في إضافة النسبة: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
        submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
});

async function deleteCommission(uuid) {
    if (!confirm('هل أنت متأكد من حذف هذه النسبة؟')) return;

    try {
        const { error } = await _supabase
            .from('commissions_settings')
            .delete()
            .eq('id', uuid);

        if (error) throw error;
        await loadCommissionsList();
    } catch (err) {
        console.error('Delete error:', err.message);
        alert('خطأ في الحذف: ' + err.message);
    }
}

// ─── Page initialization ──────────────────────────────────────────────────────

async function initCommissionsPage() {
    const params = new URLSearchParams(window.location.search);
    currentInvoiceId = params.get('invoice_id');

    if (!currentInvoiceId) {
        alert('لا يوجد معرف فاتورة! / No invoice ID found.');
        window.location.href = 'invoices.html';
        return;
    }

    // Load parallel independent requests first
    await Promise.all([
        loadInvoiceDetails(),
        loadCommissionRates(),
        loadCommissionItems()
    ]);

    // Load products strictly needed for these items
    await loadProductsForItems();

    renderCommissionsTable();

    // تحديث رابط الرجوع لعناصر الفاتورة
    const itemsLink = document.getElementById('backToInvoiceItemsLink');
    if (itemsLink) {
        itemsLink.href = `invoice_items.html?invoice_id=${currentInvoiceId}`;
    }
}

window.addEventListener('DOMContentLoaded', initCommissionsPage);
