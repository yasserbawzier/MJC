
const fs = require('fs');
let lines = fs.readFileSync('invoice_items_hot.js', 'utf8').split('\n');

const startIndex = lines.findIndex(l => l.startsWith('//  ÕœÌÀ Õﬁ· ›—œÌ ·⁄‰’— «·›« Ê—… „»«‘—… „‰ «·ÃœÊ·'));
const endIndex = lines.findIndex(l => l.startsWith('let activePhotoItemId = null;')) - 5; 

const newContent = \sync function handleHandsontableChange(changes, source) {
    if (!changes) return;

    for (let [row, prop, oldValue, newValue] of changes) {
        if (oldValue === newValue) continue;

        const itemsToRender = showOnlyActive
            ? invoiceItems.filter(item => item.status === true)
            : invoiceItems;
        
        const item = itemsToRender[row];
        if (!item) continue;

        const numericFields = ['quantity', 'factory_price_per_unit', 'qty_per_ctn', 'gw_per_ctn_kg', 'length_cm', 'width_cm', 'height_cm', 'CTN', 'shipping_price_per_unit'];
        if (numericFields.includes(prop)) {
            let numVal = parseFloat(newValue);
            if (isNaN(numVal)) numVal = 0;
            newValue = numVal;
        }

        if (prop === 'status') {
            newValue = (newValue === true || newValue === 'true' || newValue === 1);
        }

        item[prop] = newValue;

        const keepManualCtn = (prop === 'CTN');
        recalculateLocalItemFields(item, keepManualCtn, prop);

        let updatePayload = { [prop]: newValue };
        if (prop === 'quantity' || prop === 'qty_per_ctn') {
            updatePayload['CTN'] = item.CTN;
        }
        if (prop === 'shipping_price_per_unit') {
            updatePayload['total_shipping_cost'] = item.total_shipping_cost;
        }

        try {
            await _supabase.from('invoice_items').update(updatePayload).eq('id', item.id);
        } catch (err) {
            console.error('Save error:', err);
            showToast('? ›‘· Õ›Ÿ «· ⁄œÌ·: ' + err.message, 'error');
            item[prop] = oldValue;
        }
    }

    if (hotInstance) {
        hotInstance.render();
    }
    updateInvoiceItemsFooter();
}\.split('\n');

lines.splice(startIndex, endIndex - startIndex + 1, ...newContent);

fs.writeFileSync('invoice_items_hot.js', lines.join('\n'));
console.log('Replaced correctly using array splice.');

