// assets/js/invoices/invoices_state.js

window.InvoicesState = {
    customersLookup: [],
    shippingLookup: [],
    commissionsLookup: [],
    invoices: [],
    currentLimit: 50,
    currentEditingInvoiceId: null,
    customersMap: {},
    customerNameMap: {},
    shippingMap: {},
    commissionsMap: {},
    searchTimeout: null
};

window.getTodayDateISO = function() {
    return new Date().toISOString().split('T')[0];
};

window.getDateDaysAgoISO = function(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
};

window.normalizeText = function(value) {
    return String(value ?? '').toLowerCase().trim();
};

window.buildLookupMap = function(list, valueKey) {
    const map = {};
    list.forEach(item => {
        map[item.id] = item[valueKey];
    });
    return map;
};
