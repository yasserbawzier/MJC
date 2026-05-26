/**
 * commissions_controller.js
 * Controller Layer for the Commissions page.
 * Acts as the orchestrator between UI and Data layers.
 */

const State = {
    currentInvoiceId: null,
    commissionsItems: [],
    productsMap: {},
    commissionRates: [],
    totals: {
        totalMOQ: 0,
        totalFactoryAmt: 0,
        totalShipping: 0,
        totalProdShipping: 0,
        totalCommission: 0,
        totalUSD: 0
    }
};

const CommissionsController = {
    async init() {
        const params = new URLSearchParams(window.location.search);
        State.currentInvoiceId = params.get('invoice_id');

        if (!State.currentInvoiceId) {
            alert('لا يوجد معرف فاتورة! / No invoice ID found.');
            window.location.href = 'invoices.html';
            return;
        }

        try {
            // Load parallel independent requests
            const [details, rates, items] = await Promise.all([
                CommissionsAPI.fetchInvoiceDetails(State.currentInvoiceId),
                CommissionsAPI.fetchCommissionRates(),
                CommissionsAPI.fetchCommissionItems(State.currentInvoiceId)
            ]);

            CommissionsUI.updateInvoiceDetailsDOM(details, State.currentInvoiceId);
            State.commissionRates = rates;
            
            // Populate notes_commission locally from localStorage
            State.commissionsItems = items.map(item => {
                item.notes_commission = localStorage.getItem(`notes_commission_${item.id}`) || 'factory';
                return item;
            });

            // Load products strictly needed for these items
            const productIds = [...new Set(State.commissionsItems.map(item => item.product_id).filter(id => id))];
            const products = await CommissionsAPI.fetchProductsByIds(productIds);
            State.productsMap = {};
            products.forEach(p => { State.productsMap[p.id] = p; });

            this.renderAndCalculate();
            this.bindEvents();

        } catch (err) {
            CommissionsUI.showToast('خطأ أثناء تحميل البيانات: ' + err.message, 'error');
        }
    },

    bindEvents() {
        document.getElementById('addCommissionForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalHTML = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '...';
            submitBtn.classList.add('opacity-75', 'cursor-not-allowed');

            const rate = document.getElementById('commissionRate').value;

            try {
                await CommissionsAPI.insertCommissionRate(rate);
                document.getElementById('commissionRate').value = '';
                await this.refreshRatesList();
            } catch (err) {
                console.error('Add rate error:', err.message);
                CommissionsUI.showToast('خطأ في إضافة النسبة: ' + err.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHTML;
                submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
            }
        });
    },

    async refreshRatesList() {
        State.commissionRates = await CommissionsAPI.fetchCommissionRates();
        CommissionsUI.renderCommissionsRatesList(State.commissionRates);
    },

    calculateItem(item) {
        const factoryPrice = Number(item.factory_price_per_unit || 0);
        const moq = Number(item.quantity || 0);
        const shippingPerUnit = Number(item.shipping_price_per_unit || 0);
        
        item.total_shipping_cost = Number((shippingPerUnit * moq).toFixed(2));
        
        const totalShippingItem = item.total_shipping_cost;
        const prodShippingUnit = factoryPrice + shippingPerUnit;
        const totalProdShippingItem = prodShippingUnit * moq;

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

        // Store calculated values on item for easy rendering
        item.prodShippingUnit = prodShippingUnit;
        item.totalProdShippingItem = totalProdShippingItem;
        item.commissionPerUnit = commissionPerUnit;
        item.totalCommissionItem = totalCommissionItem;
        item.unitPriceUSD = unitPriceUSD;
        item.totalAmountUSD = totalAmountUSD;

        return item;
    },

    calculateTotals() {
        let totalMOQ = 0, totalFactoryAmt = 0, totalShipping = 0,
            totalProdShipping = 0, totalCommission = 0, totalUSD = 0;

        State.commissionsItems.forEach(item => {
            if (item.status === true) {
                totalMOQ += Number(item.quantity || 0);
                totalFactoryAmt += Number(item.total_factory_price || 0);
                totalShipping += Number(item.total_shipping_cost || 0);
                totalProdShipping += Number(item.totalProdShippingItem || 0);
                totalCommission += Number(item.totalCommissionItem || 0);
                totalUSD += Number(item.totalAmountUSD || 0);
            }
        });

        State.totals = {
            totalMOQ, totalFactoryAmt, totalShipping, 
            totalProdShipping, totalCommission, totalUSD
        };
    },

    renderAndCalculate() {
        State.commissionsItems.forEach(item => this.calculateItem(item));
        this.calculateTotals();
        
        CommissionsUI.renderCommissionsTable(State.commissionsItems, State.productsMap, State.commissionRates);
        CommissionsUI.updateFooterTotals(State.totals);
        CommissionsUI.renderCommissionsRatesList(State.commissionRates);
    },

    async updateCommissionRate(itemId, rateValue) {
        const rate = rateValue === '' ? null : Number(rateValue);

        const item = State.commissionsItems.find(i => i.id === itemId);
        if (item) item.fixed_commission_rate = rate;
        
        this.calculateItem(item);
        this.calculateTotals();
        
        CommissionsUI.updateItemRowCells(item);
        CommissionsUI.updateFooterTotals(State.totals);

        try {
            await CommissionsAPI.updateCommissionRate(itemId, rate);
        } catch (err) {
            CommissionsUI.showToast('خطأ في حفظ نسبة العمولة: ' + err.message, 'error');
        }
    },

    async updateNoteCommission(itemId, noteValue) {
        const item = State.commissionsItems.find(i => i.id === itemId);
        if (item) item.notes_commission = noteValue;
        
        this.calculateItem(item);
        this.calculateTotals();
        
        CommissionsUI.updateItemRowCells(item);
        CommissionsUI.updateFooterTotals(State.totals);

        localStorage.setItem(`notes_commission_${itemId}`, noteValue);
    },

    async updateShippingPriceInline(itemId, element) {
        let rawValue = element.innerText.trim().replace(/,/g, '');
        let parsedValue = rawValue === '' ? 0 : parseFloat(rawValue);

        const item = State.commissionsItems.find(i => i.id === itemId);
        if (!item) return;

        if (isNaN(parsedValue) || parsedValue < 0) {
            CommissionsUI.showToast('يرجى إدخال قيمة رقمية صالحة وغير سالبة', 'error');
            element.innerText = CommissionsUI.fmt(item.shipping_price_per_unit || 0);
            return;
        }

        if (Number(item.shipping_price_per_unit || 0) === parsedValue) {
            return; // No change
        }

        item.shipping_price_per_unit = parsedValue;
        
        this.calculateItem(item);
        this.calculateTotals();
        
        element.innerText = CommissionsUI.fmt(parsedValue);
        CommissionsUI.updateItemRowCells(item);
        CommissionsUI.updateFooterTotals(State.totals);

        try {
            await CommissionsAPI.updateShippingPrice(itemId, parsedValue, item.total_shipping_cost);
        } catch (err) {
            CommissionsUI.showToast('خطأ في حفظ سعر الشحن للوحدة: ' + err.message, 'error');
        }
    },

    async deleteCommission(uuid) {
        if (!confirm('هل أنت متأكد من حذف هذه النسبة؟')) return;

        try {
            await CommissionsAPI.deleteCommissionRate(uuid);
            await this.refreshRatesList();
            CommissionsUI.showToast('تم الحذف بنجاح', 'success');
        } catch (err) {
            CommissionsUI.showToast('خطأ في الحذف: ' + err.message, 'error');
        }
    }
};

window.CommissionsController = CommissionsController;

document.addEventListener('DOMContentLoaded', () => {
    CommissionsController.init();
});
