/**
 * هذا الملف يدير جدول commissions_settings:
 * - عرض جميع العمولات.
 * - إضافة عمولة جديدة.
 * - تعديل عمولة.
 * - حذف عمولة.
 *
 * ملاحظة: لا نعرض id في الجدول، لكن نستخدمه داخليًا.
 */

async function checkAndLoadCommissions() {
    const tableBody = document.getElementById('commissionsTableBody');
    tableBody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">جاري التحميل...</td></tr>';

    try {
        const { data, error } = await _supabase
            .from('commissions_settings')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            tableBody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-red-500">خطأ: ${error.message}</td></tr>`;
            return;
        }

        if (!data || data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-500">لا توجد عمولات حالياً.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';

        data.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-blue-50 transition relative group';

            const createdAtText = item.created_at ? new Date(item.created_at).toLocaleString() : '-';

            row.innerHTML = `
                <td class="p-4">${item.commission_rate ?? '-'}</td>
                <td class="p-4">${createdAtText}</td>
                <td class="p-4 text-left whitespace-nowrap">
                    <button
                        onclick="openEditCommissionModal('${item.id}')"
                        class="opacity-0 group-hover:opacity-100 bg-blue-600 text-white px-3 py-1 rounded shadow-sm hover:bg-blue-700 transition-all text-sm ml-2"
                    >
                        تعديل
                    </button>
                    <button
                        onclick="deleteCommission('${item.id}')"
                        class="opacity-0 group-hover:opacity-100 bg-red-600 text-white px-3 py-1 rounded shadow-sm hover:bg-red-700 transition-all text-sm"
                    >
                        حذف
                    </button>
                </td>
            `;

            tableBody.appendChild(row);
        });
    } catch (err) {
        console.error('خطأ غير متوقع:', err);
        tableBody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-red-500">حدث خطأ غير متوقع.</td></tr>';
    }
}

function showAddCommissionModal() {
    document.getElementById('addCommissionModal').classList.remove('hidden');
}

function closeAddCommissionModal() {
    document.getElementById('addCommissionModal').classList.add('hidden');
    document.getElementById('addCommissionForm').reset();
}

function closeEditCommissionModal() {
    document.getElementById('editCommissionModal').classList.add('hidden');
    window.currentEditingCommissionId = null;
}

document.getElementById('addCommissionForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerText = 'جاري الحفظ...';
    submitBtn.classList.add('opacity-50', 'cursor-not-allowed');

    const commissionRate = document.getElementById('commissionRate').value;

    try {
        const { error } = await _supabase
            .from('commissions_settings')
            .insert([{ commission_rate: Number(commissionRate) }]);

        if (error) throw error;

        alert('تمت إضافة العمولة بنجاح ✅');
        closeAddCommissionModal();
        checkAndLoadCommissions();
    } catch (err) {
        console.error('فشل إضافة العمولة:', err.message);
        alert('حدث خطأ أثناء الإضافة: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'حفظ';
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
});

async function openEditCommissionModal(uuid) {
    try {
        const { data, error } = await _supabase
            .from('commissions_settings')
            .select('*')
            .eq('id', uuid)
            .single();

        if (error) throw error;

        document.getElementById('editCommissionRate').value = data.commission_rate ?? '';
        window.currentEditingCommissionId = uuid;
        document.getElementById('editCommissionModal').classList.remove('hidden');
    } catch (err) {
        alert('فشل جلب بيانات العمولة: ' + err.message);
    }
}

async function updateEditedCommissionData(e) {
    e.preventDefault();

    const targetId = window.currentEditingCommissionId;
    if (!targetId) {
        alert('لا يوجد سجل محدد للتعديل.');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerText = 'جاري التحديث...';
    submitBtn.classList.add('opacity-50', 'cursor-not-allowed');

    const commissionRate = document.getElementById('editCommissionRate').value;

    try {
        const { error } = await _supabase
            .from('commissions_settings')
            .update({ commission_rate: Number(commissionRate) })
            .eq('id', targetId);

        if (error) throw error;

        alert('تم تحديث العمولة بنجاح ✅');
        closeEditCommissionModal();
        checkAndLoadCommissions();
    } catch (err) {
        console.error('فشل تحديث العمولة:', err.message);
        alert('حدث خطأ أثناء التحديث: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'حفظ التعديلات';
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

async function deleteCommission(uuid) {
    if (!confirm('هل أنت متأكد من حذف هذا السجل؟')) return;

    try {
        const { error } = await _supabase
            .from('commissions_settings')
            .delete()
            .eq('id', uuid);

        if (error) throw error;

        alert('تم الحذف بنجاح ✅');
        checkAndLoadCommissions();
    } catch (err) {
        console.error('فشل الحذف:', err.message);
        alert('حدث خطأ أثناء الحذف: ' + err.message);
    }
}

const editCommissionForm = document.getElementById('editCommissionForm');
if (editCommissionForm) {
    editCommissionForm.addEventListener('submit', updateEditedCommissionData);
}

checkAndLoadCommissions();
