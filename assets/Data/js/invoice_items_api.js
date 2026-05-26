// invoice_items_api.js
// Data Layer - مسؤولة عن جميع استدعاءات قاعدة البيانات (Supabase)

const InvoiceItemsAPI = {
    // -----------------------------------------
    // جلب البيانات (Fetch)
    // -----------------------------------------
    async fetchProducts() {
        const { data, error } = await _supabase
            .from('products')
            .select('id, product_custom_id, product_name, product_image_url, specifications, moq_of_product, days_of_manufacturing')
            .order('product_custom_id', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async fetchInvoiceDetails(invoiceId) {
        const { data, error } = await _supabase
            .from('invoices')
            .select('invoice_number, Price_Per_CBM, customers(customer_custom_id, full_name), shipping_rates(country_code, price_per_cbm)')
            .eq('id', invoiceId)
            .single();
        if (error) throw error;
        return data;
    },

    async fetchInvoiceItems(invoiceId) {
        // نستخدم Join لجمع البنود مع الصور في استعلام واحد متقدم
        const { data, error } = await _supabase
            .from('invoice_items')
            .select(`
                *,
                item_photos (
                    *,
                    design_assets (
                        design_elements (
                            is_approved, color_code, additional_specifications, display_order, asset_types (name)
                        )
                    )
                )
            `)
            .eq('invoice_id', invoiceId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async fetchProductTypes() {
        const { data, error } = await _supabase
            .from('product_types')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    // -----------------------------------------
    // تحديث البنود (Update & Create)
    // -----------------------------------------
    async insertInvoiceItem(payload) {
        const { data, error } = await _supabase
            .from('invoice_items')
            .insert([payload])
            .select('*, item_photos(*)')
            .single();
        if (error) throw error;
        return data;
    },

    async updateInvoiceItem(itemId, payload) {
        const { data, error } = await _supabase
            .from('invoice_items')
            .update(payload)
            .eq('id', itemId)
            .select('*')
            .single();
        if (error) throw error;
        return data;
    },

    async deleteInvoiceItem(itemId) {
        const { error } = await _supabase
            .from('invoice_items')
            .delete()
            .eq('id', itemId);
        if (error) throw error;
        return true;
    },

    // -----------------------------------------
    // صور البنود (Item Photos)
    // -----------------------------------------
    async fetchItemPhotos(itemIds) {
        if (!itemIds || itemIds.length === 0) return [];
        const { data, error } = await _supabase
            .from('item_photos')
            .select('*')
            .in('item_id', itemIds);
        if (error) throw error;
        return data || [];
    },

    async insertItemPhotos(payload) {
        const { data, error } = await _supabase
            .from('item_photos')
            .insert([payload])
            .select('*')
            .single();
        if (error) throw error;
        return data;
    },

    async updateItemPhotos(photoRecordId, payload) {
        const { data, error } = await _supabase
            .from('item_photos')
            .update(payload)
            .eq('id', photoRecordId)
            .select('*')
            .single();
        if (error) throw error;
        return data;
    },

    // -----------------------------------------
    // المنتجات الجديدة (New Products)
    // -----------------------------------------
    async insertProduct(payload) {
        const { data, error } = await _supabase
            .from('products')
            .insert([payload])
            .select('*')
            .single();
        if (error) throw error;
        return data;
    },

    // -----------------------------------------
    // الرفع للملفات (Storage Upload)
    // -----------------------------------------
    async uploadImage(file, bucketName = 'product-images', folderName = 'invoice-item-photos') {
        if (!file) return null;
        const extension = file.name.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
        const filePath = `${folderName}/${fileName}`;
        
        const { error } = await _supabase.storage.from(bucketName).upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });
        if (error) throw error;
        
        const { data: publicData, error: publicError } = _supabase.storage.from(bucketName).getPublicUrl(filePath);
        if (publicError) throw publicError;
        
        return publicData?.publicUrl || null;
    }
};

window.InvoiceItemsAPI = InvoiceItemsAPI;
