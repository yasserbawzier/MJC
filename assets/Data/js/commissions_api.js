/**
 * commissions_api.js
 * Data Layer for the Commissions page.
 * Handles all Supabase API interactions.
 */

const CommissionsAPI = {
    async fetchInvoiceDetails(invoiceId) {
        const { data, error } = await _supabase
            .from('invoices')
            .select('*, customers(customer_custom_id, full_name), shipping_rates(country_code)')
            .eq('id', invoiceId)
            .single();

        if (error) throw error;
        return data;
    },

    async fetchCommissionItems(invoiceId) {
        const { data, error } = await _supabase
            .from('invoice_items')
            .select('id, item_name, status, product_id, factory_price_per_unit, quantity, total_factory_price, shipping_price_per_unit, total_shipping_cost, fixed_commission_rate')
            .eq('invoice_id', invoiceId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    },

    async fetchProductsByIds(productIds) {
        if (!productIds || productIds.length === 0) return [];
        
        const { data, error } = await _supabase
            .from('products')
            .select('id, product_custom_id, product_image_url, product_name')
            .in('id', productIds);

        if (error) throw error;
        return data || [];
    },

    async fetchCommissionRates() {
        const { data, error } = await _supabase
            .from('commissions_settings')
            .select('id, commission_rate')
            .order('created_at', { ascending: true });
            
        if (error) throw error;
        return data || [];
    },

    // ... (other functions remain unchanged, we just need to replace fetchCommissionRates and insertCommissionRate, and add updateCommissionRate)

    async updateCommissionRate(itemId, rate) {
        const { error } = await _supabase
            .from('invoice_items')
            .update({ fixed_commission_rate: rate })
            .eq('id', itemId);

        if (error) throw error;
    },

    async updateShippingPrice(itemId, pricePerUnit, totalShippingCost) {
        const { error } = await _supabase
            .from('invoice_items')
            .update({
                shipping_price_per_unit: pricePerUnit,
                total_shipping_cost: totalShippingCost
            })
            .eq('id', itemId);

        if (error) throw error;
    },

    async insertCommissionRate(rate) {
        const { error } = await _supabase
            .from('commissions_settings')
            .insert([{ 
                commission_rate: Number(rate)
            }]);

        if (error) throw error;
    },

    async updateCommissionRateData(uuid, rate) {
        const { error } = await _supabase
            .from('commissions_settings')
            .update({ 
                commission_rate: Number(rate)
            })
            .eq('id', uuid);

        if (error) throw error;
    },

    async deleteCommissionRate(uuid) {
        const { error } = await _supabase
            .from('commissions_settings')
            .delete()
            .eq('id', uuid);

        if (error) throw error;
    }
};

window.CommissionsAPI = CommissionsAPI;
