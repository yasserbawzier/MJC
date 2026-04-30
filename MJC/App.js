// إعدادات الاتصال بـ Supabase
const SUPABASE_URL = 'https://viqfpibqtlzxnnmspsnj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpcWZwaWJxdGx6eG5ubXNwc25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzc2MTMsImV4cCI6MjA5Mjk1MzYxM30.3NyT5zirXVy2BEpvaRNrcStAOSO5f7BIMO_-FIc4H9U';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("تم تفعيل نظام الربط بنجاح ✅");