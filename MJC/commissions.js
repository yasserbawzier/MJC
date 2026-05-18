/**
 * هذا الملف يدير العمولات عبر نافذة منبثقة واحدة (Modal):
 * - عرض جميع العمولات.
 * - إضافة عمولة جديدة.
 * - حذف عمولة.
 */

async function loadCommissionsList() {
    const listBody = document.getElementById('modalCommissionsList');
    listBody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-gray-500">جاري التحميل...</td></tr>';

    try {
        const { data, error } = await _supabase
            .from('commissions_settings')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            listBody.innerHTML = `<tr><td colspan="2" class="p-4 text-center text-red-500">خطأ: ${error.message}</td></tr>`;
            return;
        }

        if (!data || data.length === 0) {
            listBody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-gray-500 text-sm">لا توجد نسب مسجلة حالياً.</td></tr>';
            return;
        }

        listBody.innerHTML = '';

        data.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors group';

            row.innerHTML = `
                <td class="p-3 text-gray-800 font-medium">${item.commission_rate ?? '-'}</td>
                <td class="p-3 text-left">
                    <button
                        onclick="deleteCommission('${item.id}')"
                        class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors"
                        title="حذف"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </td>
            `;

            listBody.appendChild(row);
        });
    } catch (err) {
        console.error('خطأ غير متوقع:', err);
        listBody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-red-500">حدث خطأ غير متوقع.</td></tr>';
    }
}

function showManageCommissionsModal() {
    document.getElementById('manageCommissionsModal').classList.remove('hidden');
    loadCommissionsList(); // تحديث القائمة عند فتح النافذة
}

function closeManageCommissionsModal() {
    document.getElementById('manageCommissionsModal').classList.add('hidden');
    document.getElementById('addCommissionForm').reset();
}

document.getElementById('addCommissionForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<svg class="animate-spin h-5 w-5 mr-2 inline" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> جاري...';
    submitBtn.classList.add('opacity-75', 'cursor-not-allowed');

    const commissionRate = document.getElementById('commissionRate').value;

    try {
        const { error } = await _supabase
            .from('commissions_settings')
            .insert([{ commission_rate: Number(commissionRate) }]);

        if (error) throw error;

        // تفريغ الحقل وتحديث القائمة فوراً
        document.getElementById('commissionRate').value = '';
        await loadCommissionsList();
    } catch (err) {
        console.error('فشل إضافة العمولة:', err.message);
        alert('حدث خطأ أثناء الإضافة: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
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

        // تحديث القائمة فوراً
        await loadCommissionsList();
    } catch (err) {
        console.error('فشل الحذف:', err.message);
        alert('حدث خطأ أثناء الحذف: ' + err.message);
    }
}

