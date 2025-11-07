const { createClient } = require('@supabase/supabase-js');

// Supabase 配置
const supabaseUrl = process.env.SUPABASE_URL || 'https://xgdfwbqcjmjxdsxvmgot.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnZGZ3YnFjam1qeGRzeHZtZ290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNzk5MDgsImV4cCI6MjA3Nzk1NTkwOH0.YXHXZc71Ivl6WchD_1yNK7-wOVE0cxF5_uAqZCqR6Xw';

// 创建 Supabase 客户端
const supabase = createClient(supabaseUrl, supabaseAnonKey);

module.exports = { supabase };

