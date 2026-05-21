// assets/js/invoices/invoices_api.js

window.loadFormLookups = async function() {
    const cachedCustomers = sessionStorage.getItem('cached_customers');
    const cachedShipping = sessionStorage.getItem('cached_shipping');
    const cachedCommissions = sessionStorage.getItem('cached_commissions');

    if (cachedCustomers && cachedShipping && cachedCommissions) {
        InvoicesState.customersLookup = JSON.parse(cachedCustomers);
        InvoicesState.shippingLookup = JSON.parse(cachedShipping);
        InvoicesState.commissionsLookup = JSON.parse(cachedCommissions);
    } else {
        const [customersRes, shippingRes, commissionsRes] = await Promise.all([
            _supabase.from('customers').select('id, customer_custom_id, full_name'),
            _supabase.from('shipping_rates').select('id, country_name'),
            _supabase.from('commissions_settings').select('id, commission_rate')
        ]);

        if (customersRes.error) throw customersRes.error;
        if (shippingRes.error) throw shippingRes.error;
        if (commissionsRes.error) throw commissionsRes.error;

        InvoicesState.customersLookup = customersRes.data || [];
        InvoicesState.shippingLookup = shippingRes.data || [];
        InvoicesState.commissionsLookup = commissionsRes.data || [];

        sessionStorage.setItem('cached_customers', JSON.stringify(InvoicesState.customersLookup));
        sessionStorage.setItem('cached_shipping', JSON.stringify(InvoicesState.shippingLookup));
        sessionStorage.setItem('cached_commissions', JSON.stringify(InvoicesState.commissionsLookup));
    }

    InvoicesState.customersMap = buildLookupMap(InvoicesState.customersLookup, 'customer_custom_id');
    InvoicesState.customerNameMap = buildLookupMap(InvoicesState.customersLookup, 'full_name');
    InvoicesState.shippingMap = buildLookupMap(InvoicesState.shippingLookup, 'country_name');
    InvoicesState.commissionsMap = buildLookupMap(InvoicesState.commissionsLookup, 'commission_rate');

    fillSelectOptions('invoiceCustomerId', InvoicesState.customersLookup, item => item.customer_custom_id || 'بدون ID');
    fillSelectOptions('editInvoiceCustomerId', InvoicesState.customersLookup, item => item.customer_custom_id || 'بدون ID');
    fillSelectOptions('invoiceShippingDestinationId', InvoicesState.shippingLookup, item => item.country_name || 'بدون اسم');
    fillSelectOptions('editInvoiceShippingDestinationId', InvoicesState.shippingLookup, item => item.country_name || 'بدون اسم');
    fillSelectOptions('invoiceCommissionId', InvoicesState.commissionsLookup, item => `${item.commission_rate ?? '-'} %`);
    fillSelectOptions('editInvoiceCommissionId', InvoicesState.commissionsLookup, item => `${item.commission_rate ?? '-'} %`);
};

window.checkAndLoadInvoices = async function() {
    const tableBody = document.getElementById('invoicesTableBody');
    tableBody.innerHTML = '<tr><td colspan="8" class="p-4 text-center">جاري التحميل...</td></tr>';

    try {
        await loadFormLookups();

        const periodFilter = document.getElementById('invoicePeriodFilter')?.value || 'week';

        let query = _supabase
            .from('invoices')
            .select('id, invoice_number, customer_id, shipping_destination_id, shipping_address_text, commission_id, Price_Per_CBM, invoice_date, created_at')
            .order('created_at', { ascending: false });

        if (periodFilter === 'week') {
            query = query.gte('invoice_date', getDateDaysAgoISO(7));
        } else if (periodFilter === 'month') {
            query = query.gte('invoice_date', getDateDaysAgoISO(30));
        }

        const { data, error } = await query;

        if (error) {
            tableBody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-red-500">خطأ: ${error.message}</td></tr>`;
            return;
        }

        InvoicesState.invoices = data || [];
        renderInvoicesTable();
    } catch (err) {
        console.error('فشل تحميل الفواتير:', err);
        tableBody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-red-500">حدث خطأ غير متوقع.</td></tr>';
    }
};

window.deleteInvoiceApi = async function(uuid) {
    const { error } = await _supabase
        .from('invoices')
        .delete()
        .eq('id', uuid);
    if (error) throw error;
};
