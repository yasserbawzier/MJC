/**
 * async: تعني "غير متزامن". نضعها قبل الدالة لأننا سنستخدم بداخلها أمر جلب بيانات من الإنترنت 
 * يحتاج لوقت للانتظار، وبدونها سيتجمد المتصفح حتى ينتهي الطلب.
 * function: الكلمة المحجوزة لتعريف دالة (مهمة محددة).
 * هذا الملف مرتبط مباشرة بملف Customers.html:
 * - يعتمد على وجود عناصر HTML بمعرفات مثل customersTableBody و addCustomerForm و editCustomerForm.
 * - يعتمد على المتغير _supabase الذي تم تعريفه في App.js.
 */
async function checkAndLoadCustomers() {
    const tableBody = document.getElementById('customersTableBody');
    tableBody.innerHTML = '<tr><td colspan="7" class="p-4 text-center">جاري التحقق من الاتصال...</td></tr>';

    try {
        // جلب جميع البيانات من جدول customers وترتيبها من الأحدث للأقدم
        const { data, error } = await _supabase
            .from('customers')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("فشل الاتصال بـ Supabase:", error.message);
            tableBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-red-500">خطأ: ${error.message}</td></tr>`;
            return;
        }

        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-500">لا يوجد عملاء حالياً.</td></tr>';
            return;
        }

        // مسح محتوى الجدول القديم للبدء برسم البيانات الجديدة
        tableBody.innerHTML = '';
        
       /**
 * هذا الجزء داخل حلقة data.forEach في ملف customers.js
 */
// data.forEach: تكرار على كل عميل مستلم من قاعدة البيانات.
// customer => { ... }: كل دورة تعطينا كائن عميل واحد.
data.forEach(customer => {
    // createElement('tr'): إنشاء صف جدول جديد لكل عميل.
    const row = document.createElement('tr');
    // className: إضافة تنسيقات Tailwind للصف (حدود، تحويم، مؤثرات).
    row.className = "border-b hover:bg-blue-50 transition cursor-pointer relative group";

    row.innerHTML = `
        <td class="p-4 text-sm text-gray-500">${customer.customer_custom_id || '-'}</td>
        <td class="p-4 font-bold text-gray-800">${customer.full_name || 'بدون اسم'}</td>
        <td class="p-4 font-mono text-sm">${customer.phone || '-'}</td>
        <td class="p-4">${customer.country_code || '-'}</td>
        <td class="p-4">${customer.company_name || '-'}</td>
        <td class="p-4">${customer.company_field || '-'}</td>
        <td class="p-4 text-left whitespace-nowrap">
            <!-- زر التعديل (Edit Button) -->
            <!-- نمرر customer.id (UUID) لكي نعرف من هو العميل المطلوب تعديله -->
            <button 
                onclick="event.stopPropagation(); openEditModal('${customer.id}')" 
                class="opacity-0 group-hover:opacity-100 bg-blue-600 text-white px-3 py-1 rounded shadow-sm hover:bg-blue-700 transition-all text-sm ml-2"
            >
                تعديل
            </button>

            <!-- زر الحذف (Delete Button) -->
            <button 
                onclick="event.stopPropagation(); deleteThisCustomer('${customer.id}')" 
                class="opacity-0 group-hover:opacity-100 bg-red-600 text-white px-3 py-1 rounded shadow-sm hover:bg-red-700 transition-all text-sm"
            >
                حذف
            </button>
        </td>
    `;
    tableBody.appendChild(row);
});

        console.log("تم تحديث الجدول بنجاح! ✅");

    } catch (err) {
        console.error("خطأ غير متوقع:", err);
    }
}
/**
 * دالة لإظهار النافذة المنبثقة
 */
function showAddModal() {
    // إزالة كلاس hidden ليتمكن المتصفح من رسم النافذة فوق الصفحة
    document.getElementById('addCustomerModal').classList.remove('hidden');
}

/**
 * closeModal:
 * دالة عامة لإغلاق أي نافذة منبثقة (Modal) بالاعتماد على الـ ID.
 * modalId: معرف النافذة المطلوب إغلاقها.
 * formId: (اختياري) معرف الفورم المراد عمل reset له بعد الإغلاق.
 * clearEditingState: (اختياري) تصفير معرف العميل الجاري تعديله.
 */
function closeModal(modalId, formId = null, clearEditingState = false) {
    // modalId: معرف نافذة HTML المطلوب إخفاؤها.
    // formId = null: قيمة افتراضية تعني "لا يوجد فورم لإعادة تعيينه" ما لم نمرر واحدًا.
    // clearEditingState = false: افتراضيًا لا نمسح معرف العميل الجاري تعديله.
    const modalElement = document.getElementById(modalId);
    // if (modalElement): نتحقق أن العنصر موجود فعلاً قبل التعديل عليه.
    if (modalElement) modalElement.classList.add('hidden');

    // if (formId): ندخل هذا الجزء فقط إذا أرسلنا معرف فورم.
    if (formId) {
        // formElement: عنصر الفورم المراد إعادة تعيينه.
        const formElement = document.getElementById(formId);
        // reset(): يعيد الحقول لحالتها الافتراضية.
        if (formElement) formElement.reset();
    }

    // إذا طُلب تصفير حالة التعديل، نحذف المعرف المخزن في window.
    if (clearEditingState) {
        window.currentEditingId = null;
    }
}

/**
 * closeAddModal:
 * واجهة سهلة لاستخدام الدالة العامة مع نافذة الإضافة.
 */
function closeAddModal() {
    closeModal('addCustomerModal', 'addCustomerForm');
}
 

/**
 * نربط هذا الكود بحدث "submit" الخاص بالفورم الموجود في HTML
 * لمنع الصفحة من التحديث (Refresh) عند الضغط على زر حفظ.
 */
// getElementById('addCustomerForm'): جلب فورم الإضافة من Customers.html.
// addEventListener('submit', ...): ربط دالة تعمل عند الضغط على زر الإرسال.
document.getElementById('addCustomerForm').addEventListener('submit', async (e) => {
    
    // 1. e.preventDefault(): تمنع المتصفح من القيام بسلوكه الافتراضي (وهو إعادة تحميل الصفحة)
    e.preventDefault();

// 1. الوصول إلى زر الحفظ داخل الفورم لكي نتحكم به
    const submitBtn = e.target.querySelector('button[type="submit"]');
// 2. تفعيل "حالة التحميل" ومنع النقر المزدوج:
    // .disabled = true: تجعل الزر غير قابل للضغط تماماً، وهذا يحل مشكلة التكرار التي واجهتها
    submitBtn.disabled = true;
    // .innerText: نغير النص داخل الزر لإعطاء انطباع للمستخدم أن العملية جارية
    submitBtn.innerText = "جاري الحفظ...";
    // إضافة كلاس opacity لكي يبدو الزر باهتاً بصرياً (إشارة للمستخدم)
    submitBtn.classList.add('opacity-50', 'cursor-not-allowed');

    // 2. الحصول على القيم التي كتبها المستخدم داخل مربعات الإدخال (Inputs)
    // نستخدم .value لجلب النص المكتوب داخل كل عنصر بواسطة الـ ID الخاص به
    const name = document.getElementById('custName').value;
    const phone = document.getElementById('custPhone').value;
    const country = document.getElementById('custCountry').value;
    const company = document.getElementById('custCompanyName').value;
    const field = document.getElementById('custField').value;

    try {
        // 3. أمر الإدراج (Insert) في سوبابيز
        // - from('customers'): نحدد الجدول الهدف
        // - insert([{ ... }]): نرسل مصفوفة تحتوي على كائن (Object) بأسماء الأعمدة كما هي في القاعدة
        // ملاحظة: لا نرسل ID لأن القاعدة تولده تلقائياً بفضل gen_random_uuid()
        const { data, error } = await _supabase
            .from('customers')
            .insert([
                { 
                    full_name: name, 
                    phone: phone, 
                    country_code: country, 
                    company_name: company,
                    company_field: field 
                }
            ]);

        // 4. التحقق من وجود خطأ أثناء الإرسال
        if (error) throw error;

        // 5. إذا نجح الحفظ:
        alert("تم حفظ العميل بنجاح! ✅");
        
        // إغلاق النافذة المنبثقة (نستدعي الدالة التي كتبناها سابقاً في نفس الملف)
        closeAddModal(); 
        
        // إعادة تحديث الجدول لعرض العميل الجديد فوراً دون الحاجة لعمل Refresh يدوي
        checkAndLoadCustomers(); 

    } catch (err) {
        console.error("خطأ في الحفظ:", err.message);
        alert("حدث خطأ أثناء الحفظ: " + err.message);
    }finally {
        /**
         * finally: هذا الجزء يتنفذ دائماً سواء نجح الحفظ أو فشل
         * وظيفته: إعادة الزر لحالته الطبيعية ليتمكن المستخدم من استخدامه مرة أخرى
         */
        submitBtn.disabled = false;
        submitBtn.innerText = "حفظ العميل";
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
});

/**
 * deleteThisCustomer: الدالة المسؤولة عن الحذف الفعلي.
 * targetUuid: هو الـ UUID الذي أرسلناه من الزر المخفي.
 */
async function deleteThisCustomer(targetUuid) {
    
    // 1. confirm: رسالة تأكيد لحماية البيانات من الحذف الخاطئ.
    if (!confirm("هل أنت متأكد من رغبتك في حذف هذا العميل نهائياً؟")) return;

    try {
        /**
         * _supabase: العميل المعرف في app.js.
         * .delete(): أمر الحذف.
         * .eq('id', targetUuid): البحث عن السطر الذي يطابق الـ UUID الممرر.
         * ملاحظة: سوبابيز يبحث في عمود id (الذي هو UUID) ويحذف السطر فوراً.
         */
        const { error } = await _supabase
            .from('customers')
            .delete()
            .eq('id', targetUuid);

        // 2. التحقق من الخطأ.
        if (error) throw error;

        // 3. النجاح وتحديث الواجهة.
        alert("تم الحذف بنجاح! ✅");
        
        // إعادة تحميل الدالة لعرض الجدول المحدث.
        checkAndLoadCustomers();

    } catch (err) {
        console.error("فشل في الحذف:", err.message);
        alert("حدث خطأ أثناء محاولة الحذف.");
    }
}
/**
 * openEditModal: وظيفتها فتح نافذة التعديل وجلب بيانات العميل من سوبابيز
 * uuid: المعرف الفريد الذي ضغطنا عليه في الجدول
 */
async function openEditModal(uuid) {
    try {
        // 1. جلب بيانات هذا العميل تحديداً باستخدام الـ UUID
        const { data, error } = await _supabase
            .from('customers')
            .select('*')
            .eq('id', uuid)
            .single(); // جلب سطر واحد فقط

        if (error) throw error;

        // 2. تعبئة الحقول في نافذة التعديل بالبيانات القادمة من السيرفر
        document.getElementById('editCustName').value = data.full_name;
        document.getElementById('editCustPhone').value = data.phone;
        document.getElementById('editCustCountry').value = data.country_code;
        document.getElementById('editCustCompanyName').value = data.company_name;
        document.getElementById('editCustField').value = data.company_field;
        // ... وهكذا لبقية الحقول

        // 3. تخزين الـ UUID في حقل مخفي أو متغير لكي نعرف من سنحدث لاحقاً
        window.currentEditingId = uuid;

        // 4. إظهار النافذة:
        // classList.remove('hidden'): إزالة كلاس الإخفاء من مودال التعديل الموجود في Customers.html.
        document.getElementById('editCustomerModal').classList.remove('hidden');

    } catch (err) {
        alert("فشل جلب بيانات العميل: " + err.message);
    }
}

/**
 * closeEditModal:
 * إغلاق نافذة التعديل وتنظيف حالة العميل الجاري تعديله.
 */
function closeEditModal() {
    // نستخدم الدالة العامة نفسها، لكن هنا لمودال التعديل.
    // null: لا نحتاج reset لفورم التعديل هنا.
    // true: نحتاج تصفير currentEditingId بعد الإغلاق.
    closeModal('editCustomerModal', null, true);
}

/**
 * updateEditedCustomerData:
 * دالة مسؤولة عن أخذ البيانات الجديدة من نموذج التعديل
 * ثم إرسال أمر "تحديث" إلى قاعدة البيانات للعميل الذي تغيّرت بياناته.
 */
async function updateEditedCustomerData(e) {
    // e: يمثل حدث الإرسال القادم من الفورم (submit event)
    // preventDefault: يمنع السلوك الافتراضي للمتصفح (إعادة تحميل الصفحة)
    e.preventDefault();

    // currentEditingId: المتغير الذي خزّناه عند فتح نافذة التعديل لمعرفة العميل المستهدف
    const targetCustomerId = window.currentEditingId;

    // if: شرط تحقق قبل البدء في التحديث
    // !targetCustomerId: يعني لا يوجد معرف عميل محفوظ حاليًا
    if (!targetCustomerId) {
        alert("لا يوجد عميل محدد للتعديل.");
        return; // return: إيقاف تنفيذ الدالة فورًا
    }

    // getElementById: جلب حقول الإدخال من نموذج التعديل بواسطة المعرف
    // .value: قراءة النص الذي أدخله المستخدم داخل كل حقل
    const editedName = document.getElementById('editCustName').value;
    const editedPhone = document.getElementById('editCustPhone').value;
    const editedCountry = document.getElementById('editCustCountry').value;
    const editedCompany = document.getElementById('editCustCompanyName').value;
    const editedField = document.getElementById('editCustField').value;

    // querySelector: جلب زر الحفظ داخل نفس الفورم الذي تم إرساله
    // e.target: هو عنصر الفورم الحالي
    const submitBtn = e.target.querySelector('button[type="submit"]');

    // تعطيل الزر مؤقتًا لتجنب الضغط المتكرر أثناء التنفيذ
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "جاري التحديث...";
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    try {
        /**
         * _supabase: عميل الاتصال بقاعدة البيانات
         * .from('customers'): تحديد الجدول المستهدف
         * .update({...}): القيم الجديدة التي نريد حفظها بدل القديمة
         * .eq('id', targetCustomerId): تحديث السجل الذي يحمل نفس المعرّف فقط
         */
        const { error } = await _supabase
            .from('customers')
            .update({
                full_name: editedName,
                phone: editedPhone,
                country_code: editedCountry,
                company_name: editedCompany,
                company_field: editedField
            })
            .eq('id', targetCustomerId);

        // إذا رجعت القاعدة بخطأ نوقف المسار الناجح ونرمي الخطأ إلى catch
        if (error) throw error;

        // نجاح العملية: رسالة للمستخدم + إخفاء نافذة التعديل + إعادة تحميل الجدول
        alert("تم تحديث بيانات العميل بنجاح! ✅");
        closeEditModal();
        checkAndLoadCustomers();

    } catch (err) {
        // معالجة الأخطاء: طباعة الخطأ في الكونسول + تنبيه المستخدم
        console.error("فشل في تحديث العميل:", err.message);
        alert("حدث خطأ أثناء تحديث بيانات العميل: " + err.message);
    } finally {
        // finally: ينفذ دائمًا سواء نجحت العملية أو فشلت
        // إعادة الزر إلى حالته الطبيعية ليصبح قابلًا للاستخدام مرة أخرى
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "حفظ التعديلات";
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

/**
 * ربط دالة التحديث بنموذج التعديل:
 * إذا كان الفورم موجودًا في الصفحة، نربطه بحدث الإرسال submit.
 */
const editCustomerForm = document.getElementById('editCustomerForm');
// if (editCustomerForm): حماية من الخطأ لو الفورم غير موجود في الصفحة.
if (editCustomerForm) {
    // submit: عند حفظ التعديلات نستدعي دالة التحديث.
    editCustomerForm.addEventListener('submit', updateEditedCustomerData);
}
/**
 * استدعاء الدالة: بدون هذا السطر لن يحدث شيء، نحن هنا نعطي الأمر "ابدأ العمل الآن".
 */
checkAndLoadCustomers();