// هذا الملف اسمه App.js ودوره الرئيسي: إنشاء اتصال جاهز مع Supabase.
// أي ملف آخر يحتاج قاعدة البيانات (مثل customers.js) سيستخدم المتغير _supabase الذي نعرّفه هنا.

// const: كلمة محجوزة لتعريف متغير "ثابت" لا نعيد إسناده لاحقًا.
// SUPABASE_URL: اسم المتغير، ونخزن فيه رابط مشروع Supabase.
// = : عامل الإسناد، يضع القيمة في المتغير.
// 'https://...': نص (String) يمثل عنوان خادم Supabase الخاص بمشروعك.
// ; : نهاية السطر البرمجي في JavaScript.
const SUPABASE_URL = 'https://viqfpibqtlzxnnmspsnj.supabase.co';

// const: تعريف ثابت جديد.
// SUPABASE_KEY: اسم المتغير الذي يحمل مفتاح الوصول (anon key) للمشروع.
// هذا المفتاح تستخدمه مكتبة supabase-js للتصديق على الطلبات القادمة من الواجهة.
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpcWZwaWJxdGx6eG5ubXNwc25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzc2MTMsImV4cCI6MjA5Mjk1MzYxM30.3NyT5zirXVy2BEpvaRNrcStAOSO5f7BIMO_-FIc4H9U';

// const: تعريف ثابت للكائن الناتج عن الاتصال.
// _supabase: الاسم الذي سنستخدمه لاحقًا في باقي الملفات لتنفيذ عمليات القراءة/الإضافة/التعديل/الحذف.
// supabase: كائن عالمي توفره مكتبة @supabase/supabase-js المحملة في customers.html.
// .createClient(...): دالة تنشئ "عميل اتصال" مرتبطًا بالمشروع.
// (SUPABASE_URL, SUPABASE_KEY): نمرر رابط المشروع والمفتاح حتى يعرف العميل أين يرسل الطلبات وبأي صلاحية.
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// console.log: طباعة رسالة في أدوات المطور (Console) للتأكد أن ملف الاتصال اشتغل.
// هذه الرسالة لا تؤثر على المنطق، فقط للمراقبة أثناء التطوير.
console.log("تم تفعيل نظام الربط بنجاح ✅");

window.syncDesignDetailsToInvoice = async function(designAssetId) {
    try {
        // 1. Fetch all approved elements for this design asset
        const { data: elements } = await _supabase.from('design_elements')
            .select('color_code, additional_specifications, asset_types(name)')
            .eq('design_asset_id', designAssetId)
            .eq('is_approved', true)
            .order('display_order', { ascending: true });

        let text = '';
        if (elements && elements.length > 0) {
            elements.forEach(el => {
                const typeName = el.asset_types ? el.asset_types.name : 'عنصر';
                text += `<strong>${typeName}</strong><br>`;
                if (el.color_code) text += `<span style="color: #666;">اللون:</span> <span style="font-family: monospace;" dir="ltr">${el.color_code}</span><br>`;
                if (el.additional_specifications) text += `<span style="color: #666;">ملاحظات:</span> ${el.additional_specifications}<br>`;
                text += '<br>';
            });
        }
        text = text.trim();

        // 2. We need to update ALL design_assets that share the same item_name and invoice_id
        const { data: designData } = await _supabase.from('design_assets')
            .select('design_id') // design_id is item_photos.id
            .eq('id', designAssetId)
            .single();
        
        if (designData) {
            const { data: photoData } = await _supabase.from('item_photos')
                .select('item_id') // item_id is invoice_items.id
                .eq('id', designData.design_id)
                .single();

            if (photoData) {
                const { data: invItem } = await _supabase.from('invoice_items')
                    .select('item_name, invoice_id')
                    .eq('id', photoData.item_id)
                    .single();
                    
                if (invItem) {
                    // Get all invoice items with same name in same invoice
                    const { data: mergedItems } = await _supabase.from('invoice_items')
                        .select('id')
                        .eq('item_name', invItem.item_name)
                        .eq('invoice_id', invItem.invoice_id);
                        
                    if (mergedItems && mergedItems.length > 0) {
                        const itemIds = mergedItems.map(i => i.id);
                        
                        // Get all their photos
                        const { data: mergedPhotos } = await _supabase.from('item_photos')
                            .select('id')
                            .in('item_id', itemIds);
                            
                        if (mergedPhotos && mergedPhotos.length > 0) {
                            const photoIds = mergedPhotos.map(p => p.id);
                            
                            // Update ALL related design_assets!
                            await _supabase.from('design_assets')
                                .update({ design_details: text })
                                .in('design_id', photoIds);
                        }
                    }
                }
            }
        }

    } catch (e) {
        console.error("Error syncing design details:", e);
    }
};

// ==========================================
// نظام إشعارات احترافي (Toast Notifications)
// ==========================================
// نظام إشعارات احترافي (Toast Notifications)
// ==========================================
window.showNotification = function(message, type = 'success') {
    let container = document.getElementById('global-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'global-toast-container';
        container.style.cssText = 'position: fixed; top: 24px; left: 24px; z-index: 99999; display: flex; flex-direction: column; gap: 12px; pointer-events: none;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    
    // Curated high-performance gradients
    const bgGradients = {
        success: 'linear-gradient(135deg, #10b981, #059669)',
        error: 'linear-gradient(135deg, #ef4444, #dc2626)',
        danger: 'linear-gradient(135deg, #ef4444, #dc2626)',
        info: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        warning: 'linear-gradient(135deg, #f59e0b, #d97706)'
    };
    
    const getBg = (t) => bgGradients[t] || bgGradients.success;
    
    const getIcon = (t) => {
        if (t === 'error' || t === 'danger') {
            return `<svg style="width:22px;height:22px;flex-shrink:0;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        } else if (t === 'warning') {
            return `<svg style="width:22px;height:22px;flex-shrink:0;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
        } else if (t === 'info') {
            return `<svg style="width:22px;height:22px;flex-shrink:0;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        } else {
            return `<svg style="width:22px;height:22px;flex-shrink:0;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        }
    };

    toast.style.cssText = `
        padding: 14px 20px;
        border-radius: 16px;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15), 0 10px 10px -5px rgba(0,0,0,0.05);
        color: white;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 12px;
        transform: translateX(-30px) scale(0.95);
        opacity: 0;
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        pointer-events: auto;
        width: max-content;
        max-width: 90vw;
        background: ${getBg(type)};
        border: 1px solid rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(8px);
        direction: rtl;
        text-align: right;
    `;
    
    toast.innerHTML = `
        ${getIcon(type)}
        <span style="line-height: 1.4;">${message}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0) scale(1)';
            toast.style.opacity = '1';
        });
    });

    let autoRemoveTimer = setTimeout(() => {
        removeFn();
    }, 4000);

    function removeFn() {
        if (autoRemoveTimer) {
            clearTimeout(autoRemoveTimer);
            autoRemoveTimer = null;
        }
        toast.style.transform = 'translateX(-30px) scale(0.95)';
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 400); 
    }

    return {
        update: (newMessage, newType = type) => {
            toast.style.background = getBg(newType);
            const textSpan = toast.querySelector('span');
            if (textSpan) textSpan.innerHTML = newMessage;
            
            const svg = toast.querySelector('svg');
            if (svg) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = getIcon(newType);
                const newSvg = tempDiv.querySelector('svg');
                if (newSvg) svg.replaceWith(newSvg);
            }
        },
        remove: removeFn
    };
};


// استبدال دالة alert الافتراضية
window.alert = function(message) {
    if (!message) return;
    const msgStr = message.toString();
    const isError = msgStr.includes('خطأ') || msgStr.includes('فشل') || msgStr.includes('Error') || msgStr.includes('يجب');
    window.showNotification(msgStr, isError ? 'error' : 'success');
};