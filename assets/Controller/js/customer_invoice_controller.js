/**
 * customer_invoice_controller.js
 * Controller Layer for the Customer Invoice page.
 * Orchestrates API calls, state management, and UI updates.
 */

const ALL_COLUMNS = [
    { id: 'item', label: 'Item / مسلسل' },
    { id: 'productid', label: 'ProductID / رمز المنتج' },
    { id: 'productimage', label: 'Product Image / صورة المنتج' },
    { id: 'clientphoto', label: 'Client Photo / صورة العميل' },
    { id: 'designphoto', label: 'Design Photo / صورة التصميم' },
    { id: 'dielinephoto', label: 'Dieline Photo / صورة الدايلاين' },
    { id: 'designdetails', label: 'Design details / تفاصيل التصميم' },
    { id: 'size', label: 'Size / المقاس' },
    { id: 'specifications', label: 'Specifications / المواصفات' },
    { id: 'sample', label: 'Sample / العينة' },
    { id: 'production', label: 'Production / الإنتاج' },
    { id: 'moq', label: 'MOQ / الكمية المطلوبة' },
    { id: 'unit', label: 'Unit / الوحدة' },
    { id: 'unitprice', label: 'Unit Price USD / سعر القطعة واصل' },
    { id: 'totalamount', label: 'Total Amount USD / إجمالي الصنف واصل' },
    { id: 'qtyctn', label: 'Quantity/CTN / التعبئة لكل كرتون' },
    { id: 'ctn', label: 'CTN / الكراتين' },
    { id: 'gwctn', label: 'G.W./CTN KG / الوزن الإجمالي القائم' },
    { id: 'length', label: 'L / الطول (سم)' },
    { id: 'width', label: 'W / العرض (سم)' },
    { id: 'height', label: 'H / الارتفاع (سم)' },
    { id: 'cbmctn', label: 'CBM/CTN / حجم الكرتون' },
    { id: 'totalcbm', label: 'Total CBM / الحجم الكلي' }
];

const State = {
    currentInvoiceId: null,
    invoiceItems: [],
    productsLookup: {},
    itemPhotosLookup: {},
    showInactiveItems: false,
    columnVisibility: {}
};

const CustomerInvoiceController = {
    async init() {
        const params = new URLSearchParams(window.location.search);
        State.currentInvoiceId = params.get('invoice_id');

        if (!State.currentInvoiceId) {
            alert('حدث خطأ: معرف الفاتورة غير موجود في الرابط!');
            window.location.href = 'invoices.html';
            return;
        }

        const backBtn = document.getElementById('backToManagerViewLink');
        if (backBtn) {
            backBtn.href = `invoice_items.html?invoice_id=${State.currentInvoiceId}`;
        }

        // Initialize visibility state from localStorage
        ALL_COLUMNS.forEach(col => {
            const stored = localStorage.getItem(`col_visibility_${col.id}`);
            State.columnVisibility[col.id] = stored !== 'false'; 
        });

        CustomerInvoiceUI.initColumnSelectorPanel(ALL_COLUMNS, State.columnVisibility, (colId, isVisible) => {
            this.toggleColumnVisibility(colId, isVisible);
        });

        await this.loadData();
    },

    async loadData() {
        try {
            const [invoiceData, itemsData, productsData] = await Promise.all([
                CustomerInvoiceAPI.fetchInvoiceDetails(State.currentInvoiceId),
                CustomerInvoiceAPI.fetchInvoiceItems(State.currentInvoiceId),
                CustomerInvoiceAPI.fetchAllProducts()
            ]);

            productsData.forEach(p => { State.productsLookup[p.id] = p; });
            State.invoiceItems = itemsData;

            CustomerInvoiceUI.renderHeaderDetails(invoiceData, invoiceData.invoice_number || '-');

            const itemIds = State.invoiceItems.map(item => item.id).filter(Boolean);
            if (itemIds.length > 0) {
                const photosData = await CustomerInvoiceAPI.fetchItemPhotos(itemIds);
                photosData.forEach(photo => {
                    State.itemPhotosLookup[photo.item_id] = photo;
                });
            }

            this.render();

        } catch (err) {
            console.error('Error loading customer invoice:', err.message);
            alert('حدث خطأ أثناء معالجة الفاتورة للعميل: ' + err.message);
        }
    },

    render() {
        const itemsToRender = State.invoiceItems.filter(item => State.showInactiveItems ? true : item.status === true);
        const totals = CustomerInvoiceUI.renderItemsTable(itemsToRender, State.productsLookup, State.itemPhotosLookup);
        if (totals) {
            CustomerInvoiceUI.updateFooterTotals(totals);
        }

        this.applyAllColumnVisibilities();
        CustomerInvoiceUI.initResizableColumns();
    },

    toggleInactiveItems() {
        State.showInactiveItems = !State.showInactiveItems;
        CustomerInvoiceUI.updateToggleButton(State.showInactiveItems);
        this.render();
    },

    toggleColumnVisibility(colId, isVisible) {
        State.columnVisibility[colId] = isVisible;
        localStorage.setItem(`col_visibility_${colId}`, isVisible);
        CustomerInvoiceUI.applyColumnVisibility(colId, isVisible);
    },

    applyAllColumnVisibilities() {
        ALL_COLUMNS.forEach(col => {
            const isVisible = State.columnVisibility[col.id] !== false;
            CustomerInvoiceUI.applyColumnVisibility(col.id, isVisible);
        });
    },

    setAllColumns(isVisible) {
        ALL_COLUMNS.forEach(col => {
            this.toggleColumnVisibility(col.id, isVisible);
        });
    }
};

window.CustomerInvoiceController = CustomerInvoiceController;

document.addEventListener('DOMContentLoaded', () => {
    CustomerInvoiceController.init();
});

// Expose global methods for inline HTML handlers
window.toggleColumnSelector = CustomerInvoiceUI.toggleColumnSelector;
window.toggleInactiveItems = () => CustomerInvoiceController.toggleInactiveItems();
window.setAllColumns = (isVisible) => CustomerInvoiceController.setAllColumns(isVisible);
