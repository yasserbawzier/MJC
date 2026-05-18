// الكتالوج الموحد للمنتجات - منطق العمل والربط الفوري مع قاعدة البيانات

let allCatalogItems = []; // قائمة بجميع عناصر الفاتورة والمنتجات المجهزة
let countriesList = [];   // قائمة وجهات الشحن للفلاتر
let selectedProductsMap = new Map(); // خريطة لتتبع المنتجات المختارة للطلب

// عند تحميل الصفحة بالكامل
document.addEventListener('DOMContentLoaded', async () => {
    await initCatalogPage();
});

// تهيئة البيانات
async function initCatalogPage() {
    try {
        // 1. جلب البيانات بالتوازي السريع جداً لتحقيق تجربة مستخدم سريعة (تحت 200ms)
        const [
            { data: itemsData, error: itemsError },
            { data: productsData, error: productsError },
            { data: invoicesData, error: invoicesError },
            { data: customersData, error: customersError },
            { data: countriesData, error: countriesError }
        ] = await Promise.all([
            _supabase.from('invoice_items').select('*').order('created_at', { ascending: false }),
            _supabase.from('products').select('*'),
            _supabase.from('invoices').select('*'),
            _supabase.from('customers').select('id, customer_custom_id, full_name'),
            _supabase.from('shipping_rates').select('*')
        ]);

        if (itemsError) throw itemsError;
        if (productsError) throw productsError;
        if (invoicesError) throw invoicesError;
        if (customersError) throw customersError;
        if (countriesError) throw countriesError;

        // 2. بناء قواميس البحث (Lookup Maps) للربط السريع
        const productsMap = {};
        (productsData || []).forEach(p => productsMap[p.id] = p);

        const invoicesMap = {};
        (invoicesData || []).forEach(i => invoicesMap[i.id] = i);

        const customersMap = {};
        (customersData || []).forEach(c => customersMap[c.id] = c);

        const countriesMap = {};
        (countriesData || []).forEach(cr => countriesMap[cr.id] = cr);

        // تخزين قوائم الفلاتر
        countriesList = countriesData || [];
        customersList = customersData || [];
        invoicesList = invoicesData || [];

        // 3. تجهيز وحساب تفاصيل كل بند للكتالوج
        allCatalogItems = (itemsData || []).map(item => {
            const product = productsMap[item.product_id] || null;
            const invoice = invoicesMap[item.invoice_id] || null;
            const customer = invoice ? (customersMap[invoice.customer_id] || null) : null;
            const country = invoice ? (countriesMap[invoice.shipping_destination_id] || null) : null;

            // الحسابات الرياضية للأسعار الواصلة والعمولة كما في صفحة العمولات
            const factoryPrice = Number(item.factory_price_per_unit || 0);
            const moq = Number(item.quantity || 0);
            const shippingPerUnit = Number(item.shipping_price_per_unit || 0);
            const prodShippingUnit = factoryPrice + shippingPerUnit;

            // جلب تفاصيل طريقة حساب العمولة المخزنة محلياً للبند
            const noteVal = localStorage.getItem(`notes_commission_${item.id}`) || 'factory';
            const commissionRate = Number(item.fixed_commission_rate || 0);

            let commissionPerUnit = 0;
            if (commissionRate > 0) {
                if (noteVal === 'factory') {
                    commissionPerUnit = factoryPrice * commissionRate;
                } else {
                    commissionPerUnit = prodShippingUnit * commissionRate;
                }
            }

            const unitPriceUSD = prodShippingUnit + commissionPerUnit;
            const totalAmountUSD = unitPriceUSD * moq;

            return {
                ...item,
                product,
                invoice,
                customer,
                country,
                unitPriceUSD,
                totalAmountUSD,
                commissionRate
            };
        }).filter(item => item.product !== null); // إخفاء العناصر التي ليس لها منتج مربوط

        // 4. تعبئة قوائم خيارات التصفية (Dropdowns)
        populateFilterDropdowns();

        // 5. ربط أحداث التغيير والبحث
        setupEventListeners();

        // 6. عرض الكتالوج
        renderCatalog();

    } catch (err) {
        console.error('Error loading catalog data:', err);
        alert('حدث خطأ أثناء تحميل بيانات الكتالوج: ' + err.message);
    }
}

// تعبئة الفلاتر المنسدلة
function populateFilterDropdowns() {
    const countryFilter = document.getElementById('countryFilter');

    // وجهات الشحن
    const uniqueCountries = {};
    allCatalogItems.forEach(item => {
        if (item.country) {
            uniqueCountries[item.country.id] = `${item.country.country_name} (${item.country.country_code})`;
        }
    });
    Object.keys(uniqueCountries).forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = uniqueCountries[id];
        countryFilter.appendChild(option);
    });
}

// ربط أحداث البحث والتصفية
function setupEventListeners() {
    const inputs = ['searchInput', 'countryFilter', 'sortBy'];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            const eventType = element.tagName === 'SELECT' ? 'change' : 'input';
            element.addEventListener(eventType, renderCatalog);
        }
    });
}

// رسم وعرض الكتلولوج الفاخر
function renderCatalog() {
    const searchInput = document.getElementById('searchInput').value.trim().toLowerCase();
    const countryVal = document.getElementById('countryFilter').value;
    const sortBy = document.getElementById('sortBy').value;

    const catalogGrid = document.getElementById('catalogGrid');
    const noResults = document.getElementById('noResults');
    const loader = document.getElementById('loader');
    const itemsCountSpan = document.getElementById('itemsCount');

    // إخفاء مؤشر التحميل
    loader.classList.add('hidden');

    // 1. تصفية البيانات (Filtering)
    let filteredItems = allCatalogItems.filter(item => {
        // فلتر البحث النصي
        const matchesSearch = !searchInput ||
            (item.product.product_name || '').toLowerCase().includes(searchInput) ||
            (item.product.product_custom_id || '').toLowerCase().includes(searchInput) ||
            (item.item_name || '').toLowerCase().includes(searchInput) ||
            (item.country?.country_name || '').toLowerCase().includes(searchInput) ||
            (item.country?.country_code || '').toLowerCase().includes(searchInput) ||
            (item.size || '').toLowerCase().includes(searchInput) ||
            (item.specifications || '').toLowerCase().includes(searchInput);

        // فلتر بلد الشحن
        const matchesCountry = !countryVal || (item.country && item.country.id === countryVal);

        return matchesSearch && matchesCountry;
    });

    // 2. فرز وترتيب البيانات (Sorting)
    filteredItems.sort((a, b) => {
        if (sortBy === 'created_at_desc') {
            return new Date(b.created_at) - new Date(a.created_at);
        } else if (sortBy === 'unit_price_desc') {
            return b.unitPriceUSD - a.unitPriceUSD;
        } else if (sortBy === 'unit_price_asc') {
            return a.unitPriceUSD - b.unitPriceUSD;
        } else if (sortBy === 'quantity_desc') {
            return b.quantity - a.quantity;
        }
        return 0;
    });

    // تحديث عدد العناصر
    itemsCountSpan.textContent = filteredItems.length;

    // 3. عرض النتائج أو رسالة فارغة
    if (filteredItems.length === 0) {
        catalogGrid.classList.add('hidden');
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');
    catalogGrid.classList.remove('hidden');
    catalogGrid.innerHTML = '';

    // 4. بناء الكروت البرمجية الفاخرة لكل منتج
    filteredItems.forEach(item => {
        const product = item.product;

        // تفاصيل الصورة
        const imgUrl = product.product_image_url || 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=300&auto=format&fit=crop';

        // حساب عدد الكراتين الكلي
        const totalCtn = item.CTN !== null && item.CTN !== undefined
            ? item.CTN
            : (item.quantity && item.qty_per_ctn ? Math.ceil(item.quantity / item.qty_per_ctn) : '-');

        // وجهة الشحن
        const flagEmoji = item.country?.country_code === 'SA' ? '🇸🇦' :
            item.country?.country_code === 'AE' ? '🇦🇪' :
                item.country?.country_code === 'EG' ? '🇪🇬' : '🌍';
        const countryLabel = item.country
            ? `${flagEmoji} ${item.country.country_name}`
            : '🌍 وجهة غير محددة';

        // وسام نوع الطلب (عينة / إنتاج)
        let typeBadge = '';
        if (item.sample) {
            typeBadge += `<span class="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] px-1.5 py-0.5 rounded-md font-bold">عينة: ${item.sample}</span>`;
        }
        if (item.production) {
            typeBadge += `<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-1.5 py-0.5 rounded-md font-bold">إنتاج: ${item.production}</span>`;
        }
        if (!typeBadge) {
            typeBadge = `<span class="bg-slate-50 text-slate-500 border border-slate-200 text-[10px] px-1.5 py-0.5 rounded-md font-medium">-</span>`;
        }

        // إنشاء كارت زجاجي فاخر بنمط hover ناعم وعميق
        const card = document.createElement('div');
        card.className = 'glass-card rounded-2xl overflow-hidden premium-shadow premium-hover flex flex-col justify-between border border-slate-200/50';

        // كود الكرت
        card.innerHTML = `
            <div>
                <!-- صورة المنتج والوسوم العلوية -->
                <div onclick="openProductDetails('${item.id}')" class="relative h-56 w-full bg-slate-100 overflow-hidden group cursor-pointer">
                    <img src="${imgUrl}" alt="${product.product_name}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent"></div>
                    
                    <!-- رقم معرف المنتج المخصص -->
                    <span class="absolute top-3 right-3 bg-slate-950/80 backdrop-blur-md text-white text-[11px] font-black px-2.5 py-1 rounded-xl tracking-wide shadow-sm border border-white/10">
                        ${product.product_custom_id || '-'}
                    </span>
                    
                    <!-- بلد وجهة الشحن -->
                    <span class="absolute top-3 left-3 bg-white/95 backdrop-blur-md text-slate-800 text-[11px] font-extrabold px-2.5 py-1 rounded-xl shadow-sm border border-slate-100 flex items-center gap-1">
                        ${countryLabel}
                    </span>

                    <!-- اسم المنتج مع خلفية ناعمة -->
                    <div class="absolute bottom-3 right-3 left-3">
                        <h3 class="text-white text-base font-extrabold line-clamp-1 drop-shadow-sm">${product.product_name || 'اسم منتج افتراضي'}</h3>
                    </div>
                </div>

                <!-- تفاصيل ومواصفات المنتج الفنية -->
                <div class="p-4">
                    <div class="space-y-2 text-xs font-semibold text-slate-600">
                        
                        <!-- سطر المقاس والمواصفات -->
                        <div class="flex justify-between items-center py-1 border-b border-slate-100">
                            <span class="text-slate-400">المقاس / Size</span>
                            <span class="text-slate-800 font-extrabold">${item.size || '-'}</span>
                        </div>
                        
                        <!-- المواصفات الخاصة بالمنتج الأساسي -->
                        <div class="flex justify-between items-start py-1 border-b border-slate-100">
                            <span class="text-slate-400">المواصفات الأساسية</span>
                            <span class="text-slate-800 text-left max-w-[65%] line-clamp-1" title="${product.specifications || ''}">${product.specifications || '-'}</span>
                        </div>

                        <!-- المواصفات الخاصة بالبند (الفاتورة) -->
                        <div class="flex justify-between items-start py-1 border-b border-slate-100">
                            <span class="text-slate-400">مواصفات إضافية</span>
                            <span class="text-slate-800 text-left max-w-[65%] line-clamp-1" title="${item.specifications || ''}">${item.specifications || '-'}</span>
                        </div>

                        <!-- الكمية والوحدة -->
                        <div class="flex justify-between items-center py-1 border-b border-slate-100">
                            <span class="text-slate-400">الكمية والوحدة</span>
                            <span class="text-slate-800 font-extrabold">${Number(item.quantity || 0).toLocaleString()} ${item.unit_type || 'قطعة'}</span>
                        </div>

                        <!-- أبعاد الكرتون L*W*H -->
                        <div class="flex justify-between items-center py-1 border-b border-slate-100">
                            <span class="text-slate-400">الأبعاد (L×W×H) cm</span>
                            <span class="text-slate-800">${item.length_cm || 0} × ${item.width_cm || 0} × ${item.height_cm || 0}</span>
                        </div>

                        <!-- التعبئة (كم قطعة في الكرتون) -->
                        <div class="flex justify-between items-center py-1 border-b border-slate-100">
                            <span class="text-slate-400">التعبئة (لكل كرتون)</span>
                            <span class="text-slate-800 font-bold">${item.qty_per_ctn || 1} قطعة</span>
                        </div>

                        <!-- عدد الكراتين الإجمالي -->
                        <div class="flex justify-between items-center py-1">
                            <span class="text-slate-400">إجمالي الكراتين</span>
                            <span class="text-slate-800 font-bold">${totalCtn} كرتون</span>
                        </div>

                    </div>
                </div>
            </div>

            <!-- بطاقة التسعير الفاخرة للعميل (Landed Cost) -->
            <div class="p-4 pt-0">
                <div class="bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-xl p-3.5 border border-amber-100/70">
                    <div class="flex justify-between items-center mb-3">
                        ${(Number(item.shipping_price_per_unit) > 0 && Number(item.fixed_commission_rate) > 0) ? `
                        <div>
                            <span class="text-[10px] font-bold text-amber-600 block uppercase tracking-wide">السعر الواصل للعميل</span>
                            <span class="text-xl font-extrabold text-orange-600 tracking-tight">$${item.unitPriceUSD.toFixed(2)}</span>
                            <span class="text-[10px] text-slate-400 font-medium">/ للوحدة</span>
                        </div>
                        ` : (Number(item.shipping_price_per_unit) === 0 && Number(item.fixed_commission_rate) === 0 && Number(item.factory_price_per_unit) > 0) ? `
                        <div>
                            <span class="text-[10px] font-bold text-slate-500 block uppercase tracking-wide">سعر المصنع</span>
                            <span class="text-xl font-extrabold text-slate-700 tracking-tight">$${Number(item.factory_price_per_unit).toFixed(2)}</span>
                            <span class="text-[10px] text-slate-400 font-medium">/ للوحدة</span>
                        </div>
                        ` : `
                        <div>
                            <span class="text-[10px] font-bold text-slate-400 block uppercase tracking-wide">السعر</span>
                            <span class="text-sm font-extrabold text-slate-500 tracking-tight">يُحدد لاحقاً</span>
                        </div>
                        `}
                        <div class="text-left">
                            <span class="text-[10px] font-bold text-slate-400 block uppercase">الحد الأدنى (MOQ)</span>
                            <span class="text-base font-extrabold text-slate-800">${Number(item.quantity || 0).toLocaleString()}</span>
                        </div>
                    </div>

                    <!-- زر الإضافة للطلب -->
                    ${selectedProductsMap.has(item.id)
                ? `<button data-add-btn="${item.id}" onclick="toggleProductSelection(this, '${item.id}')" class="w-full py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 bg-emerald-600 text-white border border-emerald-600 hover:bg-emerald-700 shadow-sm active:scale-95">تم الاختيار <span class="text-lg">✅</span></button>`
                : `<button data-add-btn="${item.id}" onclick="toggleProductSelection(this, '${item.id}')" class="w-full py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 bg-white text-orange-600 border border-orange-200 hover:bg-orange-50 shadow-sm active:scale-95">إضافة للطلب <span class="text-lg">🛒</span></button>`
            }

                    <!-- لا يتم عرض ملاحظات داخلية عن تفاصيل عمولات المصنع للعميل -->
                </div>
            </div>
        `;
        catalogGrid.appendChild(card);
    });
}

// تبديل حالة إضافة المنتج لـ "سلة الطلبات"
window.toggleProductSelection = function (btn, itemId) {
    if (selectedProductsMap.has(itemId)) {
        selectedProductsMap.delete(itemId);
    } else {
        const item = allCatalogItems.find(i => i.id === itemId);
        if (item) selectedProductsMap.set(itemId, item);
    }
    
    // تحديث الزر الموجود في كرت الكتالوج الأصلي باستخدام الـ attribute
    const cardBtn = document.querySelector(`button[data-add-btn="${itemId}"]`);
    if (cardBtn) {
        if (selectedProductsMap.has(itemId)) {
            cardBtn.classList.remove('bg-white', 'text-orange-600', 'border-orange-200', 'hover:bg-orange-50');
            cardBtn.classList.add('bg-emerald-600', 'text-white', 'border-emerald-600', 'hover:bg-emerald-700');
            cardBtn.innerHTML = `تم الاختيار <span class="text-lg">✅</span>`;
        } else {
            cardBtn.classList.remove('bg-emerald-600', 'text-white', 'border-emerald-600', 'hover:bg-emerald-700');
            cardBtn.classList.add('bg-white', 'text-orange-600', 'border-orange-200', 'hover:bg-orange-50');
            cardBtn.innerHTML = `إضافة للطلب <span class="text-lg">🛒</span>`;
        }
    }
    
    updateCartUI();
};

// تحديث واجهة السلة العائمة
function updateCartUI() {
    const floatingCart = document.getElementById('floatingCartBtn');
    const cartCount = document.getElementById('cartItemsCount');

    if (!floatingCart || !cartCount) return;

    if (selectedProductsMap.size > 0) {
        cartCount.textContent = selectedProductsMap.size;
        floatingCart.classList.remove('translate-y-32', 'opacity-0');
        floatingCart.classList.add('translate-y-0', 'opacity-100');
    } else {
        floatingCart.classList.remove('translate-y-0', 'opacity-100');
        floatingCart.classList.add('translate-y-32', 'opacity-0');
    }
}

// -------------------------------------------------------------
// منطق نافذة الطلب وإرسال الواتساب (Order Modal & WhatsApp)
// -------------------------------------------------------------

window.openOrderModal = function () {
    if (selectedProductsMap.size === 0) return;

    const modal = document.getElementById('orderModal');
    const productsList = document.getElementById('orderProductsList');

    productsList.innerHTML = '';

    // إنشاء الحقول لكل منتج مختار
    selectedProductsMap.forEach((item, id) => {
        const product = item.product;
        const imgUrl = product.product_image_url || 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=300&auto=format&fit=crop';
        const minQty = Number(item.quantity || 1);

        const html = `
            <div class="flex flex-col sm:flex-row gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/60" data-product-id="${id}">
                <!-- صورة ومعرف المنتج -->
                <div class="w-full sm:w-32 shrink-0">
                    <img src="${imgUrl}" class="w-full h-24 object-cover rounded-xl border border-slate-200">
                    <div class="mt-2 text-center text-[10px] font-black bg-slate-200 text-slate-700 px-2 py-1 rounded-lg shadow-sm">
                        ID: ${product.product_custom_id || '-'}
                    </div>
                </div>
                
                <!-- حقول التعبئة -->
                <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="sm:col-span-2">
                        <h4 class="text-sm font-extrabold text-slate-800 line-clamp-1">${product.product_name}</h4>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 mb-1">المقاس المطلوب *</label>
                        <input type="text" class="product-size w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-orange-500 outline-none transition" placeholder="مثال: ${item.size || 'اكتب المقاس هنا'}">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 mb-1">المواصفات الخاصة</label>
                        <input type="text" class="product-specs w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-orange-500 outline-none transition" placeholder="مواصفات أو ملاحظات إضافية">
                    </div>
                    <div class="sm:col-span-2">
                        <label class="block text-[10px] font-bold text-slate-500 mb-1">الكمية المطلوبة (الحد الأدنى للطلب: ${minQty}) *</label>
                        <input type="number" min="${minQty}" value="${minQty}" class="product-qty w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-orange-500 outline-none transition" placeholder="الكمية المطلوبة">
                    </div>
                </div>
            </div>
        `;
        productsList.insertAdjacentHTML('beforeend', html);
    });

    // إظهار النافذة بحركة ناعمة
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.querySelector('.bg-white').classList.remove('scale-95');
};

window.closeOrderModal = function () {
    const modal = document.getElementById('orderModal');
    modal.classList.add('opacity-0', 'pointer-events-none');
    modal.querySelector('.bg-white').classList.add('scale-95');
};

window.submitOrderViaWhatsApp = function () {
    // 1. التحقق من بيانات العميل
    const name = document.getElementById('orderClientName').value.trim();
    const whatsapp = document.getElementById('orderClientWhatsapp').value.trim();
    const company = document.getElementById('orderClientCompany').value.trim();
    const industry = document.getElementById('orderClientIndustry').value.trim();
    const country = document.getElementById('orderClientCountry').value.trim();
    const city = document.getElementById('orderClientCity').value.trim();

    if (!name || !whatsapp || !country || !city) {
        alert("يرجى تعبئة البيانات الشخصية الأساسية (الاسم، الواتساب، بلد الشحن، والمدينة).");
        return;
    }

    // 2. التحقق من بيانات المنتجات
    const productsList = document.getElementById('orderProductsList').children;
    let orderDetails = [];

    for (let i = 0; i < productsList.length; i++) {
        const card = productsList[i];
        const id = card.getAttribute('data-product-id');
        const item = selectedProductsMap.get(id);

        const size = card.querySelector('.product-size').value.trim();
        const specs = card.querySelector('.product-specs').value.trim();
        const qty = parseInt(card.querySelector('.product-qty').value.trim());
        const minQty = Number(item.quantity || 1);

        if (!size) {
            alert(`يرجى تحديد المقاس المطلوب للمنتج: ${item.product.product_name}`);
            return;
        }

        if (isNaN(qty) || qty < minQty) {
            alert(`الكمية المطلوبة للمنتج (${item.product.product_name}) يجب أن تكون أكبر من أو تساوي الحد الأدنى (${minQty}).`);
            return;
        }

        orderDetails.push({
            name: item.product.product_name,
            customId: item.product.product_custom_id || '-',
            size: size,
            specs: specs || 'لا توجد ملاحظات إضافية',
            qty: qty
        });
    }

    // 3. صياغة وتنسيق رسالة الواتساب
    let text = `*طلب تسعيرة/شراء من الكتالوج* 📦\n\n`;
    text += `*البيانات الشخصية:*\n`;
    text += `👤 الاسم: ${name}\n`;
    text += `📞 الواتساب: ${whatsapp}\n`;
    if (company) text += `🏢 الشركة: ${company}\n`;
    if (industry) text += `⚙️ المجال: ${industry}\n`;
    text += `🌍 بلد الشحن: ${country}\n`;
    text += `🏙️ المدينة: ${city}\n`;

    text += `\n*المنتجات المطلوبة (${orderDetails.length} منتجات):*\n`;
    text += `---------------------------\n`;

    orderDetails.forEach((prod, index) => {
        text += `${index + 1}. *${prod.name}*\n`;
        text += `   - رمز المنتج (ID): ${prod.customId}\n`;
        text += `   - المقاس: ${prod.size}\n`;
        text += `   - المواصفات: ${prod.specs}\n`;
        text += `   - الكمية المطلوبة: ${prod.qty}\n`;
        text += `---------------------------\n`;
    });

    text += `\nشكراً لكم.. في انتظار التواصل معي.`;

    // 4. إرسال الطلب (قم بوضع رقم هاتف الإدارة هنا، أو اترك الرابط هكذا ليفتح التطبيق مباشرة)
    const adminPhone = "8615374040520"; // أدخل رقم الهاتف هنا إذا رغبت بأن يوجه النظام العميل مباشرة لك، مثال: "966500000000"
    const encodedText = encodeURIComponent(text);

    let waUrl = `https://wa.me/${adminPhone}?text=${encodedText}`;

    window.open(waUrl, '_blank');
};

// -------------------------------------------------------------
// نافذة التفاصيل المكبرة (Product Quick View)
// -------------------------------------------------------------

window.openProductDetails = function(itemId) {
    const item = allCatalogItems.find(i => i.id === itemId);
    if (!item) return;

    const modal = document.getElementById('productDetailsModal');
    const product = item.product;
    
    // تعبئة الصور والبيانات الأساسية
    document.getElementById('detailImage').src = product.product_image_url || 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=300&auto=format&fit=crop';
    document.getElementById('detailCustomId').textContent = product.product_custom_id || '-';
    
    const flagEmoji = item.country?.country_code === 'SA' ? '🇸🇦' : 
                      item.country?.country_code === 'AE' ? '🇦🇪' : 
                      item.country?.country_code === 'EG' ? '🇪🇬' : '🌍';
    document.getElementById('detailCountry').innerHTML = item.country ? `${flagEmoji} ${item.country.country_name}` : '🌍 وجهة غير محددة';
    
    document.getElementById('detailProductName').textContent = product.product_name || 'اسم منتج غير متوفر';
    document.getElementById('detailSize').textContent = item.size || '-';
    document.getElementById('detailQty').textContent = `${Number(item.quantity || 0).toLocaleString()} ${item.unit_type || 'قطعة'}`;
    document.getElementById('detailProductSpecs').textContent = product.specifications || '-';
    document.getElementById('detailSpecs').textContent = item.specifications || '-';
    document.getElementById('detailDims').textContent = `${item.length_cm || 0} × ${item.width_cm || 0} × ${item.height_cm || 0}`;
    
    const totalCtn = item.CTN !== null && item.CTN !== undefined ? item.CTN : (item.quantity && item.qty_per_ctn ? Math.ceil(item.quantity / item.qty_per_ctn) : '-');
    document.getElementById('detailQtyPerCarton').textContent = `${item.qty_per_ctn || 1} قطعة`;
    document.getElementById('detailTotalCartons').textContent = `${totalCtn} كرتون`;
    
    const priceLabelElement = document.getElementById('detailPriceLabel');
    const priceValueElement = document.getElementById('detailUnitPrice');
    
    const hasFullPricing = (Number(item.shipping_price_per_unit) > 0 && Number(item.fixed_commission_rate) > 0);
    const isFactoryOnly = (Number(item.shipping_price_per_unit) === 0 && Number(item.fixed_commission_rate) === 0 && Number(item.factory_price_per_unit) > 0);

    if (hasFullPricing) {
        priceLabelElement.textContent = 'السعر الواصل للعميل';
        priceLabelElement.className = 'text-[10px] font-bold text-amber-600 block uppercase tracking-wide';
        priceValueElement.textContent = `$${item.unitPriceUSD.toFixed(2)}`;
        priceValueElement.className = 'text-3xl font-extrabold text-orange-600 tracking-tight';
    } else if (isFactoryOnly) {
        priceLabelElement.textContent = 'سعر المصنع';
        priceLabelElement.className = 'text-[10px] font-bold text-slate-500 block uppercase tracking-wide';
        priceValueElement.textContent = `$${Number(item.factory_price_per_unit).toFixed(2)}`;
        priceValueElement.className = 'text-3xl font-extrabold text-slate-700 tracking-tight';
    } else {
        priceLabelElement.textContent = 'السعر';
        priceLabelElement.className = 'text-[10px] font-bold text-slate-400 block uppercase tracking-wide';
        priceValueElement.textContent = 'يُحدد لاحقاً';
        priceValueElement.className = 'text-xl font-extrabold text-slate-400 tracking-tight mt-1 inline-block';
    }

    document.getElementById('detailMoq').textContent = Number(item.quantity || 0).toLocaleString();

    // تحديث زر إضافة للطلب داخل النافذة الكبيرة ليطابق الحالة الحالية
    renderDetailActionButton(item.id);

    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.querySelector('.bg-white').classList.remove('scale-95');
};

window.closeProductDetails = function() {
    const modal = document.getElementById('productDetailsModal');
    modal.classList.add('opacity-0', 'pointer-events-none');
    modal.querySelector('.bg-white').classList.add('scale-95');
};

window.renderDetailActionButton = function(itemId) {
    const container = document.getElementById('detailActionButtonContainer');
    if (!container) return;
    
    // إعادة بناء الزر ليتوافق مع حالة السلة وتمرير الـ ID لـ toggleProductSelection
    if (selectedProductsMap.has(itemId)) {
        container.innerHTML = `<button onclick="toggleProductSelection(null, '${itemId}'); renderDetailActionButton('${itemId}')" class="w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-300 bg-emerald-600 text-white border border-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 active:scale-95">تم الاختيار بنجاح بطلبك <span class="text-xl">✅</span></button>`;
    } else {
        container.innerHTML = `<button onclick="toggleProductSelection(null, '${itemId}'); renderDetailActionButton('${itemId}')" class="w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-300 bg-orange-600 text-white border border-orange-600 hover:bg-orange-700 shadow-lg shadow-orange-600/20 active:scale-95">إضافة للطلب الآن <span class="text-xl">🛒</span></button>`;
    }
};
