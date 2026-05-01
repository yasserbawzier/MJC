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
// supabase: كائن عالمي توفره مكتبة @supabase/supabase-js المحملة في Customers.html.
// .createClient(...): دالة تنشئ "عميل اتصال" مرتبطًا بالمشروع.
// (SUPABASE_URL, SUPABASE_KEY): نمرر رابط المشروع والمفتاح حتى يعرف العميل أين يرسل الطلبات وبأي صلاحية.
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// console.log: طباعة رسالة في أدوات المطور (Console) للتأكد أن ملف الاتصال اشتغل.
// هذه الرسالة لا تؤثر على المنطق، فقط للمراقبة أثناء التطوير.
console.log("تم تفعيل نظام الربط بنجاح ✅");