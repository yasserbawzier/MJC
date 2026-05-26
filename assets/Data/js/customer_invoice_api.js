/**
 * customer_invoice_api.js
 * Data Layer for the Customer Invoice page.
 * Handles all Supabase API interactions.
 */

const CustomerInvoiceAPI = {
    async fetchInvoiceDetails(invoiceId) {
        const { data, error } = await _supabase
            .from('invoices')
            .select('*, customers(customer_custom_id, full_name, phone)')
            .eq('id', invoiceId)
            .single();

        if (error) throw error;
        return data;
    },

    async fetchInvoiceItems(invoiceId) {
        const { data, error } = await _supabase
            .from('invoice_items')
            .select('id, product_id, invoice_id, status, created_at, factory_price_per_unit, quantity, shipping_price_per_unit, fixed_commission_rate, qty_per_ctn, CTN, gw_per_ctn_kg, length_cm, width_cm, height_cm, size, specifications, sample, production, unit_type, merge_metadata')
            .eq('invoice_id', invoiceId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    },

    async fetchAllProducts() {
        const { data, error } = await _supabase
            .from('products')
            .select('id, product_name, product_custom_id, product_image_url');

        if (error) throw error;
        return data || [];
    },

    async fetchItemPhotos(itemIds) {
        if (!itemIds || itemIds.length === 0) return [];
        
        const { data, error } = await _supabase
            .from('item_photos')
            .select('*')
            .in('item_id', itemIds);

        if (error) throw error;
        return data || [];
    }
};

window.CustomerInvoiceAPI = CustomerInvoiceAPI;
