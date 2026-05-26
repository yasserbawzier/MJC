// assets/Data/js/invoices_api.js
// Data Layer - مسؤولة عن جميع استدعاءات قاعدة البيانات (Supabase)

const InvoicesAPI = {
    async fetchCustomers() {
        const { data, error } = await _supabase
            .from('customers')
            .select('id, customer_custom_id, full_name');
        if (error) throw error;
        return data || [];
    },

    async fetchShippingRates() {
        const { data, error } = await _supabase
            .from('shipping_rates')
            .select('id, country_name');
        if (error) throw error;
        return data || [];
    },

    async fetchCommissions() {
        const { data, error } = await _supabase
            .from('commissions_settings')
            .select('id, commission_rate');
        if (error) throw error;
        return data || [];
    },

    async fetchInvoices(periodFilter) {
        let query = _supabase
            .from('invoices')
            .select('id, invoice_number, customer_id, shipping_destination_id, shipping_address_text, commission_id, Price_Per_CBM, invoice_date, created_at')
            .order('created_at', { ascending: false });

        if (periodFilter === 'week') {
            query = query.gte('invoice_date', this._getDateDaysAgoISO(7));
        } else if (periodFilter === 'month') {
            query = query.gte('invoice_date', this._getDateDaysAgoISO(30));
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    async insertInvoice(payload) {
        const { data, error } = await _supabase
            .from('invoices')
            .insert([payload])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateInvoice(id, payload) {
        const { data, error } = await _supabase
            .from('invoices')
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteInvoice(id) {
        const { error } = await _supabase
            .from('invoices')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    _getDateDaysAgoISO(days) {
        const d = new Date();
        d.setDate(d.getDate() - days);
        return d.toISOString().split('T')[0];
    }
};

window.InvoicesAPI = InvoicesAPI;
