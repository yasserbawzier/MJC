// commission_rates.js
// يدير صفحة إدارة أنواع ونسب العمولات

document.addEventListener('DOMContentLoaded', async () => {
    const tableBody = document.getElementById('commissionsTableBody');
    const addForm = document.getElementById('addCommissionForm');

    // دالة عرض التنبيهات
    function showToast(message, type = 'success') {
        return window.showNotification(message, type);
    }

    // جلب وعرض البيانات
    async function loadCommissions() {
        try {
            const rates = await CommissionsAPI.fetchCommissionRates();
            tableBody.innerHTML = '';
            
            if (rates.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500">لا توجد عمولات مضافة بعد.</td></tr>`;
                return;
            }

            rates.forEach((rate, index) => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-gray-50 transition-colors group";
                
                // حالة العرض
                tr.innerHTML = `
                    <td class="p-4 text-sm text-gray-500">${index + 1}</td>
                    <td class="p-4 text-blue-600 font-bold text-left" dir="ltr">${(rate.commission_rate * 100).toFixed(1)}%</td>
                    <td class="p-4 text-gray-500 text-left rate-cell" dir="ltr">${rate.commission_rate}</td>
                    <td class="p-4 text-center">
                        <div class="flex justify-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            <button class="edit-btn p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="تعديل">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            </button>
                            <button class="delete-btn p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="حذف">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </td>
                `;

                // أحداث الحذف والتعديل
                const deleteBtn = tr.querySelector('.delete-btn');
                const editBtn = tr.querySelector('.edit-btn');
                const rateCell = tr.querySelector('.rate-cell');

                deleteBtn.addEventListener('click', async () => {
                    if (confirm(`هل أنت متأكد من حذف العمولة: ${rate.commission_rate}؟`)) {
                        try {
                            await CommissionsAPI.deleteCommissionRate(rate.id);
                            showToast('تم الحذف بنجاح');
                            loadCommissions();
                        } catch (err) {
                            showToast('حدث خطأ أثناء الحذف: ' + err.message, 'error');
                        }
                    }
                });

                editBtn.addEventListener('click', () => {
                    // تحويل الخلايا إلى وضع التعديل (Inputs)
                    const currentRate = rate.commission_rate;

                    rateCell.innerHTML = `<input type="number" step="0.001" class="edit-rate-input w-24 border border-gray-300 rounded p-1 text-sm outline-none focus:border-blue-500 text-left" dir="ltr" value="${currentRate}">`;
                    
                    // تغيير الأزرار إلى حفظ وإلغاء
                    const actionContainer = editBtn.parentElement;
                    actionContainer.classList.remove('opacity-0');
                    actionContainer.innerHTML = `
                        <button class="save-btn p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors font-bold text-sm">حفظ</button>
                        <button class="cancel-btn p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors text-sm">إلغاء</button>
                    `;

                    actionContainer.querySelector('.cancel-btn').addEventListener('click', () => {
                        loadCommissions(); // إعادة التحميل تُلغي التعديلات
                    });

                    actionContainer.querySelector('.save-btn').addEventListener('click', async () => {
                        const newRate = parseFloat(rateCell.querySelector('.edit-rate-input').value);

                        if (isNaN(newRate) || newRate < 0) {
                            showToast('يرجى إدخال بيانات صحيحة', 'error');
                            return;
                        }

                        try {
                            await CommissionsAPI.updateCommissionRateData(rate.id, newRate);
                            showToast('تم تحديث العمولة بنجاح');
                            loadCommissions();
                        } catch (err) {
                            showToast('حدث خطأ أثناء التحديث: ' + err.message, 'error');
                        }
                    });
                });

                tableBody.appendChild(tr);
            });
        } catch (error) {
            console.error(error);
            tableBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-red-500">حدث خطأ أثناء جلب البيانات</td></tr>`;
        }
    }

    // إضافة عمولة جديدة
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rateInput = document.getElementById('newCommissionRate');
        
        const rate = parseFloat(rateInput.value);

        if (isNaN(rate) || rate < 0) {
            showToast('البيانات غير صالحة', 'error');
            return;
        }

        const submitBtn = addForm.querySelector('button[type="submit"]');
        const originalHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = 'جاري الإضافة...';
        submitBtn.disabled = true;

        try {
            await CommissionsAPI.insertCommissionRate(rate);
            showToast('تمت إضافة العمولة بنجاح!');
            addForm.reset();
            loadCommissions();
        } catch (error) {
            showToast('خطأ: ' + error.message, 'error');
        } finally {
            submitBtn.innerHTML = originalHtml;
            submitBtn.disabled = false;
        }
    });

    // تحميل مبدئي
    loadCommissions();
});
