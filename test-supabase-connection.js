// 测试 Supabase 连接
const { supabase } = require('./src/utils/supabase');

async function testConnection() {
    console.log('🔍 开始测试 Supabase 连接...\n');

    try {
        // 测试1: 检查 Supabase 客户端是否创建成功
        console.log('✅ Supabase 客户端已创建');

        // 测试2: 尝试获取当前会话（应该为空，因为未登录）
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
            console.error('❌ 获取会话失败:', sessionError.message);
        } else {
            console.log('✅ 会话检查成功（当前未登录）');
        }

        // 测试3: 测试数据库连接（查询 users 表）
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('count')
            .limit(1);

        if (usersError) {
            console.error('❌ 数据库连接失败:', usersError.message);
            console.error('   错误详情:', usersError);
        } else {
            console.log('✅ 数据库连接成功');
        }

        // 测试4: 检查表是否存在
        const tables = ['users', 'documents', 'translations', 'annotations'];
        for (const table of tables) {
            const { error } = await supabase
                .from(table)
                .select('id')
                .limit(1);
            
            if (error) {
                console.error(`❌ 表 "${table}" 不存在或无法访问:`, error.message);
            } else {
                console.log(`✅ 表 "${table}" 存在且可访问`);
            }
        }

        console.log('\n✨ 测试完成！');
        console.log('\n📝 下一步：');
        console.log('1. 启动应用: npm start');
        console.log('2. 在浏览器中打开应用');
        console.log('3. 测试注册新账号');
        console.log('4. 测试登录功能');

    } catch (error) {
        console.error('❌ 测试过程中出错:', error);
        console.error('   错误堆栈:', error.stack);
    }
}

testConnection();

